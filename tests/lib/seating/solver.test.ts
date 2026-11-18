import { describe, it, expect } from 'vitest';
import { generateSeating, findViolations } from '@/lib/seating/solver';
import { buildUnits } from '@/lib/seating/layout';
import { createRng } from '@/lib/seating/rng';
import type { Assignment, Gender, Layout, PairConstraint, Student } from '@/lib/seating/types';

const NAMES = [
  '가온', '나래', '다온', '라희', '마루', '바다', '사랑', '아라',
  '자람', '차오', '하늘', '한별', '누리', '도담', '보미', '솔이',
];
const makeStudents = (n: number, gender: (i: number) => Gender = () => null): Student[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, number: i + 1, name: NAMES[i % NAMES.length], gender: gender(i) }));
const students16 = makeStudents(16);
const ids = students16.map((s) => s.id);
const c = (id: string, a: string, b: string, kind: PairConstraint['kind']): PairConstraint => ({ id, a, b, kind });

const pair4x2: Layout = { mode: 'pair', rows: 4, cols: 2, groupSize: 4, disabledSeats: [] }; // 16 seats
const group4x4: Layout = { mode: 'group', rows: 2, cols: 2, groupSize: 4, disabledSeats: [] }; // 16 seats

function unitOf(assignment: Assignment, layout: Layout): Map<string, string> {
  const m = new Map<string, string>();
  for (const u of buildUnits(layout)) for (const s of u.seats) if (assignment[s]) m.set(assignment[s]!, u.id);
  return m;
}

function solve(seed: number, layout: Layout, constraints: PairConstraint[] = [], students = students16, genderRule = false) {
  return generateSeating({ students, layout, constraints, genderRule, rng: createRng(seed) });
}

