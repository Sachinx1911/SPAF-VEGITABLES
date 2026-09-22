import { useRef, useState } from 'react';
import { CircleCheck, TriangleAlert, Upload, X } from 'lucide-react';
import { Modal } from './Overlay';
import { Button } from './Button';
import { parseCsvRecords } from '../../lib/csv';
import { cn } from '../../lib/cn';

/** A parsed row is either usable or carries the reason it is not. */
/**
 * The `?: never` arms keep TypeScript from inferring T off the error branch —
 * without them T widens to include undefined at every call site.
 */
type ValidateResult<T> = { value: T; error?: never } | { value?: never; error: string };

type ImportRow<T> =
  | { line: number; ok: true; value: T }
  | { line: number; ok: false; error: string };

interface Props<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Column names shown in the help text and used by the sample file. */
  columns: string[];
  sampleRow: string[];
  /** Turns one CSV record into a value, or returns an error explaining why not. */
  validate: (record: Record<string, string>, index: number) => ValidateResult<T>;
  /** Called with the rows that passed. Returns how many were actually written. */
  onImport: (rows: T[]) => number | Promise<number>;
}

/**
 * Two-step import: parse and check the whole file first, show exactly what will
 * happen, and only write after the person confirms. Nothing is committed while
 * errors are still on screen — a half-imported customer list is worse than none.
 */
export function ImportModal<T>({ open, onClose, title, columns, sampleRow, validate, onImport }: Props<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow<T>[]>([]);
  const [done, setDone] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => { setFileName(''); setRows([]); setDone(null); };
  const close = () => { reset(); onClose(); };

  const read = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { records } = parseCsvRecords(String(reader.result));
      setFileName(file.name);
      setDone(null);
      setRows(records.map((rec, i): ImportRow<T> => {
        const result = validate(rec, i);
        // +2 because the header occupies line 1.
        return result.error !== undefined
          ? { line: i + 2, ok: false, error: result.error }
          : { line: i + 2, ok: true, value: result.value as T };
      }));
    };
    reader.readAsText(file);
  };

  const good = rows.filter((r): r is Extract<ImportRow<T>, { ok: true }> => r.ok);
  const bad = rows.filter((r): r is Extract<ImportRow<T>, { ok: false }> => !r.ok);

  const downloadSample = () => {
    const csv = [columns, sampleRow].map((r) => r.map((v) => `"${v}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-sample.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description="Upload a CSV. Every row is checked before anything is saved."
      size="lg"
      footer={
        done !== null ? (
          <Button variant="primary" onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              disabled={good.length === 0 || importing}
              onClick={async () => {
                setImporting(true);
                try {
                  setDone(await onImport(good.map((r) => r.value)));
                } finally {
                  setImporting(false);
                }
              }}
            >
              {importing ? 'Importing…' : `Import ${good.length || ''} ${good.length === 1 ? 'row' : 'rows'}`}
            </Button>
          </>
        )
      }
    >
      {done !== null ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CircleCheck size={26} />
          </span>
          <p className="text-[15px] font-semibold text-ink">{done} {done === 1 ? 'row' : 'rows'} imported</p>
          {bad.length > 0 && <p className="text-[12.5px] text-muted">{bad.length} row(s) were skipped.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* ------------------------------------------------------ dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); read(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'grid cursor-pointer place-items-center rounded-lg border border-dashed px-4 py-6 text-center',
              dragOver ? 'border-brand-500 bg-fresh-50' : 'border-line hover:bg-canvas/60',
            )}
          >
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
            <Upload size={20} className="text-subtle" />
            <p className="mt-1.5 text-[13px] font-medium text-ink">
              {fileName || 'Drop a CSV here, or click to choose'}
            </p>
            <p className="text-[11.5px] text-subtle">Expected columns: {columns.join(', ')}</p>
          </div>

          <button onClick={downloadSample} className="self-start text-[12.5px] font-medium text-brand-700 hover:underline">
            Download a sample file
          </button>

          {/* -------------------------------------------------------- summary */}
          {rows.length > 0 && (
            <>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12.5px] font-medium text-emerald-700">
                  <CircleCheck size={14} /> {good.length} ready
                </span>
                {bad.length > 0 && (
                  <span className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12.5px] font-medium text-red-600">
                    <TriangleAlert size={14} /> {bad.length} skipped
                  </span>
                )}
                <button onClick={reset} className="ml-auto flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
                  <X size={13} /> Clear
                </button>
              </div>

              {bad.length > 0 && (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-line">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-canvas/90">
                      <tr className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
                        <th className="w-14 px-2 py-1.5 text-left">Line</th>
                        <th className="px-2 py-1.5 text-left">Why it was skipped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bad.map((r) => (
                        <tr key={r.line} className="border-t border-line">
                          <td className="tabular px-2 py-1.5 text-subtle">{r.line}</td>
                          <td className="px-2 py-1.5 text-red-600">{r.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
