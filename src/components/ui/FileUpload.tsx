import { useRef, useState, type DragEvent } from 'react';
import { FileText, ImagePlus, Upload, X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface FileUploadProps {
  label?: string;
  hint?: string;
  accept?: string;
  value?: { name: string; url: string } | null;
  onChange: (file: { name: string; url: string } | null) => void;
  variant?: 'file' | 'photo';
}

/** Prototype file upload: reads the file into a data URL, nothing leaves the browser. */
export function FileUpload({ label, hint, accept = 'image/*', value, onChange, variant = 'photo' }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ name: file.name, url: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handle(e.dataTransfer.files?.[0]);
  };

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <p className="text-[12.5px] font-medium text-ink">{label}</p>}
        <div className="flex items-center gap-3 rounded-lg border border-line bg-white p-2.5">
          {value.url.startsWith('data:image') ? (
            <img src={value.url} alt={value.name} className="size-12 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="grid size-12 shrink-0 place-items-center rounded-md bg-canvas text-muted"><FileText size={20} /></div>
          )}
          <p className="min-w-0 flex-1 truncate text-[13px] text-ink">{value.name}</p>
          <button onClick={() => onChange(null)} className="rounded p-1.5 text-subtle hover:bg-canvas hover:text-red-600" aria-label="Remove file">
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <p className="text-[12.5px] font-medium text-ink">{label}</p>}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragOver ? 'border-brand-400 bg-brand-50' : 'border-line hover:border-brand-300 hover:bg-canvas',
        )}
      >
        {variant === 'photo' ? <ImagePlus size={20} className="text-subtle" /> : <Upload size={20} className="text-subtle" />}
        <p className="text-[13px] font-medium text-ink">Click to upload or drag & drop</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      </div>
    </div>
  );
}
