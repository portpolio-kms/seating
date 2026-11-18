import type { ClassRecord } from '@/lib/db/repo';
import { displayName } from '@/lib/roster';
import type { Student } from '@/lib/seating/types';
import type { StudentMetrics } from './analyze';
import type { ParentInclude, Score, SurveyResult } from './types';

const MASK = '○○';

const squash = (s: string) => s.normalize('NFC').replace(/\s+/g, '');
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Name patterns to hide. Roster names are NFC-normalized with all whitespace removed:
 * the full name, the name minus 1 leading char (len >= 3, drops a surname), minus 2 leading
 * chars (len >= 4, drops a compound surname). For 2-char names the second char alone is
 * masked when directly followed by 이/아/야 (a vocative/subject form like "준이가").
 * Matching tolerates whitespace between characters and ignores case.
 */
function patterns(students: Student[]): string[] {
  const out = new Map<string, { len: number; src: string }>();
  const add = (key: string, len: number, src: string) => {
    if (!out.has(key)) out.set(key, { len, src });
  };
  const spaced = (t: string) => [...t].map(escapeRe).join('\\s*');
  for (const s of students) {
    const name = squash(s.name);
    const chars = [...name];
    if (chars.length === 0) continue;
    const variants = [name];
    if (chars.length >= 3) variants.push(chars.slice(1).join(''));
    if (chars.length >= 4) variants.push(chars.slice(2).join(''));
    for (const v of variants) add(v.toLowerCase(), [...v].length, spaced(v));
    if (chars.length === 2) {
      add(`${chars[1].toLowerCase()}+`, 1, `${escapeRe(chars[1])}(?=[이아야])`);
    }
  }
  // Longest first so the full name wins over its fragments.
  return [...out.values()].sort((a, b) => b.len - a.len).map((p) => p.src);
}

function matcher(students: Student[]): RegExp | null {
  const ps = patterns(students);
  return ps.length === 0 ? null : new RegExp(ps.join('|'), 'giu');
}

/**
 * Replaces every roster name (including the viewed student's own) with "○○", keeping any
 * trailing particle. Safety over precision: ambiguous given-name matches are masked too.
 */
export function maskNames(text: string, students: Student[]): string {
  const re = matcher(students);
  const t = text.normalize('NFC');
  return re ? t.replace(re, MASK) : t;
}

export function containsStudentName(text: string, students: Student[]): boolean {
  const re = matcher(students);
  if (!re) return false;
  re.lastIndex = 0;
  return re.test(text.normalize('NFC'));
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
