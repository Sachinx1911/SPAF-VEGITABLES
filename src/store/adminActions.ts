import type { ModuleKey, PermissionAction, RoleKey, Settings, User } from '../types/models';
import { useStore } from './useStore';
import { uid } from '../lib/id';
import { nowISO } from '../lib/clock';

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

export function addUser(input: NewUser, actorId: string): User {
  const { commit } = useStore.getState();
  const user: User = { ...input, id: uid('u'), status: input.status ?? 'Active', lastLogin: null };
  commit((d) => ({ users: [...d.users, user], auditLogs: [auditRow(actorId, 'User created', 'users', user.name, '', user.role), ...d.auditLogs] }));
  return user;
}

export function updateUser(id: string, patch: Partial<User>, actorId: string) {
  const { db, commit } = useStore.getState();
  const before = db.users.find((u) => u.id === id);
  commit((d) => ({ users: d.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
  if (before) commit((d) => ({ auditLogs: [auditRow(actorId, 'User updated', 'users', before.name, '', JSON.stringify(patch)), ...d.auditLogs] }));
}

export function setUserActive(id: string, active: boolean, actorId: string) {
  updateUser(id, { status: active ? 'Active' : 'Inactive' }, actorId);
}

export function updateSettings(patch: Partial<Settings>, actorId: string) {
  const { commit } = useStore.getState();
  commit((d) => ({
    settings: { ...d.settings, ...patch },
    auditLogs: [auditRow(actorId, 'Settings updated', 'settings', 'Company Settings', '', Object.keys(patch).join(', ')), ...d.auditLogs],
  }));
}
