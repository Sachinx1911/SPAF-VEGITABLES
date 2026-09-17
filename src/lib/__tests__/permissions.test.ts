import { describe, expect, it } from 'vitest';
import { generateSeed } from '../../data/seed/generate';
import { can, homePathFor, navForRole } from '../nav';

/**
 * Permissions decide what each role may reach. A regression here silently hands
 * someone access they should not have, so the sensitive combinations are pinned.
 */
describe('role permissions', () => {
  const db = generateSeed();

  it('gives admin access to users and settings', () => {
    expect(can(db, 'admin', 'users', 'view')).toBe(true);
    expect(can(db, 'admin', 'users', 'edit')).toBe(true);
    expect(can(db, 'admin', 'settings', 'edit')).toBe(true);
  });

  it('keeps a customer out of every staff module', () => {
    for (const m of ['consolidation', 'purchase', 'receiving', 'allocation', 'packing', 'outstanding', 'ledger', 'users', 'settings', 'audit'] as const) {
      expect(can(db, 'customer', m, 'view'), `customer must not view ${m}`).toBe(false);
    }
  });

  it('lets a customer reach only their own portal', () => {
    expect(can(db, 'customer', 'portal', 'view')).toBe(true);
    expect(can(db, 'customer', 'portal', 'create')).toBe(true);
  });

  it('keeps a driver limited to the driver app', () => {
    expect(can(db, 'driver', 'driver_app', 'view')).toBe(true);
    expect(can(db, 'driver', 'invoices', 'view')).toBe(false);
    expect(can(db, 'driver', 'users', 'view')).toBe(false);
    expect(can(db, 'driver', 'settings', 'edit')).toBe(false);
  });

  it('stops a non-admin from editing users or settings', () => {
    for (const role of ['ops_manager', 'order_exec', 'purchase_manager', 'warehouse', 'delivery', 'accounts'] as const) {
      expect(can(db, role, 'users', 'edit'), `${role} must not edit users`).toBe(false);
      expect(can(db, role, 'settings', 'edit'), `${role} must not edit settings`).toBe(false);
    }
  });

  it('refuses an unknown role everything', () => {
    expect(can(db, 'not_a_role' as never, 'orders', 'view')).toBe(false);
  });

  it('refuses an action the role was not granted, even on a module it can view', () => {
    const accounts = db.roles.find((r) => r.key === 'accounts')!;
    const viewableOnly = Object.entries(accounts.permissions).find(
      ([, actions]) => actions?.includes('view') && !actions.includes('delete'),
    );
    if (viewableOnly) {
      const [module] = viewableOnly;
      expect(can(db, 'accounts', module as never, 'view')).toBe(true);
      expect(can(db, 'accounts', module as never, 'delete')).toBe(false);
    }
  });

  it('builds a navigation that only contains modules the role may view', () => {
    for (const role of db.roles) {
      for (const section of navForRole(db, role.key)) {
        for (const item of section.items) {
          expect(can(db, role.key, item.module), `${role.key} sees ${item.module}`).toBe(true);
        }
      }
    }
  });

  it('sends each role to its own landing page', () => {
    expect(homePathFor('customer')).toBe('/portal');
    expect(homePathFor('driver')).toBe('/driver');
    expect(homePathFor('admin')).toBe('/');
  });
});
