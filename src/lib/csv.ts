/**
 * Minimal CSV reader for the Import buttons.
 *
 * Handles what a spreadsheet export actually produces: quoted fields, commas
 * and newlines inside quotes, escaped double quotes, and both CRLF and LF.
 * That is enough for the masters files staff paste out of Excel, and it keeps
 * a parser dependency out of the bundle.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a BOM — Excel writes one and it corrupts the first header.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }

  // Whatever is still buffered is the last field of the last row.
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Turns a CSV into objects keyed by header. Headers are matched loosely —
 * case, spaces and punctuation are ignored — so "Customer Name", "customer_name"
 * and "CUSTOMERNAME" all reach the same field.
 */
export function parseCsvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], records: [] };

  const headers = rows[0].map((h) => h.trim());
  const keys = headers.map(normaliseKey);
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => { rec[k] = (r[i] ?? '').trim(); });
    return rec;
  });
  return { headers, records };
}

export const normaliseKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Reads the first value present out of several accepted column spellings. */
export function pick(rec: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const v = rec[normaliseKey(n)];
    if (v) return v;
  }
  return '';
}
