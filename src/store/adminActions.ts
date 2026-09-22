import type { ModuleKey, PermissionAction, RoleKey, Settings, User } from '../types/models';
import { useStore } from './useStore';
import { uid } from '../lib/id';
import { nowISO } from '../lib/clock';
import { API_MODE } from '../lib/api';
import { createUserApi, deleteUserApi, resetUserPasswordApi, updateUserApi } from './adminApi';

function auditRow(userId: string, action: string, module: string, recordRef: string, oldValue: string, newValue: string) {
  return { id: uid('a'), at: nowISO(), userId, action, module: module as any, recordRef, customerId: null, oldValue, newValue, device: 'Chrome · Windows', status: 'Warning' as const };
}

export function toggleRolePermission(roleKey: RoleKey, module: ModuleKey, action: PermissionAction, userId: string) {
  const { db, commit } = useStore.getState();
  const role = db.roles.find((r) => r.key === roleKey);
  const has = !!role?.permissions[module]?.includes(action);
  commit((d) => ({
    roles: d.roles.map((r) => {
      if (r.key !== roleKey) return r;
      const current = r.permissions[module] ?? [];
      const next = has ? current.filter((a) => a !== action) : [...current, action];
      return { ...r, permissions: { ...r.permissions, [module]: next } };
    }),
    auditLogs: [auditRow(userId, 'Permission changed', 'users', `${role?.name} · ${module}.${action}`, has ? 'granted' : 'revoked', has ? 'revoked' : 'granted'), ...d.auditLogs],
  }));
}

type NewUser = Omit<User, 'id' | 'lastLogin' | 'status'> & { status?: User['status'] };

/**
 * Creates a login and returns the password to show once.
 *
 * In API mode the server generates it, so this is the only moment it exists in
 * readable form anywhere. Demo mode has no passwords at all and returns null.
 */
export async function addUser(input: NewUser, actorId: string): Promise<{ user: User; password: string | null }> {
  const { commit } = useStore.getState();

  if (API_MODE) {
    const { user, password } = await createUserApi({
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      role: input.role,
      customerId: input.customerId,
    });
    commit((d) => ({ users: [...d.users, user] }));
    return { user, password };
  }

  const user: User = { ...input, id: uid('u'), status: input.status ?? 'Active', lastLogin: null };
  commit((d) => ({ users: [...d.users, user], auditLogs: [auditRow(actorId, 'User created', 'users', user.name, '', user.role), ...d.auditLogs] }));
  return { user, password: null };
}

export async function updateUser(id: string, patch: Partial<User>, actorId: string): Promise<void> {
  const { db, commit } = useStore.getState();
  const before = db.users.find((u) => u.id === id);

  if (API_MODE) {
    const user = await updateUserApi(id, patch);
    commit((d) => ({ users: d.users.map((u) => (u.id === id ? user : u)) }));
    return;
  }

  commit((d) => ({ users: d.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
  if (before) commit((d) => ({ auditLogs: [auditRow(actorId, 'User updated', 'users', before.name, '', JSON.stringify(patch)), ...d.auditLogs] }));
}

export function setUserActive(id: string, active: boolean, actorId: string): Promise<void> {
  return updateUser(id, { status: active ? 'Active' : 'Inactive' }, actorId);
}

/**
 * Deletes a login. What the account did stays — orders and audit rows name the
 * user by id and keep it, so the history stays readable after the login is gone.
 */
export async function deleteUser(id: string, actorId: string): Promise<void> {
  const { db, commit } = useStore.getState();
  const before = db.users.find((u) => u.id === id);

  if (API_MODE) {
    await deleteUserApi(id);
  }

  commit((d) => ({
    users: d.users.filter((u) => u.id !== id),
    ...(API_MODE || !before ? {} : { auditLogs: [auditRow(actorId, 'User deleted', 'users', before.name, before.email, ''), ...d.auditLogs] }),
  }));
}

/** Generates a new password for someone else and returns it to show once. */
export async function resetUserPassword(id: string): Promise<string> {
  return resetUserPasswordApi(id);
}

export function updateSettings(patch: Partial<Settings>, actorId: string) {
  const { commit } = useStore.getState();
  commit((d) => ({
    settings: { ...d.settings, ...patch },
    auditLogs: [auditRow(actorId, 'Settings updated', 'settings', 'Company Settings', '', Object.keys(patch).join(', ')), ...d.auditLogs],
  }));
}
