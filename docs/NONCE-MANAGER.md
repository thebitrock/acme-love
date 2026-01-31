# NonceManager

Robust ACME nonce pooling & retry helper for RFC 8555 clients. Eliminates most round‑trip latency to the `newNonce` endpoint by caching and prefetching nonces while safely handling `badNonce` errors.

## Why

Every ACME JWS request must include a fresh `nonce` (anti‑replay). A naive client performs:

1. HEAD newNonce → receive Replay-Nonce
2. Sign request with nonce → POST actual operation

For N sequential operations this doubles network latency. Parallel operations fight over the same endpoint, amplifying rate limits.

`NonceManager` keeps a small, time‑bounded pool of fresh nonces per _namespace_ (e.g. _CA origin_ or _CA origin + account_). It opportunistically harvests any `Replay-Nonce` header returned on normal responses, and prefetches more when supply runs low.

## Features

- Namespace isolation (avoid cross‑account reuse)
- Prefetch with low / high water marks
- Coalesced concurrent refills (one network fetch per namespace at a time)
- Automatic retry helper for `badNonce` problem documents
- Time‑based garbage collection of stale entries
- No external deps besides a coalesce utility & your HTTP adapter

## Non‑Goals

- Distributed / multi‑process synchronization
- Persistent storage
- Cryptographic signing (only nonce lifecycle)

## Quick Start

```ts
import { NonceManager } from 'acme-love';
import { httpGet } from './http-wrapper.js'; // must return { status, headers, data }

const nm = new NonceManager({
  newNonceUrl: 'https://acme-v02.api.letsencrypt.org/acme/new-nonce',
  fetch: httpGet,
  maxPool: 32,
  prefetchLowWater: 4,
  prefetchHighWater: 16,
});

const namespace = NonceManager.makeNamespace('https://acme-v02.api.letsencrypt.org/directory');

// Manual flow
const nonce = await nm.take(namespace);
// sign JWS with `nonce` ... send request ... capture response
// nm.putFromResponse is internal: when you use withNonceRetry it harvests automatically.
```

### Automatic retry

```ts
const response = await nm.withNonceRetry(namespace, async (nonce) => {
  const jws = await sign(payload, nonce);
  return httpPost(url, jws); // must return HttpResponse<T>
});
```

If the server answers with a problem document whose `type` ends with `:badNonce`, the manager obtains a fresh nonce and retries (up to `maxAttempts`). Other errors pass through untouched.

## API

### `constructor(options: NonceManagerOptions)`

| Option              | Type                  | Default            | Description                                                |
| ------------------- | --------------------- | ------------------ | ---------------------------------------------------------- |
| `newNonceUrl`       | `string`              | —                  | Absolute ACME newNonce endpoint                            |
| `fetch`             | `FetchLike`           | —                  | Function performing HEAD/GET returning `HttpResponse`      |
| `maxAgeMs`          | `number`              | 300000             | Discard nonce older than this (avoid replay window issues) |
| `maxPool`           | `number`              | 32                 | Hard upper bound of stored nonces                          |
| `prefetchLowWater`  | `number`              | 0                  | When pool size below this, start prefetching (0 disables)  |
| `prefetchHighWater` | `number`              | `prefetchLowWater` | Target level to fill up to (<= maxPool)                    |
| `log`               | `(msg,...args)=>void` | noop               | Diagnostic logger                                          |

### `static makeNamespace(caDirectoryUrl: string): string`

Produces a canonical namespace key (CA origin). You can append account thumbprint if needed: `makeNamespace(url) + '::' + thumbprint`.

### `take(namespace): Promise<string>`

Returns an available fresh nonce or waits for a refill. Triggers async refill if pool depleted.

### `withNonceRetry(namespace, fn, maxAttempts=3)`

Executes `fn(nonce)`; if response is an ACME _problem_ with `badNonce` type, retries with a new nonce until success or attempts exhausted.

### `getPoolSize(namespace)`

Current number of stored (non‑expired) nonces.

## Internal Mechanics

1. `take()` pops the freshest nonce (LIFO) ensuring minimal age.
2. If pool empty → enqueue waiter & start (or coalesce into) `runRefill`.
3. `runRefill()` fetches new nonces while:

- there are waiters, OR
- prefetch enabled and size < lowWater
  stopping when size reaches highWater / maxPool / no more need / failure.

4. Responses processed by `withNonceRetry()` are scanned for `Replay-Nonce` headers and inserted.
5. `gc()` prunes expired entries on each `take()`.

## Error Handling

- Missing / multiple Replay-Nonce headers during explicit fetch → `ServerInternalError`.
- Network / fetch errors in refill path reject all pending waiters.
- `withNonceRetry` rethrows (returns response) for non-badNonce problem documents to let higher layers decide.

## Tuning

| Scenario                        | Suggested Settings                                                  |
| ------------------------------- | ------------------------------------------------------------------- |
| Low traffic / sequential        | `prefetchLowWater: 0` (disabled)                                    |
| Moderate parallelism (5‑10 ops) | `prefetchLowWater: 4`, `prefetchHighWater: 12`, `maxPool: 32`       |
| High burst                      | Increase `maxPool` (e.g. 64) and proportionally highWater (e.g. 32) |

## Edge Cases & Races

- If server returns duplicate nonce values within a burst they are de‑duplicated by value.
- A waiter may receive a nonce that is _just about_ to expire; age window is small since LIFO pops newest first.
- Persistent server errors halt refill early—callers still receive rejection allowing higher-level backoff.

## Testing Strategies

- Inject a mock `fetch` counting calls; assert coalescing (N parallel `take()` → 1 network fetch).
- Simulate `badNonce` by crafting a problem document; verify `withNonceRetry` attempts increments.
- Force expiry by setting `maxAgeMs` low and advancing timers.

## Example: Namespacing per account

```ts
function accountNamespace(caDirectory: string, jwkThumbprint: string) {
  return `${NonceManager.makeNamespace(caDirectory)}::${jwkThumbprint}`;
}
```

## Limitations / Future Ideas

- Optional pluggable storage (Redis) for horizontal scaling.
- Adaptive prefetch based on consumption rate.
- Metrics hooks (events) for observability.

---

_NonceManager is a focused utility – integrate it inside higher-level ACME client classes to abstract nonce handling completely from business logic._
