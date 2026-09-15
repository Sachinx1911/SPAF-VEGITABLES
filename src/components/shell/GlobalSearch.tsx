import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Route as RouteIcon, Search, Truck, Users, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useDb } from '../../store/useStore';
import { fmtDate, inr } from '../../lib/format';

interface Hit {
  group: string;
  icon: typeof Users;
  id: string;
  title: string;
  subtitle: string;
  path: string;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out: Hit[] = [];
    for (const c of db.customers) {
      if (out.length > 40) break;
      if (c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term) || c.legalName.toLowerCase().includes(term)) {
        out.push({ group: 'Customers', icon: Users, id: c.id, title: c.name, subtitle: `${c.code} · ${c.location}`, path: `/customers/${c.id}` });
      }
    }
    for (const it of db.items) {
      if (out.length > 60) break;
      if (it.name.toLowerCase().includes(term) || it.code.toLowerCase().includes(term)) {
        out.push({ group: 'Items', icon: RouteIcon, id: it.id, title: `${it.name} (${it.unit})`, subtitle: `${it.code} · ${it.category}`, path: `/items/${it.id}` });
      }
    }
    for (const o of db.orders) {
      if (out.length > 80) break;
      if (o.orderNo.toLowerCase().includes(term)) {
        const c = db.customers.find((x) => x.id === o.customerId);
        out.push({ group: 'Orders', icon: FileText, id: o.id, title: o.orderNo, subtitle: `${c?.name} · Delivery ${fmtDate(o.deliveryDate)}`, path: `/orders/${o.id}` });
      }
    }
    for (const inv of db.invoices) {
      if (out.length > 100) break;
      if (inv.invoiceNo.toLowerCase().includes(term)) {
        const c = db.customers.find((x) => x.id === inv.customerId);
        out.push({ group: 'Invoices', icon: FileText, id: inv.id, title: inv.invoiceNo, subtitle: `${c?.name} · ${inr(inv.total)}`, path: `/invoices/${inv.id}` });
      }
    }
    for (const ch of db.challans) {
      if (out.length > 110) break;
      if (ch.challanNo.toLowerCase().includes(term)) {
        const c = db.customers.find((x) => x.id === ch.customerId);
        out.push({ group: 'Challans', icon: Truck, id: ch.id, title: ch.challanNo, subtitle: `${c?.name} · ${ch.status}`, path: `/challans/${ch.id}` });
      }
    }
    for (const p of db.payments) {
      if (out.length > 120) break;
      if (p.receiptNo.toLowerCase().includes(term)) {
        const c = db.customers.find((x) => x.id === p.customerId);
        out.push({ group: 'Payments', icon: FileText, id: p.id, title: p.receiptNo, subtitle: `${c?.name} · ${inr(p.amount)}`, path: `/payments` });
      }
    }
    return out;
  }, [q, db]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      if (e.key === 'Enter' && hits[active]) { nav(hits[active].path); onClose(); }
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hits, active, nav, onClose]);

  if (!open) return null;
  let lastGroup = '';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-center pt-[12vh]">
      <div className="animate-fade-in fixed inset-0 bg-[#0c1a10]/45" onClick={onClose} />
      <div className="animate-slide-up relative h-fit w-full max-w-lg overflow-hidden rounded-card border border-line bg-white shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={17} className="text-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            placeholder="Search customers, orders, invoices, items, challans…"
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-subtle"
          />
          <button onClick={onClose} className="rounded p-1 text-subtle hover:bg-canvas" aria-label="Close search"><X size={16} /></button>
        </div>
        <div className="scrollbar-thin max-h-[55vh] overflow-y-auto p-1.5">
          {q && hits.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-muted">No results for "{q}"</p>}
          {!q && <p className="px-3 py-8 text-center text-[13px] text-muted">Type to search across the whole system</p>}
          {hits.map((h, i) => {
            const showGroup = h.group !== lastGroup;
            lastGroup = h.group;
            return (
              <div key={`${h.group}-${h.id}`}>
                {showGroup && <p className="px-3 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-subtle uppercase">{h.group}</p>}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { nav(h.path); onClose(); }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? 'bg-brand-50' : ''}`}
                >
                  <h.icon size={15} className="shrink-0 text-brand-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{h.title}</p>
                    <p className="truncate text-[11.5px] text-muted">{h.subtitle}</p>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
