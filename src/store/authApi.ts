import { api, API_MODE, setToken, type ApiError } from '../lib/api';
import type { ModuleKey, PermissionAction, RoleKey, User } from '../types/models';

/** What the server returns for a signed-in user. */
export interface ApiSession {
  user: User;
  /** The role's grants, module by module — the same grid the server enforces. */
  permissions: Partial<Record<ModuleKey, PermissionAction[]>>;
}

interface LoginResponse {
  token: string;
  expires_at: string;
  user: ApiUser;
}

interface ApiUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: RoleKey;
  status: 'Active' | 'Inactive';
  lastLogin: string | null;
  customerId: string | null;
}

const toUser = (u: ApiUser): User => ({
  id: u.id,
  name: u.name,
  email: u.email,
  mobile: u.mobile,
  role: u.role,
  status: u.status,
  lastLogin: u.lastLogin,
  customerId: u.customerId,
});

/**
 * Signs in against the API and keeps the returned token.
 *
 * The token replaces the browser-side session entirely: the password is checked
 * on the server, against that user's own hash, and nothing about the decision
 * happens where the user can reach it.
 */
export async function apiLogin(
  identifier: string,
  password: string,
  remember: boolean,
): Promise<{ ok: true; session: ApiSession } | { ok: false; error: string }> {
  try {
    const res = await api.post<LoginResponse>(
      '/auth/login',
      { identifier, password, remember },
      { anonymous: true },
    );

    setToken(res.token);

    // Fetch the permission grid straight away; every screen needs it to decide
    // what to render, and the server uses the same grid to decide what to send.
    const me = await api.get<{ user: ApiUser; permissions: ApiSession['permissions'] }>('/auth/me');

    return { ok: true, session: { user: toUser(me.user), permissions: me.permissions } };
  } catch (e) {
    const err = e as ApiError;
    return { ok: false, error: err.firstFieldError ?? err.message };
  }
}

/** Restores a session from a stored token, or returns null if it is no longer good. */
export async function apiRestoreSession(): Promise<ApiSession | null> {
  if (!API_MODE) return null;

  try {
    const me = await api.get<{ user: ApiUser; permissions: ApiSession['permissions'] }>('/auth/me');
    return { user: toUser(me.user), permissions: me.permissions };
  } catch {
    // An expired or revoked token is not an error worth surfacing — the app
    // simply shows the login screen.
    setToken(null);
    return null;
  }
}

export async function apiLogout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Even if the call fails, the local token must go.
  } finally {
    setToken(null);
  }
}

export async function apiChangePassword(
  currentPassword: string,
  password: string,
  passwordConfirmation: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await api.post('/auth/change-password', {
      current_password: currentPassword,
      password,
      password_confirmation: passwordConfirmation,
    });
    return { ok: true };
  } catch (e) {
    const err = e as ApiError;
    return { ok: false, error: err.firstFieldError ?? err.message };
  }
}
