import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvRecords, pick } from '../csv';

/** The awkward cases a real spreadsheet export produces. */
describe('parseCsv', () => {
  it('reads a plain file', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps commas that sit inside quotes', () => {
    expect(parseCsv('name,city\n"Shah, Ramesh",Mumbai')).toEqual([
      ['name', 'city'],
      ['Shah, Ramesh', 'Mumbai'],
    ]);
  });

  it('keeps newlines inside quotes as part of the field', () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([['a'], ['line1\nline2']]);
  });

  it('unescapes a doubled quote', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('strips the BOM Excel writes, so the first header still matches', () => {
    const { headers } = parseCsvRecords('﻿Name,Unit\nTomato,Kg');
    expect(headers[0]).toBe('Name');
  });

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseCsvRecords', () => {
  it('keys rows by a normalised header', () => {
    const { records } = parseCsvRecords('Customer Name,GST Number\nSunrise,27AAA');
    expect(records[0].customername).toBe('Sunrise');
    expect(records[0].gstnumber).toBe('27AAA');
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsvRecords('')).toEqual({ headers: [], records: [] });
  });

  it('pads a short row rather than shifting later columns', () => {
    const { records } = parseCsvRecords('a,b,c\n1,2');
    expect(records[0]).toEqual({ a: '1', b: '2', c: '' });
  });
});

describe('pick', () => {
  const rec = { customername: 'Sunrise', phone: '98200 11111' };

  it('accepts any of the spellings a person might use for a column', () => {
    expect(pick(rec, 'name', 'customer name')).toBe('Sunrise');
    expect(pick(rec, 'Customer Name')).toBe('Sunrise');
    expect(pick(rec, 'CUSTOMERNAME')).toBe('Sunrise');
  });

  it('falls through to the next name when the first is absent', () => {
    expect(pick(rec, 'mobile', 'phone')).toBe('98200 11111');
  });

  it('returns an empty string when nothing matches', () => {
    expect(pick(rec, 'email')).toBe('');
  });
});
