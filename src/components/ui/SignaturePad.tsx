import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from './Button';

interface SignaturePadProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  height?: number;
}

/** Touch/mouse signature capture — sized for a driver confirming delivery outdoors. */
export function SignaturePad({ value, onChange, label = 'Customer signature', height = 140 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(!value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#16432a';
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
      img.src = value;
    }
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    setEmpty(false);
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-ink">{label}</p>
        {!empty && (
          <button onClick={clear} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
            <RotateCcw size={12} /> Clear
          </button>
        )}
      </div>
      <div className="relative touch-none rounded-lg border-2 border-dashed border-line bg-canvas/40" style={{ height }}>
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-subtle">Sign here</span>}
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none rounded-lg"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      {!empty && (
        <Button size="xs" variant="ghost" icon={RotateCcw} onClick={clear} className="mt-1.5 md:hidden">Clear</Button>
      )}
    </div>
  );
}
