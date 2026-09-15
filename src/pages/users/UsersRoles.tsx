import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useCurrentUser, useDb } from '../../store/useStore';
import { toggleRolePermission } from '../../store/adminActions';
import { PERMISSION_ACTIONS, type ModuleKey, type PermissionAction, type User } from '../../types/models';
import { fmtDateTime, initials } from '../../lib/format';
import { UserForm } from './UserForm';
import { can } from '../../lib/nav';

const MATRIX_MODULES: ModuleKey[] = [
  'orders', 'consolidation', 'purchase', 'receiving', 'allocation', 'packing', 'delivery', 'customers', 'prices',
  'items', 'stock', 'invoices', 'payments', 'outstanding', 'reports', 'users', 'settings',
];

export function UsersRolesPage() {
  const db = useDb();
  const actor = useCurrentUser()!;
  const canManage = can(db, actor.role, 'users', 'edit');
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const columns: Column<User>[] = [
    {
      key: 'name', header: 'Name', render: (u) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-700 text-[10px] font-semibold text-white">{initials(u.name)}</span>
          <span className="font-medium text-ink">{u.name}</span>
        </div>
      ), sortValue: (u) => u.name,
    },
    { key: 'email', header: 'Email', render: (u) => u.email, hideBelow: 'md' },
    { key: 'mobile', header: 'Mobile', render: (u) => u.mobile, hideBelow: 'lg' },
    { key: 'role', header: 'Role', render: (u) => db.roles.find((r) => r.key === u.role)?.name ?? u.role },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'lastLogin', header: 'Last Login', render: (u) => fmtDateTime(u.lastLogin), hideBelow: 'lg' },
    ...(canManage ? [{ key: 'actions', header: '', align: 'right' as const, render: (u: User) => <Button size="xs" variant="secondary" onClick={() => setEditing(u)}>Edit</Button> }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        description={`${db.users.length} users · ${db.roles.length} roles`}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>Add User</Button> : undefined}
      />
      <Tabs variant="pill" value={tab} onChange={(k) => setTab(k as any)} items={[{ key: 'users', label: 'Users', count: db.users.length }, { key: 'roles', label: 'Permission Matrix' }]} />

      <div className="mt-4">
        {tab === 'users' ? (
          <Card><DataTable columns={columns} rows={db.users} rowKey={(u) => u.id} exportFilename="users" pageSize={50} /></Card>
        ) : (
          <Card>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line bg-canvas/70">
                    <th className="sticky left-0 z-10 bg-canvas/70 px-3 py-2 text-left text-[11px] font-semibold uppercase text-muted">Role</th>
                    {MATRIX_MODULES.map((m) => (
                      <th key={m} className="px-2 py-2 text-center text-[10px] font-semibold text-muted">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {db.roles.filter((r) => r.key !== 'customer' && r.key !== 'driver').map((role) => (
                    <tr key={role.key} className="border-b border-line last:border-0">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium whitespace-nowrap text-ink">{role.name}</td>
                      {MATRIX_MODULES.map((m) => (
                        <td key={m} className="px-2 py-2 text-center">
                          <PermCell role={role.key} module={m} perms={role.permissions[m] ?? []} disabled={!canManage} actorId={actor.id} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-muted">Click a cell to cycle View → Full access → None. Changes apply immediately and are audited.</p>
          </Card>
        )}
      </div>

      <UserForm open={formOpen} onClose={() => setFormOpen(false)} />
      <UserForm open={!!editing} onClose={() => setEditing(null)} user={editing} />
    </div>
  );
}

function PermCell({ role, module, perms, disabled, actorId }: { role: any; module: ModuleKey; perms: PermissionAction[]; disabled: boolean; actorId: string }) {
  const level = perms.length === 0 ? 'none' : perms.length >= PERMISSION_ACTIONS.length ? 'full' : 'view';
  const cycle = () => {
    if (disabled) return;
    if (level === 'none') { toggleRolePermission(role, module, 'view', actorId); return; }
    if (level === 'view') { PERMISSION_ACTIONS.forEach((a) => { if (!perms.includes(a)) toggleRolePermission(role, module, a, actorId); }); return; }
    perms.forEach((a) => toggleRolePermission(role, module, a, actorId));
  };
  return (
    <button
      onClick={cycle} disabled={disabled}
      className={`mx-auto grid size-6 place-items-center rounded ${level === 'full' ? 'bg-emerald-100 text-emerald-700' : level === 'view' ? 'bg-blue-100 text-blue-700' : 'bg-canvas text-subtle'} ${disabled ? '' : 'hover:ring-2 hover:ring-brand-200'}`}
      title={level === 'full' ? 'Full access' : level === 'view' ? 'View only' : 'No access'}
    >
      {level !== 'none' && <Check size={13} />}
    </button>
  );
}
