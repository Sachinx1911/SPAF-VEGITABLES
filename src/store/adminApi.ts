import { api } from '../lib/api';
import type { RoleKey, User } from '../types/models';

/**
 * Logins.
 *
 * Passwords are never sent from here. The server generates one on create and on
 * reset, returns it once, and stores only its hash — so the only place a
 * readable password exists is the response to the call that made it. Whatever
 * shows it to the admin has to show it there and then.
 */

export async function fetchUsers(): Promise<User[]> {
  const res = await api.get<{ users: User[] }>('/users');
  return res.users;
}

export interface NewUserPayload {
  name: string;
  email: string;
  mobile?: string;
  role: RoleKey;
  /** Required when role is 'customer'; ScopeToCustomer needs it to scope reads. */
  customerId?: string | null;
}

export async function createUserApi(input: NewUserPayload): Promise<{ user: User; password: string }> {
  return api.post<{ user: User; password: string }>('/users', {
    name: input.name,
    email: input.email,
    mobile: input.mobile ?? '',
    role_key: input.role,
    customer_id: input.customerId ?? null,
  });
}

export async function updateUserApi(id: string, patch: Partial<User>): Promise<User> {
  const res = await api.put<{ user: User }>(`/users/${id}`, {
    name: patch.name,
    email: patch.email,
    mobile: patch.mobile,
    role_key: patch.role,
    status: patch.status,
  });

  return res.user;
}

export async function deleteUserApi(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

export async function resetUserPasswordApi(id: string): Promise<string> {
  const res = await api.post<{ password: string }>(`/users/${id}/reset-password`, {});
  return res.password;
}
