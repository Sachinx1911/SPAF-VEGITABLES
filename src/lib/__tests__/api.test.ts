import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The client is compiled with `VITE_API_URL` empty so the rest of the suite runs
 * in demo mode. These tests need it set, so the module is re-imported with the
 * variable stubbed rather than the whole suite being pointed at a server.
 */
async function loadApi(respond: (url: string) => Response) {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test');
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => respond(String(url))));

  return import('../api');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('api error handling', () => {
  it('shows a validation message as the server wrote it', async () => {
    const { api, ApiError } = await loadApi(() =>
      json(422, { message: 'Email/mobile or password is incorrect.' }),
    );

    await expect(api.post('/auth/login', {})).rejects.toThrow(ApiError);
    await expect(api.post('/auth/login', {})).rejects.toThrow(
      'Email/mobile or password is incorrect.',
    );
  });

  /**
   * Regression: a malformed placeholder hash made every unknown email a 500, and
   * the client printed the server's own words — "This password does not use the
   * Bcrypt algorithm" — onto the sign-in form. A 5xx body describes the server's
   * internals, not anything the person signing in can act on.
   */
  it('does not print a server-side failure onto the screen', async () => {
    const { api } = await loadApi(() =>
      json(500, { message: 'This password does not use the Bcrypt algorithm.' }),
    );

    await expect(api.post('/auth/login', {})).rejects.toThrow(/went wrong at our end/i);
    await expect(api.post('/auth/login', {})).rejects.not.toThrow(/Bcrypt/);
  });

  it('keeps the field errors a form needs', async () => {
    const { api, ApiError } = await loadApi(() =>
      json(422, { message: 'Invalid.', errors: { identifier: ['Is incorrect.'] } }),
    );

    await expect(api.post('/auth/login', {})).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.firstFieldError === 'Is incorrect.',
    );
  });

  it('reports an unreachable server as a connection problem, not a rejection', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const { api } = await import('../api');
    await expect(api.get('/orders')).rejects.toThrow(/Could not reach the server/);
  });

  it('turns an HTML error page into a plain message rather than a parser error', async () => {
    const { api } = await loadApi(() => new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    await expect(api.get('/orders')).rejects.toThrow(/Server error \(502\)/);
  });
});
