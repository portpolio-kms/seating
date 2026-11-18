import { describe, it, expect } from 'vitest';
import { buildUnits, seatCount, validateLayout } from '@/lib/seating/layout';
import { createRng } from '@/lib/seating/rng';
import { displayName } from '@/lib/roster';
import type { Layout, Student } from '@/lib/seating/types';

const base: Layout = { mode: 'pair', rows: 2, cols: 3, groupSize: 4, disabledSeats: [] };

describe('buildUnits', () => {
  it('pair mode: rows*cols units with 2 seats each', () => {
    const units = buildUnits(base);
    expect(units).toHaveLength(6);
    expect(units.every((u) => u.seats.length === 2)).toBe(true);
    expect(units[0].id).toBe('u0-0');
    expect(units[0].seats).toEqual(['u0-0-s0', 'u0-0-s1']);
    expect(units[5].id).toBe('u1-2');
  });

  it('group mode uses groupSize seats', () => {
    const units = buildUnits({ ...base, mode: 'group', groupSize: 6, rows: 2, cols: 2 });
    expect(units).toHaveLength(4);
    expect(units.every((u) => u.seats.length === 6)).toBe(true);
  });

  it('removes disabled seats and drops fully disabled units', () => {
    const one = buildUnits({ ...base, disabledSeats: ['u0-0-s1'] });
    expect(one[0].seats).toEqual(['u0-0-s0']);
    const none = buildUnits({ ...base, disabledSeats: ['u0-0-s0', 'u0-0-s1'] });
    expect(none).toHaveLength(5);
    expect(none.find((u) => u.id === 'u0-0')).toBeUndefined();
  });
});

describe('seatCount / validateLayout', () => {
  const l: Layout = { ...base, rows: 2, cols: 2 };
  it('counts seats', () => expect(seatCount(l)).toBe(8));
  it('reports shortage', () => {
    expect(validateLayout(l, 9)).toEqual(['자리가 1개 부족해요 (학생 9명, 자리 8개)']);
  });
  it('allows spare seats', () => expect(validateLayout(l, 7)).toEqual([]));
});

describe('createRng', () => {
  it('is deterministic and in [0,1)', () => {
    const a = createRng(1);
    const b = createRng(1);
    const sa = [a(), a(), a()];
    expect(sa).toEqual([b(), b(), b()]);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('displayName', () => {
  const s = (id: string, number: number, name: string): Student => ({ id, number, name, gender: null });
  it('appends number for duplicate names', () => {
    const all = [s('a', 1, '가온'), s('b', 3, '가온'), s('c', 2, '나래')];
    expect(displayName(all[1], all)).toBe('가온(3)');
    expect(displayName(all[2], all)).toBe('나래');
  });
});
