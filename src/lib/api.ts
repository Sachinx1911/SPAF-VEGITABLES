/**
 * The HTTP client for the Laravel API.
 *
 * The app runs in two modes and this file decides which:
 *
 *  - **API mode** — `VITE_API_URL` is set. Everything comes from the server,
 *    every browser sees the same data, and the server enforces permissions.
 *  - **Demo mode** — it is not set. The store keeps its seeded data in
 *    localStorage, as it did before the backend existed.
 *
 * Both are supported on purpose: the site can be live and usable while the API
 * is still being rolled out, and switching over is one environment variable
 * rather than a redeploy of different code.
 */

const RAW_BASE = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

/** True when this build is pointed at a real backend. */
export const API_MODE = RAW_BASE.length > 0;

export const API_BASE = RAW_BASE;

const TOKEN_KEY = 'spaf-os.token';

/* ------------------------------------------------------------------ token */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — the session simply will not survive a reload */
  }
}

/* ----------------------------------------------------------------- errors */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Laravel's field-level validation messages, when it sent any. */
    readonly errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The first field message, which is what a form wants to show. */
  get firstFieldError(): string | null {
    const first = Object.values(this.errors)[0];
    return first?.[0] ?? null;
  }
}

/** Raised when the token is gone or rejected, so the app can send the user to sign in again. */
export class UnauthenticatedError extends ApiError {
  constructor(message = 'Your session has ended. Please sign in again.') {
    super(401, message);
    this.name = 'UnauthenticatedError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  /** Query string values; null and undefined are dropped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  /** Skip the Authorization header — only the login call needs this. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/** Called when a request comes back 401, so the store can clear the session. */
let onUnauthenticated: (() => void) | null = null;

export function setUnauthenticatedHandler(fn: (() => void) | null): void {
  onUnauthenticated = fn;
}

async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_MODE) {
    throw new ApiError(0, 'This build is running in demo mode and has no API to call.');
  }

  const url = new URL(`${API_BASE}/api${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (token && !options.anonymous) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (e) {
    // A network failure is not the same as a rejection: say so, rather than
    // letting the screen show a bare "failed to fetch".
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Could not reach the server. Check the connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  let payload: Record<string, unknown> = {};
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // A proxy or PHP fatal can return HTML; do not surface a parser error.
      if (!response.ok) throw new ApiError(response.status, `Server error (${response.status}).`);
    }
  }

  if (response.ok) return payload as T;

  // A 4xx message is written for the person reading it — "that invoice is
  // already settled" — so it is shown as sent. A 5xx message is not: it is
  // whatever the server happened to throw, and with APP_DEBUG on it carries
  // internals (a stack trace, a hasher complaining about an algorithm) straight
  // onto the sign-in form. Those are replaced with something a user can act on.
  const message = response.status >= 500
    ? 'Something went wrong at our end. Please try again in a moment.'
    : typeof payload.message === 'string'
      ? payload.message
      : `Request failed (${response.status}).`;

  if (response.status === 401) {
    setToken(null);
    onUnauthenticated?.();
    throw new UnauthenticatedError(message);
  }

  throw new ApiError(response.status, message, (payload.errors as Record<string, string[]>) ?? {});
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
