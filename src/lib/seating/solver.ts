import { effectiveConstraints, togetherClusters, validateConstraints } from './constraints';
import { buildUnits, validateLayout } from './layout';
import type { Assignment, Gender, Layout, LayoutMode, PairConstraint, Student, Unit } from './types';

export interface SolveInput {
  students: Student[];
  layout: Layout;
  constraints: PairConstraint[];
  genderRule: boolean;
  rng: () => number;
}
export type SolveResult = { ok: true; assignment: Assignment; violations: 0 } | { ok: false; reasons: string[] };

const NO_SOLUTION = '조건을 모두 지키는 배치를 찾지 못했어요. 조건이나 배치 설정을 확인해 주세요.';
const NODE_LIMIT = 20000;
const MAX_ATTEMPTS = 50;

type Rng = () => number;
type ApartMap = Map<string, Set<string>>;

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Number of ways to choose k of n seats. */
function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/**
 * Random order of items without replacement where each next item is drawn with probability
 * proportional to its weight (Efraimidis–Spirakis keys). Zero-weight items are dropped.
 */
function weightedOrder(weights: number[], rng: Rng): number[] {
  return weights
    .map((w, i) => ({ i, w, key: w > 0 ? Math.pow(rng(), 1 / w) : -1 }))
    .filter((e) => e.w > 0)
    .sort((a, b) => b.key - a.key)
    .map((e) => e.i);
}

function clashes(id: string, members: string[], apart: ApartMap, ignore?: string): boolean {
  const avoid = apart.get(id);
  return !!avoid && members.some((m) => m !== ignore && avoid.has(m));
}

/**
 * Randomized backtracking: chunks (together clusters) go into units with enough free seats
 * and no apart partner. Returns members per unit index, or null when no arrangement exists
 * (search exhausted or every restart hit the node limit).
 */
function placeChunks(chunks: string[][], units: Unit[], apart: ApartMap, rng: Rng): string[][] | null {
  const degree = (chunk: string[]) => chunk.reduce((n, id) => n + (apart.get(id)?.size ?? 0), 0);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Random order, then biggest first; most-constrained first among equal sizes (stable sort keeps randomness).
    const order = shuffle([...chunks], rng).sort((a, b) => b.length - a.length || degree(b) - degree(a));
    const occupants: string[][] = units.map(() => []);
    let nodes = 0;
    let aborted = false;

    const place = (i: number): boolean => {
      if (i === order.length) return true;
      const chunk = order[i];
      // Weight each unit by the number of seat sets the chunk could take there, so a chunk lands on a
      // uniformly random set of free seats no matter when it is placed (spec 5.4: no visible pattern).
      const weights = units.map((unit, u) => choose(unit.seats.length - occupants[u].length, chunk.length));
      for (const u of weightedOrder(weights, rng)) {
        const here = occupants[u];
        if (chunk.some((id) => clashes(id, here, apart))) continue;
        if (++nodes > NODE_LIMIT) {
          aborted = true;
          return false;
        }
        here.push(...chunk);
        if (place(i + 1)) return true;
        here.splice(here.length - chunk.length, chunk.length);
        if (aborted) return false;
      }
      return false;
    };

    if (place(0)) return occupants;
    if (!aborted) return null; // exhaustive search proved it impossible
  }
  return null;
}

function unitScore(members: string[], genderOf: Map<string, Gender>, mode: LayoutMode): number {
  let m = 0;
  let f = 0;
  for (const id of members) {
    const g = genderOf.get(id);
    if (g === 'M') m++;
    else if (g === 'F') f++;
  }
  if (mode === 'pair') return members.length === 2 && m === 1 && f === 1 ? 1 : 0;
  return -Math.abs(m - f);
}

/**
 * Hill-climb on gender balance: swap two movable students in different units, in random order,
 * accepting only strict improvements that keep every apart constraint. Stops after a pass with no gain.
 */
