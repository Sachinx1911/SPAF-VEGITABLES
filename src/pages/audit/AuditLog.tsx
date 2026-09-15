import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useDb } from '../../store/useStore';
import type { AuditLog, ModuleKey } from '../../types/models';
import { fmtDateTime } from '../../lib/format';

const MODULES: ModuleKey[] = [
  'orders', 'consolidation', 'purchase', 'receiving', 'allocation', 'packing', 'delivery', 'customers', 'prices',
  'items', 'invoices', 'payments', 'users',
];

export function AuditLogPage() {
  const db = useDb();
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [status, setStatus] = useState('');
  const userById = new Map(db.users.map((u) => [u.id, u]));
  const custById = new Map(db.customers.map((c) => [c.id, c]));

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return db.auditLogs.filter((a) => {
      if (term && !(a.action.toLowerCase().includes(term) || a.recordRef.toLowerCase().includes(term) || userById.get(a.userId)?.name.toLowerCase().includes(term))) return false;
      if (module && a.module !== module) return false;
      if (status && a.status !== status) return false;
      return true;
    });
  }, [db.auditLogs, search, module, status]);

  const columns: Column<AuditLog>[] = [
    { key: 'at', header: 'Date/Time', render: (a) => fmtDateTime(a.at), sortValue: (a) => a.at },
    { key: 'user', header: 'User', render: (a) => userById.get(a.userId)?.name ?? a.userId },
    { key: 'action', header: 'Action', render: (a) => a.action, exportValue: (a) => a.action },
    { key: 'module', header: 'Module', render: (a) => <Badge tone="neutral">{a.module}</Badge>, hideBelow: 'md' },
    { key: 'record', header: 'Record', render: (a) => <span className="text-muted">{a.recordRef}</span> },
    { key: 'customer', header: 'Customer', render: (a) => (a.customerId ? custById.get(a.customerId)?.name : '—'), hideBelow: 'lg' },
    { key: 'change', header: 'Old → New', render: (a) => (a.oldValue || a.newValue ? <span className="text-xs text-muted">{a.oldValue && <span className="line-through">{a.oldValue}</span>} {a.oldValue && '→'} {a.newValue}</span> : '—'), hideBelow: 'lg' },
    { key: 'status', header: 'Status', render: (a) => <Badge tone={a.status === 'Failed' ? 'red' : a.status === 'Warning' ? 'orange' : 'green'}>{a.status}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Audit Logs" description={`${rows.length} of ${db.auditLogs.length} events`} />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(a) => a.id}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search action, record or user…"
          exportFilename="audit-logs"
          filters={
            <>
              <Select value={module} onChange={(e) => setModule(e.target.value)} placeholder="All modules" options={MODULES} className="w-40" />
              <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All status" options={['Success', 'Warning', 'Failed']} className="w-32" />
            </>
          }
          emptyTitle="No matching events"
          pageSize={50}
        />
      </Card>
      {rows.length === 0 && db.auditLogs.length === 0 && <EmptyStateNote />}
    </div>
  );
}

function EmptyStateNote() {
  return (
    <div className="mt-4 flex items-center gap-2 text-[13px] text-muted">
      <ScrollText size={14} /> No activity recorded yet.
    </div>
  );
}
