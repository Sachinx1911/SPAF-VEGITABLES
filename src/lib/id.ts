/** Prototype-only id generator — unique enough for client-side mock data. */
export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Next running document number for a prefix, derived from what already exists —
 * never from an in-memory counter, so a page reload can't hand out a duplicate.
 * nextDocNo(['SO-2609-0118', 'SO-2609-0119'], 'SO-2609-') -> 'SO-2609-0120'
 */
export function nextDocNo(existing: string[], prefix: string, pad = 4): string {
  let max = 0;
  for (const s of existing) {
    if (!s.startsWith(prefix)) continue;
    const n = Number(s.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

/** Period prefix used by operational documents: SO-2609-, PO-2609-, … (YYMM of the given ISO date). */
export function docPrefix(kind: 'SO' | 'PO' | 'GRN' | 'PK' | 'DC', isoDate: string): string {
  return `${kind}-${isoDate.slice(2, 4)}${isoDate.slice(5, 7)}-`;
}