function improveGender(
  occupants: string[][],
  movable: string[],
  apart: ApartMap,
  genderOf: Map<string, Gender>,
  mode: LayoutMode,
  rng: Rng,
): void {
  const loc = new Map<string, number>();
  occupants.forEach((members, u) => members.forEach((id) => loc.set(id, u)));
  const pairs: [string, string][] = [];
  for (let i = 0; i < movable.length; i++) {
    for (let j = i + 1; j < movable.length; j++) {
      if (genderOf.get(movable[i]) !== genderOf.get(movable[j])) pairs.push([movable[i], movable[j]]);
    }
  }

  let improved = true;
  while (improved) {
    improved = false;
    for (const [x, y] of shuffle(pairs, rng)) {
      const ux = loc.get(x)!;
      const uy = loc.get(y)!;
      if (ux === uy) continue;
      const nextX = occupants[ux].map((id) => (id === x ? y : id));
      const nextY = occupants[uy].map((id) => (id === y ? x : id));
      const gain =
        unitScore(nextX, genderOf, mode) + unitScore(nextY, genderOf, mode) -
        unitScore(occupants[ux], genderOf, mode) - unitScore(occupants[uy], genderOf, mode);
      if (gain <= 0) continue;
      if (clashes(y, occupants[ux], apart, x) || clashes(x, occupants[uy], apart, y)) continue;
      occupants[ux] = nextX;
      occupants[uy] = nextY;
      loc.set(x, uy);
      loc.set(y, ux);
      improved = true;
    }
  }
}

export function generateSeating({ students, layout, constraints, genderRule, rng }: SolveInput): SolveResult {
  const reasons = [...validateLayout(layout, students.length), ...validateConstraints(students, constraints, layout)];
  if (reasons.length > 0) return { ok: false, reasons };

  const units = buildUnits(layout);
  const known = new Set(students.map((s) => s.id));
  const relevant = (pairs: [string, string][]) => pairs.filter(([a, b]) => a !== b && known.has(a) && known.has(b));
  const eff = effectiveConstraints(constraints, layout.mode);

  const apart: ApartMap = new Map();
  for (const [a, b] of relevant(eff.apart)) {
    if (!apart.has(a)) apart.set(a, new Set());
    if (!apart.has(b)) apart.set(b, new Set());
    apart.get(a)!.add(b);
    apart.get(b)!.add(a);
  }

  const clusters = togetherClusters(relevant(eff.together));
  const clustered = new Set(clusters.flat());
  const singles = students.map((s) => s.id).filter((id) => !clustered.has(id));
  const chunks = [...clusters, ...singles.map((id) => [id])];

  const occupants = placeChunks(chunks, units, apart, rng);
  if (!occupants) return { ok: false, reasons: [NO_SOLUTION] };

  if (genderRule) {
    const genderOf = new Map(students.map((s) => [s.id, s.gender]));
    improveGender(occupants, singles, apart, genderOf, layout.mode, rng);
  }

  const assignment: Assignment = {};
  units.forEach((unit, u) => {
    const seats = shuffle([...unit.seats], rng);
    seats.forEach((seat, k) => {
      assignment[seat] = occupants[u][k] ?? null;
    });
  });
  return { ok: true, assignment, violations: 0 };
}

/** Constraints broken by an assignment under the layout's mode semantics (for teacher checks and manual swaps). */
export function findViolations(assignment: Assignment, layout: Layout, cs: PairConstraint[]): PairConstraint[] {
  const unitOf = new Map<string, string>();
  for (const unit of buildUnits(layout)) {
    for (const seat of unit.seats) {
      const id = assignment[seat];
      if (id) unitOf.set(id, unit.id);
    }
  }
  return cs.filter((c) => {
    const ua = unitOf.get(c.a);
    const ub = unitOf.get(c.b);
    if (ua === undefined || ub === undefined) return false;
    const { together, apart } = effectiveConstraints([c], layout.mode);
    if (apart.length > 0) return ua === ub;
    if (together.length > 0) return ua !== ub;
    return false;
  });
}
