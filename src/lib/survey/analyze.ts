import type { ClassRecord } from '@/lib/db/repo';
import { displayName } from '@/lib/roster';
import { pairKey } from './questions';
import type { SurveyResult } from './types';

export interface StudentMetrics {
  studentId: string;
  responded: boolean;
  receivedAvg: number | null;
  receivedCount: number;
  lowRatio: number | null;
  mutual: string[];
  likesOneSided: string[];
  likedByOneSided: string[];
  nominated: string[];
  nominatedBy: string[];
  isolatedRef: boolean;
}

export type RadarLevel = 'high' | 'medium';
export interface RadarItem {
  studentId: string;
  level: RadarLevel;
  reasons: string[];
  noResponse: boolean;
}
export interface Suggestion {
  key: string;
  a: string;
  b: string;
  mutual: boolean;
  status: 'new' | 'exists' | 'dismissed';
}
export type EdgeFilter = 'mutual' | 'strong' | 'hard';
export interface GraphData {
  nodes: { id: string; label: string; size: number; flag: RadarLevel | null }[];
  edges: { from: string; to: string; kind: 'mutual' | 'oneSided' | 'hard' }[];
}
export interface EgoZones {
  right: string[];
  bottom: string[];
  top: string[];
  left: string[];
}

const rating = (r: SurveyResult, from: string, to: string) => r.responses[from]?.ratings[to] ?? null;

export function analyzeSurvey(
  result: SurveyResult,
  cls: ClassRecord,
): Record<string, StudentMetrics> {
  const ids = cls.students.map((s) => s.id);
  const roster = new Set(ids);
  const out: Record<string, StudentMetrics> = {};
  for (const id of ids) {
    const resp = result.responses[id];
    // Scores given by anyone (including deleted students) to this student.
    const received: number[] = [];
    for (const [from, r] of Object.entries(result.responses)) {
      if (from === id) continue;
      const v = r.ratings[id];
      if (v != null) received.push(v);
    }
    const mutual: string[] = [];
    const likes: string[] = [];
    const likedBy: string[] = [];
    for (const other of ids) {
      if (other === id) continue;
      const mine = rating(result, id, other);
      const theirs = rating(result, other, id);
      if (mine != null && theirs != null) {
        if (mine >= 4 && theirs >= 4) mutual.push(other);
        else if (mine >= 4 && theirs <= 2) likes.push(other);
        else if (theirs >= 4 && mine <= 2) likedBy.push(other);
      }
    }
    const nominatedBy = ids.filter((o) => o !== id && result.responses[o]?.hard.includes(id));
    out[id] = {
      studentId: id,
      responded: !!resp,
      receivedAvg: received.length ? received.reduce((a, b) => a + b, 0) / received.length : null,
      receivedCount: received.length,
      lowRatio: received.length ? received.filter((v) => v <= 2).length / received.length : null,
      mutual,
      likesOneSided: likes,
      likedByOneSided: likedBy,
      nominated: resp ? resp.hard.filter((h) => roster.has(h) && h !== id) : [],
      nominatedBy,
      isolatedRef: !!resp && mutual.length === 0 && (resp.alone === 4 || resp.alone === 5),
    };
  }
  return out;
}

