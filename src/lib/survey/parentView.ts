import type { ClassRecord } from '@/lib/db/repo';
import { displayName } from '@/lib/roster';
import type { Student } from '@/lib/seating/types';
import type { StudentMetrics } from './analyze';
import type { ParentInclude, Score, SurveyResult } from './types';

const MASK = '○○';

/** Names to hide: full name, plus the given name (surname dropped) when the name has 3+ chars. */
function nameTokens(students: Student[]): string[] {
  const set = new Set<string>();
  for (const s of students) {
    const name = s.name.trim();
    if (!name) continue;
    set.add(name);
    if (name.length >= 3) set.add(name.slice(1));
  }
  // Longest first so "김가온" wins over "가온". Trailing particles are left untouched
  // because only the name itself is replaced.
  return [...set].sort((a, b) => b.length - a.length);
}

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function tokenSource(students: Student[]): string | null {
  const tokens = nameTokens(students);
  return tokens.length === 0 ? null : tokens.map(escapeRe).join('|');
}

/**
 * Replaces every roster name (including the viewed student's own) with "○○".
 * Safety over precision: an ambiguous given-name match inside another word is masked too.
 */
export function maskNames(text: string, students: Student[]): string {
  const src = tokenSource(students);
  return src ? text.replace(new RegExp(src, 'g'), MASK) : text;
}

export function containsStudentName(text: string, students: Student[]): boolean {
  const src = tokenSource(students);
  return src ? new RegExp(src).test(text) : false;
}

export interface ParentCard {
  studentLabel: string;
  surveyName: string;
  receivedAvg: number | null;
  mutualCount: number;
  playWithCount: number;
  helpFromCount: number;
  hardCount: number | null; // only when include.hardCount
  scores: {
    alone: Score | null;
    happy: Score | null;
    schoolFun: Score | null;
    family: Score | null;
  } | null; // null when the student did not respond
  texts: { label: string; text: string }[]; // own free text only, names masked
}

export function buildParentCard(
  result: SurveyResult,
  studentId: string,
  cls: ClassRecord,
  m: StudentMetrics,
  include: ParentInclude,
): ParentCard {
  const student = cls.students.find((s) => s.id === studentId);
  const resp = result.responses[studentId];
  const texts: ParentCard['texts'] = [];
  if (resp && include.ownHardReason && resp.hardReason.trim()) {
    texts.push({
      label: '친구 관계 고민(본인)',
      text: maskNames(resp.hardReason, cls.students),
    });
  }
  if (resp && include.toTeacher && resp.toTeacher.trim()) {
    texts.push({
      label: '선생님께 하고 싶은 말',
      text: maskNames(resp.toTeacher, cls.students),
    });
  }
  return {
    studentLabel: student ? displayName(student, cls.students) : '',
    surveyName: result.name,
    receivedAvg: m.receivedAvg,
    mutualCount: m.mutual.length,
    playWithCount: resp?.playWith.length ?? 0,
    helpFromCount: resp?.helpFrom.length ?? 0,
    hardCount: include.hardCount ? m.nominatedBy.length : null,
    scores: resp
      ? { alone: resp.alone, happy: resp.happy, schoolFun: resp.schoolFun, family: resp.family }
      : null,
    texts,
  };
}
