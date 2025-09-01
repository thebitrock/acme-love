import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
// Updated to import from public entrypoint (AcmeClient, provider, AcmeHttpClient)
import { AcmeClient, provider, AcmeHttpClient } from '../../src/index.js';

// Helper to build a minimal ParsedResponseData compatible object
function makeGetResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {},
    body,
    trailers: {},
    opaque: null,
    context: {},
  } as any;
}

describe.skip('AcmeClient', () => {
  const directoryBody = { newNonce: 'https://example.test/acme/new-nonce' };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('constructs with string URL', async () => {
    const spy = jest
      .spyOn(AcmeHttpClient.prototype, 'get')
      .mockResolvedValue(makeGetResponse(200, directoryBody));

    const core = new AcmeClient('https://example.test/directory');
    const dir = await core.getDirectory();
    expect(dir).toEqual(directoryBody);
    expect(core.getDefaultNonce()).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(1);
    // Second call should use cache
    const dir2 = await core.getDirectory();
    expect(dir2).toBe(dir);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('constructs with provider entry', async () => {
    const spy = jest
      .spyOn(AcmeHttpClient.prototype, 'get')
      .mockResolvedValue(makeGetResponse(200, directoryBody));

    const core = new AcmeClient(provider.letsencrypt.staging);
    const dir = await core.getDirectory();
    expect(dir).toEqual(directoryBody);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('throws AcmeError on non-200 directory fetch', async () => {
    jest.spyOn(AcmeHttpClient.prototype, 'get').mockResolvedValue(
      makeGetResponse(500, {
        type: 'urn:ietf:params:acme:error:serverInternal',
        detail: 'internal oops',
        status: 500,
      }),
    );

    const core = new AcmeClient('https://example.test/directory');
    await expect(core.getDirectory()).rejects.toThrow(/internal oops/);
  });

  it('getDefaultNonce throws before getDirectory()', () => {
    const core = new AcmeClient('https://example.test/directory');
    expect(() => core.getDefaultNonce()).toThrow(/NonceManager not initialized/);
  });
});
