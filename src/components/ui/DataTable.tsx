import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Printer } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button, IconButton } from './Button';
import { SearchInput } from './Field';
import { Pagination } from './Pagination';
import { EmptyState, SkeletonTable } from './States';
import { DropdownPanel, useClickOutside } from './Overlay';
import { Checkbox } from './Field';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  width?: string;
  sticky?: boolean;
  hideBelow?: 'md' | 'lg'; // collapse into the card view under this breakpoint
  exportValue?: (row: T) => string | number;
  defaultHidden?: boolean;
}

interface BulkAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (rows: T[]) => void;
  danger?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  filters?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  bulkActions?: BulkAction<T>[];
  exportFilename?: string;
  onPrint?: () => void;
  pageSize?: number;
  compact?: boolean;
  toolbarExtra?: ReactNode;
  cardRender?: (row: T) => ReactNode; // mobile card layout
}

function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const cols = columns.filter((c) => c.exportValue || typeof c.render === 'function');
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = cols.map((c) => esc(typeof c.header === 'string' ? c.header : c.key)).join(',');
  const lines = rows.map((r) => cols.map((c) => esc(c.exportValue ? c.exportValue(r) : '')).join(','));
  return [header, ...lines].join('\r\n');
}

export function DataTable<T>({
  columns, rows, rowKey, loading, searchPlaceholder = 'Search…', searchValue, onSearchChange, filters,
  emptyTitle = 'Nothing here yet', emptyDescription, emptyAction, onRowClick, bulkActions, exportFilename, onPrint,
  pageSize = 25, compact, toolbarExtra, cardRender,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useClickOutside<HTMLDivElement>(() => setColMenuOpen(false));

  useEffect(() => setPage(1), [searchValue, rows.length]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const arr = [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
    return sort.dir === 'desc' ? arr.reverse() : arr;
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const clampedPage = Math.min(page, pageCount);
  const visible = sorted.slice((clampedPage - 1) * size, clampedPage * size);
  const visibleCols = columns.filter((c) => !hidden.has(c.key));
  const allOnPageSelected = visible.length > 0 && visible.every((r) => selected.has(rowKey(r)));

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort((s) => (s?.key === col.key ? (s.dir === 'asc' ? { key: col.key, dir: 'desc' } : null) : { key: col.key, dir: 'asc' }));
  };

  const toggleAll = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allOnPageSelected) visible.forEach((r) => next.delete(rowKey(r)));
      else visible.forEach((r) => next.add(rowKey(r)));
      return next;
    });
  };

  const exportCsv = () => {
    const csv = toCsv(columns, sorted);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${exportFilename ?? 'export'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const selectedRows = rows.filter((r) => selected.has(rowKey(r)));
  const hasToolbar = onSearchChange || filters || exportFilename || onPrint || toolbarExtra;

  return (
    <div>
      {hasToolbar && (
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-line p-3">
          {onSearchChange && <SearchInput value={searchValue ?? ''} onChange={onSearchChange} placeholder={searchPlaceholder} className="w-56" />}
          {filters}
          <div className="ml-auto flex items-center gap-1.5">
            {toolbarExtra}
            <div className="relative" ref={colMenuRef}>
              <IconButton icon={Columns3} label="Toggle columns" size="sm" onClick={() => setColMenuOpen((v) => !v)} />
              {colMenuOpen && (
                <DropdownPanel className="top-full right-0 mt-1.5 max-h-64 overflow-y-auto p-2">
                  {columns.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-canvas">
                      <Checkbox
                        checked={!hidden.has(c.key)}
                        onChange={() =>
                          setHidden((h) => {
                            const n = new Set(h);
                            n.has(c.key) ? n.delete(c.key) : n.add(c.key);
                            return n;
                          })
                        }
                      />
                      {typeof c.header === 'string' ? c.header : c.key}
                    </label>
                  ))}
                </DropdownPanel>
              )}
            </div>
            {exportFilename && <IconButton icon={Download} label="Export CSV" size="sm" onClick={exportCsv} />}
            {onPrint && <IconButton icon={Printer} label="Print" size="sm" onClick={onPrint} />}
          </div>
        </div>
      )}

      {bulkActions && selected.size > 0 && (
        <div className="no-print flex items-center gap-2 border-b border-line bg-brand-50 px-3 py-2">
          <span className="text-[13px] font-medium text-brand-800">{selected.size} selected</span>
          {bulkActions.map((a) => (
            <Button key={a.label} size="xs" variant={a.danger ? 'danger' : 'secondary'} icon={undefined} onClick={() => a.onClick(selectedRows)}>
              {a.icon}
              {a.label}
            </Button>
          ))}
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">Clear</Button>
        </div>
      )}

      {loading ? (
        <SkeletonTable cols={visibleCols.length} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <>
          {/* Mobile: card list (or horizontal scroll fallback if no cardRender given) */}
          {cardRender && (
            <div className="flex flex-col divide-y divide-line md:hidden">
              {visible.map((r) => (
                <div key={rowKey(r)} onClick={() => onRowClick?.(r)} className={cn('p-3', onRowClick && 'cursor-pointer active:bg-canvas')}>
                  {cardRender(r)}
                </div>
              ))}
            </div>
          )}

          <div className={cn('scrollbar-thin overflow-x-auto', cardRender && 'hidden md:block')}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas/70">
                  {bulkActions && (
                    <th className="sticky left-0 w-9 bg-canvas/70 px-3 py-2">
                      <Checkbox checked={allOnPageSelected} onChange={toggleAll} />
                    </th>
                  )}
                  {visibleCols.map((c) => (
                    <th
                      key={c.key}
                      style={{ width: c.width }}
                      className={cn(
                        'px-3 py-2 text-[11.5px] font-semibold tracking-wide text-muted uppercase whitespace-nowrap',
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                        c.sticky && 'sticky left-0 z-10 bg-canvas/70',
                        c.hideBelow === 'md' && 'hidden md:table-cell',
                        c.hideBelow === 'lg' && 'hidden lg:table-cell',
                      )}
                    >
                      {c.sortValue ? (
                        <button onClick={() => toggleSort(c)} className="inline-flex items-center gap-1 hover:text-ink">
                          {c.header}
                          {sort?.key === c.key ? sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={11} className="opacity-40" />}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const key = rowKey(r);
                  return (
                    <tr
                      key={key}
                      onClick={() => onRowClick?.(r)}
                      className={cn('border-b border-line last:border-0 hover:bg-brand-50/40', onRowClick && 'cursor-pointer', compact ? 'h-9' : 'h-11')}
                    >
                      {bulkActions && (
                        <td className="sticky left-0 bg-white px-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(key)}
                            onChange={() =>
                              setSelected((s) => {
                                const n = new Set(s);
                                n.has(key) ? n.delete(key) : n.add(key);
                                return n;
                              })
                            }
                          />
                        </td>
                      )}
                      {visibleCols.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            'px-3 py-1.5 text-ink',
                            c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                            c.sticky && 'sticky left-0 z-10 bg-white',
                            c.hideBelow === 'md' && 'hidden md:table-cell',
                            c.hideBelow === 'lg' && 'hidden lg:table-cell',
                          )}
                        >
                          {c.render(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="no-print border-t border-line">
            <Pagination page={clampedPage} pageSize={size} total={sorted.length} onPageChange={setPage} onPageSizeChange={setSize} />
          </div>
        </>
      )}
    </div>
  );
}
