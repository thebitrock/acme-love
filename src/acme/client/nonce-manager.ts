import { ServerInternalError } from '../errors/errors.js';
import type { HttpResponse } from '../http/http-client.js';

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<HttpResponse<any>>;

export interface NonceManagerOptions {
  /** Full URL of the newNonce endpoint (from directory), e.g. https://acme-v02.api.letsencrypt.org/acme/new-nonce */
  newNonceUrl: string;
  /** fetch-compatible function (node: globalThis.fetch / undici fetch) */
  fetch: FetchLike;
  /** How long to keep nonces, ms (protection against "stale" nonces); default: 5 minutes */
  maxAgeMs?: number;
  /** Maximum pool size per namespace; default: 32 */
  maxPool?: number;
}

/** One pool per namespace (typically: CA base + account KID/JWK thumbprint) */
type Namespace = string;

type StampedNonce = { value: string; ts: number };
type PendingWaiter = { resolve: (v: string) => void; reject: (e: unknown) => void };

export class NonceManager {
  private readonly newNonceUrl: string;
  private readonly fetch: FetchLike;
  private readonly maxAgeMs: number;
  private readonly maxPool: number;

  /** Pools by namespace */
  private pools = new Map<Namespace, StampedNonce[]>();

  /** Очередь ожидателей по неймспейсу */
  private pending = new Map<Namespace, PendingWaiter[]>();

  /** Флаг «идёт рефилл» по неймспейсу */
  private refilling = new Map<Namespace, boolean>();

  constructor(opts: NonceManagerOptions) {
    this.newNonceUrl = opts.newNonceUrl;
    this.fetch = opts.fetch;
    this.maxAgeMs = opts.maxAgeMs ?? 5 * 60_000;
    this.maxPool = opts.maxPool ?? 32;
  }

  /** Normalized namespace key: create your own strategy.
   *  Recommend: `${caBaseUrl}::${kidOrJwkThumbprint}` */
  static makeNamespace(caBaseUrl: string, kidOrThumb: string): Namespace {
    return `${caBaseUrl}::${kidOrThumb}`;
  }

  /** Takes a valid nonce: from the pool or via HEAD newNonce */
  async take(namespace: Namespace): Promise<string> {
    this.gc(namespace);

    const pool = this.pools.get(namespace) ?? [];

    // Take from the end - fresher
    while (pool.length) {
      const n = pool.pop()!;

      if (!this.isExpired(n.ts)) {
        this.pools.set(namespace, pool);

        return n.value;
      }
    }

    // Пула нет — становимся в очередь и запускаем рефилл
    return new Promise<string>((resolve, reject) => {
      const q = this.pending.get(namespace) ?? [];

      q.push({ resolve, reject });
      this.pending.set(namespace, q);
      this.ensureRefill(namespace);
    });
  }

  /** Положить nonce из ответа (делай это на КАЖДЫЙ ACME-ответ) */
  putFromResponse(namespace: Namespace, res: HttpResponse<any>): void {
    const raw = res.headers['replay-nonce'] || res.headers['Replay-Nonce'];

    if (!raw) {
      return;
    }

    if (Array.isArray(raw)) {
      for (const n of raw) {
        this.add(namespace, n);
      }
    } else {
      this.add(namespace, raw);
    }

    this.drain(namespace);
  }

