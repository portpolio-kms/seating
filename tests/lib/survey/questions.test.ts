import { describe, it, expect } from 'vitest';
import { Q, studentLabel, pairKey, EMPTY_INCLUDE } from '@/lib/survey/questions';

describe('studentLabel', () => {
  it('formats number and name as "번호. 이름"', () => {
    expect(studentLabel({ number: 3, name: '다온' })).toBe('3. 다온');
  });
});

describe('pairKey', () => {
  it('is order-independent and sorted', () => {
    expect(pairKey('b', 'a')).toBe('a|b');
    expect(pairKey('a', 'b')).toBe('a|b');
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});

describe('Q', () => {
  it('has 13 distinct titles, each starting with a number', () => {
    const values = Object.values(Q);
    expect(values).toHaveLength(13);
    expect(new Set(values).size).toBe(13);
    for (const v of values) {
      expect(v).toMatch(/^\d/);
    }
  });
});

describe('EMPTY_INCLUDE', () => {
  it('has all flags false', () => {
    expect(EMPTY_INCLUDE).toEqual({ ownHardReason: false, toTeacher: false, hardCount: false });
  });
});
