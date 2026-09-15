type ClassValue = string | number | false | null | undefined | ClassValue[] | Record<string, boolean | undefined>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v) return;
    if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else for (const k in v) if (v[k]) out.push(k);
  };
  inputs.forEach(walk);
  return out.join(' ');
}