export function buildRadar(
  result: SurveyResult,
  cls: ClassRecord,
  m: Record<string, StudentMetrics>,
): { items: RadarItem[]; notResponded: string[] } {
  const items: RadarItem[] = [];
  const notResponded: string[] = [];
  for (const s of cls.students) {
    const x = m[s.id];
    if (!x) continue;
    const resp = result.responses[s.id];
    if (!resp) notResponded.push(s.id);
    const reasons: string[] = [];
    let high = false;
    let medium = false;
    if (resp?.happy === 1 || resp?.happy === 2) {
      high = true;
      reasons.push(`자아 만족도 ${resp.happy}점`);
    }
    if (resp?.schoolFun === 1 || resp?.schoolFun === 2) {
      medium = true;
      reasons.push(`학교생활 즐거움 ${resp.schoolFun}점`);
    }
    const k = x.nominatedBy.length;
    if (k >= 2) high = true;
    else if (k === 1) medium = true;
    if (k >= 1) reasons.push(`친구 ${k}명이 함께 있기 힘들다고 적음`);
    if (k === 0 && x.receivedCount >= 5 && x.lowRatio != null && x.lowRatio >= 0.3) {
      medium = true;
      reasons.push(`받은 점수 중 낮은 점수 ${Math.round(x.lowRatio * 100)}%`);
    }
    if (high || medium) {
      items.push({
        studentId: s.id,
        level: high ? 'high' : 'medium',
        reasons,
        noResponse: !resp,
      });
    }
  }
  const order = new Map(cls.students.map((s, i) => [s.id, s.number * 1000 + i]));
  items.sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1) ||
      order.get(a.studentId)! - order.get(b.studentId)!,
  );
  return { items, notResponded };
}

export function buildSuggestions(result: SurveyResult, cls: ClassRecord): Suggestion[] {
  const roster = new Set(cls.students.map((s) => s.id));
  const pairs = new Map<string, { a: string; b: string; dirs: Set<string> }>();
  for (const [from, r] of Object.entries(result.responses)) {
    if (!roster.has(from)) continue;
    for (const to of r.hard) {
      if (!roster.has(to) || to === from) continue;
      const key = pairKey(from, to);
      const [a, b] = key.split('|');
      const e = pairs.get(key) ?? { a, b, dirs: new Set<string>() };
      e.dirs.add(from);
      pairs.set(key, e);
    }
  }
  const existing = new Set(cls.constraints.map((c) => pairKey(c.a, c.b)));
  const dismissed = new Set(result.dismissed);
  return [...pairs.entries()].map(([key, e]) => ({
    key,
    a: e.a,
    b: e.b,
    mutual: e.dirs.size === 2,
    status: existing.has(key) ? 'exists' : dismissed.has(key) ? 'dismissed' : 'new',
  }));
}

export function buildGraph(
  result: SurveyResult,
  cls: ClassRecord,
  m: Record<string, StudentMetrics>,
  radar: RadarItem[],
  filter: EdgeFilter,
): GraphData {
  const flags = new Map(radar.map((r) => [r.studentId, r.level]));
  const nodes = cls.students.map((s) => ({
    id: s.id,
    label: displayName(s, cls.students),
    size: 16 + ((m[s.id]?.receivedAvg ?? 3) - 1) * 6,
    flag: flags.get(s.id) ?? null,
  }));
  const edges: GraphData['edges'] = [];
  const ids = cls.students.map((s) => s.id);
  if (filter === 'hard') {
    for (const id of ids) {
      for (const to of m[id]?.nominated ?? []) edges.push({ from: id, to, kind: 'hard' });
    }
  } else {
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        if (m[a]?.mutual.includes(b)) {
          if (a < b) edges.push({ from: a, to: b, kind: 'mutual' });
        } else if (filter === 'strong' && (rating(result, a, b) ?? 0) >= 4) {
          edges.push({ from: a, to: b, kind: 'oneSided' });
        }
      }
    }
  }
  return { nodes, edges };
}

export function egoZones(
  centerId: string,
  result: SurveyResult,
  cls: ClassRecord,
  m: Record<string, StudentMetrics>,
): EgoZones {
  const zones: EgoZones = { right: [], bottom: [], top: [], left: [] };
  const c = m[centerId];
  if (!c) return zones;
  for (const s of cls.students) {
    const o = s.id;
    if (o === centerId) continue;
    const mine = rating(result, centerId, o);
    const theirs = rating(result, o, centerId);
    const hard = c.nominated.includes(o) || c.nominatedBy.includes(o);
    if (hard || (mine != null && theirs != null && mine <= 2 && theirs <= 2)) zones.top.push(o);
    else if (c.mutual.includes(o)) zones.right.push(o);
    else if ((mine ?? 0) >= 4 || (theirs ?? 0) >= 4) zones.bottom.push(o);
    else zones.left.push(o);
  }
  return zones;
}
