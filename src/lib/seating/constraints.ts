import { displayName } from '../roster';
import { buildUnits } from './layout';
import type {
  ConstraintKind,
  EffectiveConstraints,
  Layout,
  LayoutMode,
  PairConstraint,
  Student,
} from './types';

const APART_KINDS: Record<LayoutMode, ConstraintKind[]> = {
  pair: ['avoid-pair', 'avoid-group'],
  group: ['avoid-group'],
};
const TOGETHER_KINDS: Record<LayoutMode, ConstraintKind[]> = {
  pair: ['must-pair'],
  group: ['must-pair', 'must-group'],
};

export function effectiveConstraints(cs: PairConstraint[], mode: LayoutMode): EffectiveConstraints {
  const pick = (kinds: ConstraintKind[]): [string, string][] =>
    cs.filter((c) => kinds.includes(c.kind)).map((c) => [c.a, c.b]);
  return { together: pick(TOGETHER_KINDS[mode]), apart: pick(APART_KINDS[mode]) };
}

export function togetherClusters(pairs: [string, string][]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const [a, b] of pairs) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const g = groups.get(root);
    if (g) g.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()];
}

export function validateConstraints(students: Student[], cs: PairConstraint[], layout: Layout): string[] {
  const { together, apart } = effectiveConstraints(cs, layout.mode);
  const byId = new Map(students.map((s) => [s.id, s]));
  const name = (id: string) => {
    const s = byId.get(id);
    return s ? displayName(s, students) : id;
  };
  const maxSeats = buildUnits(layout).reduce((m, u) => Math.max(m, u.seats.length), 0);
  const messages: string[] = [];

  for (const cluster of togetherClusters(together)) {
    if (maxSeats > 0 && cluster.length > maxSeats) {
      messages.push(`함께 앉아야 하는 학생 ${cluster.length}명이 모둠 인원(${maxSeats}명)보다 많아요`);
    }
    const members = new Set(cluster);
    const names = cluster.map(name).join(', ');
    for (const [a, b] of apart) {
      if (members.has(a) && members.has(b)) {
        messages.push(
          `${names} 학생은 함께 앉아야 하는 무리인데, ${name(a)}, ${name(b)} 학생은 떨어져야 하는 조건도 있어요`,
        );
      }
    }
  }
  return messages;
}

export function canAddConstraint(cs: PairConstraint[], next: Omit<PairConstraint, 'id'>): string | null {
  if (next.a === next.b) return '서로 다른 두 학생을 골라 주세요';
  const samePair = cs.some(
    (c) => (c.a === next.a && c.b === next.b) || (c.a === next.b && c.b === next.a),
  );
  if (samePair) return '이미 조건이 있는 두 학생이에요';
  if (next.kind === 'must-pair') {
    const taken = cs.some(
      (c) => c.kind === 'must-pair' && [c.a, c.b].some((id) => id === next.a || id === next.b),
    );
    if (taken) return '이미 반드시 짝인 친구가 있는 학생이에요';
  }
  return null;
}
