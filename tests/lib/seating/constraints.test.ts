import { describe, it, expect } from 'vitest';
import { canAddConstraint, effectiveConstraints, validateConstraints } from '@/lib/seating/constraints';
import type { Layout, PairConstraint, Student } from '@/lib/seating/types';

const names = ['가온', '나래', '다온', '라희', '마루'];
const students: Student[] = names.map((name, i) => ({ id: `s${i}`, number: i + 1, name, gender: null }));
const [A, B, C, D, E] = students.map((s) => s.id);
const c = (id: string, a: string, b: string, kind: PairConstraint['kind']): PairConstraint => ({ id, a, b, kind });
const group4: Layout = { mode: 'group', rows: 2, cols: 2, groupSize: 4, disabledSeats: [] };
const pairLayout: Layout = { mode: 'pair', rows: 2, cols: 3, groupSize: 4, disabledSeats: [] };

describe('effectiveConstraints', () => {
  it('avoid-pair applies only in pair mode', () => {
    const cs = [c('1', A, B, 'avoid-pair')];
    expect(effectiveConstraints(cs, 'group').apart).toEqual([]);
    expect(effectiveConstraints(cs, 'pair').apart).toEqual([[A, B]]);
  });
  it('avoid-group applies in both modes', () => {
    const cs = [c('1', A, B, 'avoid-group')];
    expect(effectiveConstraints(cs, 'pair').apart).toEqual([[A, B]]);
    expect(effectiveConstraints(cs, 'group').apart).toEqual([[A, B]]);
  });
  it('must-group is ignored in pair mode, must-pair applies in both', () => {
    const cs = [c('1', A, B, 'must-group'), c('2', C, D, 'must-pair')];
    expect(effectiveConstraints(cs, 'pair').together).toEqual([[C, D]]);
    expect(effectiveConstraints(cs, 'group').together).toEqual([[A, B], [C, D]]);
  });
});

describe('canAddConstraint', () => {
  it('rejects second must-pair for a student', () => {
    expect(canAddConstraint([c('1', A, B, 'must-pair')], { a: A, b: C, kind: 'must-pair' })).toBe(
      '이미 반드시 짝인 친구가 있는 학생이에요',
    );
  });
  it('rejects duplicate pair in either order', () => {
    const cs = [c('1', A, B, 'avoid-pair')];
    expect(canAddConstraint(cs, { a: A, b: B, kind: 'must-group' })).toBe('이미 조건이 있는 두 학생이에요');
    expect(canAddConstraint(cs, { a: B, b: A, kind: 'must-group' })).toBe('이미 조건이 있는 두 학생이에요');
  });
  it('rejects same student', () => {
    expect(canAddConstraint([], { a: A, b: A, kind: 'avoid-pair' })).toBe('서로 다른 두 학생을 골라 주세요');
  });
  it('allows valid addition', () => {
    expect(canAddConstraint([c('1', A, B, 'must-pair')], { a: C, b: D, kind: 'must-pair' })).toBeNull();
  });
});

describe('validateConstraints', () => {
  const chain = [c('1', A, B, 'must-pair'), c('2', B, C, 'must-group'), c('3', A, C, 'avoid-group')];
  it('reports together cluster containing an apart pair', () => {
    const msgs = validateConstraints(students, chain, group4);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    const all = msgs.join(' ');
    for (const n of ['가온', '나래', '다온']) expect(all).toContain(n);
  });
  it('reports cluster larger than group size', () => {
    const cs = [
      c('1', A, B, 'must-group'),
      c('2', B, C, 'must-group'),
      c('3', C, D, 'must-group'),
      c('4', D, E, 'must-group'),
    ];
    expect(validateConstraints(students, cs, group4)).toEqual([
      '함께 앉아야 하는 학생 5명이 모둠 인원(4명)보다 많아요',
    ]);
  });
  it('3-student must-group cluster is fine in group 4', () => {
    const cs = [c('1', A, B, 'must-group'), c('2', B, C, 'must-group')];
    expect(validateConstraints(students, cs, group4)).toEqual([]);
  });
  it('same constraints under pair layout: must-group ignored', () => {
    const cs = [c('1', A, B, 'must-group'), c('2', B, C, 'must-group')];
    expect(validateConstraints(students, cs, pairLayout)).toEqual([]);
  });
  it('uses disambiguated names for duplicates', () => {
    const dup: Student[] = [...students, { id: 'x', number: 9, name: '가온', gender: null }];
    const cs = [c('1', A, 'x', 'must-pair'), c('2', A, 'x', 'avoid-group')];
    const msgs = validateConstraints(dup, cs, pairLayout);
    expect(msgs.join(' ')).toContain('가온(9)');
  });
});
