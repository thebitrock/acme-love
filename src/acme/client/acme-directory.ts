import { AcmeHttpClient } from '../http/http-client.js';
import { ServerInternalError } from '../errors/errors.js';
import type { ACMEDirectory } from '../types/directory.js';
import { coalesceAsync } from 'promise-coalesce';

/** Fetches and caches the ACME directory document with coalescing. */
export class AcmeDirectory {
  private cached?: ACMEDirectory;

  constructor(
    private readonly http: AcmeHttpClient,
    private readonly directoryUrl: string,
  ) {}

  async get(): Promise<ACMEDirectory> {
    if (this.cached) return this.cached;

    return coalesceAsync(`acme:dir:${this.directoryUrl}`, async () => {
      if (this.cached) return this.cached;

      const res = await this.http.get(this.directoryUrl);
      if (res.statusCode !== 200) {
        throw new ServerInternalError(`Failed to get directory: ${res.statusCode}`);
      }
      this.cached = res.body as ACMEDirectory;
      return this.cached;
    }) as Promise<ACMEDirectory>;
  }
}
