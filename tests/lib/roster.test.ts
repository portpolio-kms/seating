import { describe, expect, it } from 'vitest';
import { parseRosterText } from '@/lib/roster';

describe('parseRosterText', () => {
  it('skips header and maps gender', () => {
    const r = parseRosterText('번호\t이름\t성별\n1\t가온\t남\n2\t나래\t여자');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { number: 1, name: '가온', gender: 'M' },
      { number: 2, name: '나래', gender: 'F' },
    ]);
  });
  it('names only get auto numbers', () => {
    expect(parseRosterText('가온\n나래').rows.map((r) => r.number)).toEqual([1, 2]);
  });
  it('supports commas, blank gender, trims, skips empty lines', () => {
    const r = parseRosterText(' 3 , 다온 ,\n\n4,라희,x');
    expect(r.rows).toEqual([
      { number: 3, name: '다온', gender: null },
      { number: 4, name: '라희', gender: null },
    ]);
  });
  it('reports bad number', () => {
    const r = parseRosterText('a\t가온');
    expect(r.rows).toEqual([]);
    expect(r.errors).toHaveLength(1);
  });
});
