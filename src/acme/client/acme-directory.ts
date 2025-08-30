import { AcmeHttpClient } from '../http/http-client.js';
import { ServerInternalError } from '../errors/errors.js';
import type { ACMEDirectory } from '../types/directory.js';

export class AcmeDirectory {
  constructor(
    private readonly http: AcmeHttpClient,
    private readonly directoryUrl: string,
  ) {}

  async get(): Promise<ACMEDirectory> {
    const res = await this.http.get(this.directoryUrl);
    if (res.statusCode !== 200) {
      throw new ServerInternalError(`Failed to get directory: ${res.statusCode}`);
    }

    return res.body as ACMEDirectory;
  }
}
