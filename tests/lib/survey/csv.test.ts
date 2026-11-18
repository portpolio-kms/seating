import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/survey/csv';

describe('parseCsv', () => {
  it('handles quotes, embedded commas/newlines, "" escapes, CRLF', () => {
    expect(parseCsv('a,"b,c","d""e"\r\n1,"x\ny",3')).toEqual([
      ['a', 'b,c', 'd"e'],
      ['1', 'x\ny', '3'],
    ]);
  });
  it('strips a leading BOM', () => {
    expect(parseCsv('﻿a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('keeps empty trailing fields', () => {
    expect(parseCsv('a,,\n')).toEqual([['a', '', '']]);
  });
});