  /** Универсальный раннер с автоповтором по badNonce.
   *  fn ДОЛЖНА сама собрать JWS с переданным nonce и выполнить запрос. */
  public async withNonceRetry<T>(
    namespace: Namespace,
    fn: (nonce: string) => Promise<HttpResponse<T>>,
    maxAttempts = 3,
  ): Promise<HttpResponse<T>> {
    let lastErr: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const nonce = await this.take(namespace);

      console.log(`Using nonce (attempt ${attempt}): ${nonce}`);
      const res = await fn(nonce);

      // Всегда собираем свежий nonce из ответа, если он есть
      this.putFromResponse(namespace, res);

      // 2xx/3xx — успех
      if (res.status >= 200 && res.status < 400) {
        return res;
      }

      // Понять — это badNonce?
      let isBadNonce = false;

      try {
        const ct = (res.headers['content-type'] || '').toLowerCase();

        if (ct.includes('application/problem+json')) {
          const problem = await safeReadProblem(res);
          const t = (problem?.type || '').toLowerCase();

          if (t.endsWith(':badnonce')) {
            isBadNonce = true;
          }

          if (!isBadNonce) {
            return res;
          }
        } else {
          return res;
        }
      } catch (e) {
        lastErr = e;

        return res; // не смогли прочесть body — не пахнет badNonce, отдаём как есть
      }

      // Только badNonce → retry
      if (isBadNonce) {
        if (attempt < maxAttempts) {
          continue;
        }

        return res; // исчерпали попытки
      }
    }
    // Теоретически не придём сюда
    throw lastErr ?? new Error('Nonce retry exhausted');
  }

  // ---- internal ----

  private nonceExtractor(res: HttpResponse<any>): string {
    const nonce = res.headers['replay-nonce'] || res.headers['Replay-Nonce'];

    if (!nonce) {
      throw new Error('newNonce: missing Replay-Nonce header');
    }

    if (Array.isArray(nonce)) {
      throw new ServerInternalError('Multiple Replay-Nonce headers in response');
    }

    return nonce;
  }

  private async fetchNewNonce(namespace: Namespace): Promise<string> {
    const res = await this.fetch(this.newNonceUrl);

    if (!res.status || res.status < 200 || res.status >= 400) {
      throw new Error(`newNonce failed: HTTP ${res.status}`);
    }

    const nonce = this.nonceExtractor(res);

    this.add(namespace, nonce);

    return nonce;
  }

  /** Раздать ожидающим по одному nonce из пула */
  private drain(namespace: Namespace): void {
    const q = this.pending.get(namespace);

    if (!q || q.length === 0) {
      return;
    }

    const pool = this.pools.get(namespace) ?? [];

    while (q.length && pool.length) {
      const waiter = q.shift()!;
      const n = pool.pop()!;

      waiter.resolve(n.value);
    }
    this.pools.set(namespace, pool);

    if (q.length) {
      this.pending.set(namespace, q);
      this.ensureRefill(namespace);
    } else {
      this.pending.delete(namespace);
    }
  }

  /** Серийно подтягиваем nonces, пока есть ожидатели */
  private async ensureRefill(namespace: Namespace): Promise<void> {
    if (this.refilling.get(namespace)) {
      return;
    }

    this.refilling.set(namespace, true);
    try {
      while ((this.pending.get(namespace)?.length ?? 0) > 0) {
        try {
          await this.fetchNewNonce(namespace);
          this.drain(namespace);
        } catch (e) {
          // Ошибка рефилла — разбудить и отклонить всех ожидателей, чтобы не зависали
          const q = this.pending.get(namespace) ?? [];

          this.pending.delete(namespace);
          for (const w of q) {
            w.reject(e);
          }
          break;
        }
      }
    } finally {
      this.refilling.set(namespace, false);
    }
  }

  private add(namespace: Namespace, value: string): void {
    const pool = this.pools.get(namespace) ?? [];

    // защита от дублей
    if (!pool.some((n) => n.value === value)) {
      pool.push({ value, ts: Date.now() });

      // ограничение размера пула — оставляем самые свежие
      if (pool.length > this.maxPool) {
        pool.splice(0, pool.length - this.maxPool);
      }

      this.pools.set(namespace, pool);
    }
  }

  private gc(namespace: Namespace): void {
    const pool = this.pools.get(namespace);

    if (!pool) {
      return;
    }

    const now = Date.now();
    const alive = pool.filter((n) => now - n.ts <= this.maxAgeMs);

    if (alive.length !== pool.length) {
      this.pools.set(namespace, alive);
    }
  }

  private isExpired(ts: number): boolean {
    return Date.now() - ts > this.maxAgeMs;
  }

  /** Optional - for metrics */
  public getPoolSize(namespace: Namespace): number {
    return (this.pools.get(namespace) ?? []).length;
  }
}

// --- helpers ---

async function safeReadProblem(
  res: HttpResponse<any>,
): Promise<{ type?: string; detail?: string; status?: number } | null> {
  const body = res.data;

  // Если это уже строка — парсим
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  // Если это объект с json()/text() (undici/WHATWG Response)
  if (body && typeof body === 'object') {
    try {
      if (typeof (body as any).json === 'function') {
        return await (body as any).json();
      }

      if (typeof (body as any).text === 'function') {
        const text = await (body as any).text();

        return JSON.parse(text);
      }
    } catch {
      return null;
    }
  }

  // Иначе — не знаем как читать
  return null;
}
