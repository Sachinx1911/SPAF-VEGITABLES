import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';
import { Select } from './Field';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (n: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10, 25, 50, 100] }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2 text-[13px] text-muted">
      <div className="flex items-center gap-2">
        <span>
          {from}–{to} of {total}
        </span>
        {onPageSizeChange && (
          <Select
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            options={pageSizeOptions.map((n) => ({ value: String(n), label: `${n} / page` }))}
            className="h-7 w-28"
          />
        )}
      </div>
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Previous page" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />
        {pageNumbers(page, pageCount).map((n, i) =>
          n === '…' ? (
            <span key={i} className="px-1">…</span>
          ) : (
            <button
              key={i}
              onClick={() => onPageChange(n as number)}
              className={cn('grid size-7 place-items-center rounded-md text-xs font-medium', n === page ? 'bg-brand-700 text-white' : 'hover:bg-canvas')}
            >
              {n}
            </button>
          ),
        )}
        <IconButton icon={ChevronRight} label="Next page" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} />
      </div>
    </div>
  );
}

function pageNumbers(page: number, count: number): (number | '…')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out = new Set([1, count, page, page - 1, page + 1]);
  const sorted = [...out].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const withDots: (number | '…')[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - (sorted[i - 1] as number) > 1) withDots.push('…');
    withDots.push(n);
  });
  return withDots;
}
