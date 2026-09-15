import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} className="text-subtle" />}
          {it.to ? (
            <Link to={it.to} className="hover:text-brand-700 hover:underline">{it.label}</Link>
          ) : (
            <span className="font-medium text-ink">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