describe('generateSeating', () => {
  it('seats every student exactly once on usable seats when there are no constraints', () => {
    const layout: Layout = { ...pair4x2, cols: 3, disabledSeats: ['u0-0-s1'] };
    const r = solve(1, layout);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const usable = new Set(buildUnits(layout).flatMap((u) => u.seats));
    const seated = Object.entries(r.assignment).filter(([, v]) => v !== null);
    for (const [seat] of Object.entries(r.assignment)) expect(usable.has(seat)).toBe(true);
    expect(seated.map(([, v]) => v).sort()).toEqual([...ids].sort());
    expect(r.violations).toBe(0);
  });

  it('never violates constraints over 1,000 seeds', () => {
    const cs = [
      c('1', ids[0], ids[1], 'avoid-pair'),
      c('2', ids[2], ids[3], 'avoid-pair'),
      c('3', ids[4], ids[5], 'avoid-pair'),
      c('4', ids[0], ids[6], 'must-pair'),
      c('5', ids[2], ids[7], 'must-pair'),
    ];
    for (let seed = 1; seed <= 1000; seed++) {
      const r = solve(seed, pair4x2, cs);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(findViolations(r.assignment, pair4x2, cs)).toEqual([]);
    }
  });

  it('places a must-pair in many different units across seeds', () => {
    const cs = [c('1', ids[0], ids[1], 'must-pair')];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 1000; seed++) {
      const r = solve(seed, pair4x2, cs);
      if (!r.ok) throw new Error('unexpected failure');
      seen.add(unitOf(r.assignment, pair4x2).get(ids[0])!);
    }
    expect(seen.size).toBeGreaterThanOrEqual(Math.ceil(buildUnits(pair4x2).length * 0.8));
  });

  it('spreads a student evenly over units without constraints', () => {
    const units = buildUnits(pair4x2);
    const counts = new Map<string, number>(units.map((u) => [u.id, 0]));
    const runs = 2000;
    for (let seed = 1; seed <= runs; seed++) {
      const r = solve(seed, pair4x2);
      if (!r.ok) throw new Error('unexpected failure');
      const u = unitOf(r.assignment, pair4x2).get(ids[5])!;
      counts.set(u, counts.get(u)! + 1);
    }
    const expected = runs / units.length;
    for (const n of counts.values()) {
      expect(n).toBeGreaterThanOrEqual(expected * 0.65);
      expect(n).toBeLessThanOrEqual(expected * 1.35);
    }
  });

  it('fails when four mutually avoid-group students must fit in three groups', () => {
    const layout: Layout = { mode: 'group', rows: 1, cols: 3, groupSize: 6, disabledSeats: [] };
    const four = ids.slice(0, 4);
    const cs: PairConstraint[] = [];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) cs.push(c(`${i}${j}`, four[i], four[j], 'avoid-group'));
    const r = solve(1, layout, cs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toEqual(['조건을 모두 지키는 배치를 찾지 못했어요. 조건이나 배치 설정을 확인해 주세요.']);
  });

  it('reports a seat shortage for 9 students and 8 seats', () => {
    const layout: Layout = { mode: 'pair', rows: 2, cols: 2, groupSize: 4, disabledSeats: [] };
    const r = solve(1, layout, [], makeStudents(9));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons.some((m) => m.includes('자리가 1개 부족해요'))).toBe(true);
  });

  it('genderRule makes 8 mixed pairs and still varies by seed', () => {
    const mixed = makeStudents(16, (i) => (i < 8 ? 'M' : 'F'));
    const byId = new Map(mixed.map((s) => [s.id, s]));
    const results = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const r = solve(seed, pair4x2, [], mixed, true);
      if (!r.ok) throw new Error('unexpected failure');
      for (const u of buildUnits(pair4x2)) {
        const genders = u.seats.map((s) => byId.get(r.assignment[s]!)!.gender).sort();
        expect(genders).toEqual(['F', 'M']);
      }
      results.add(JSON.stringify(r.assignment));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('genderRule balances 4-person groups to 2 boys and 2 girls', () => {
    const mixed = makeStudents(16, (i) => (i % 2 === 0 ? 'M' : 'F'));
    const byId = new Map(mixed.map((s) => [s.id, s]));
    for (let seed = 1; seed <= 20; seed++) {
      const r = solve(seed, group4x4, [], mixed, true);
      if (!r.ok) throw new Error('unexpected failure');
      for (const u of buildUnits(group4x4)) {
        const genders = u.seats.map((s) => byId.get(r.assignment[s]!)!.gender);
        expect(genders.filter((g) => g === 'M')).toHaveLength(2);
        expect(genders.filter((g) => g === 'F')).toHaveLength(2);
      }
    }
  });

  it('genderRule keeps hard constraints', () => {
    const mixed = makeStudents(16, (i) => (i < 8 ? 'M' : 'F'));
    const cs = [c('1', ids[0], ids[1], 'must-pair'), c('2', ids[8], ids[9], 'avoid-pair'), c('3', ids[2], ids[10], 'avoid-pair')];
    for (let seed = 1; seed <= 100; seed++) {
      const r = solve(seed, pair4x2, cs, mixed, true);
      if (!r.ok) throw new Error('unexpected failure');
      expect(findViolations(r.assignment, pair4x2, cs)).toEqual([]);
    }
  });
});

describe('findViolations', () => {
  const assignment: Assignment = {
    'u0-0-s0': ids[0], 'u0-0-s1': ids[1],
    'u0-1-s0': ids[2], 'u0-1-s1': ids[3],
  };
  const layout: Layout = { mode: 'pair', rows: 1, cols: 2, groupSize: 4, disabledSeats: [] };

  it('returns violated apart and together constraints', () => {
    const apart = c('1', ids[0], ids[1], 'avoid-pair');
    const together = c('2', ids[0], ids[2], 'must-pair');
    const fine = c('3', ids[2], ids[3], 'must-pair');
    expect(findViolations(assignment, layout, [apart, together, fine])).toEqual([apart, together]);
  });

  it('uses the layout mode semantics', () => {
    const groupLayout: Layout = { ...layout, mode: 'group' };
    const groupAssignment: Assignment = { 'u0-0-s0': ids[0], 'u0-0-s1': ids[1], 'u0-1-s0': ids[2] };
    const avoidPair = c('1', ids[0], ids[1], 'avoid-pair'); // ignored in group mode
    const mustGroup = c('2', ids[0], ids[2], 'must-group'); // ignored in pair mode
    expect(findViolations(groupAssignment, groupLayout, [avoidPair, mustGroup])).toEqual([mustGroup]);
    expect(findViolations(assignment, layout, [mustGroup])).toEqual([]);
  });
});
