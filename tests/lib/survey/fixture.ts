import type { ClassRecord } from '@/lib/db/repo';
import { Q, studentLabel } from '@/lib/survey/questions';
import type { Score, SurveyResponse, SurveyResult } from '@/lib/survey/types';

const NAMES = ['가온', '나래', '다온', '라희', '마루', '바다'];

export function fakeClass(n = 4): ClassRecord {
  return {
    id: 'c1',
    name: '테스트반',
    students: NAMES.slice(0, n).map((name, i) => ({
      id: `s${i + 1}`,
      number: i + 1,
      name,
      gender: null,
    })),
    layout: { mode: 'pair', rows: 3, cols: 3, groupSize: 4, disabledSeats: [] },
    constraints: [],
    genderRule: false,
    lastRevealStyle: 'A',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

export interface CsvRow {
  timestamp?: string;
  name: string; // "내 이름" label
  ratings?: Record<string, string>; // student label -> "1".."5"
  best?: string[];
  wantCloser?: string[];
  playWith?: string[];
  helpFrom?: string[];
  alone?: string;
  hard?: string[];
  hardReason?: string;
  happy?: string;
  schoolFun?: string;
  family?: string;
  toTeacher?: string;
}

type Col = { header: string; get: (r: CsvRow, i: number) => string };

function cell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Google-Forms-style response CSV. `omit` drops columns whose header starts with a Q title. */
export function buildCsv(
  rows: CsvRow[],
  cls: ClassRecord = fakeClass(),
  omit: string[] = [],
): string {
  const labels = cls.students.map(studentLabel);
  const all: Col[] = [
    { header: '타임스탬프', get: (r, i) => r.timestamp ?? `2026/11/18 10:0${i}:00` },
    { header: Q.name, get: (r) => r.name },
    ...labels.map((l) => ({
      header: `${Q.ratings} [${l}]`,
      get: (r: CsvRow) => r.ratings?.[l] ?? '',
    })),
    { header: Q.best, get: (r) => (r.best ?? []).join(', ') },
    { header: Q.wantCloser, get: (r) => (r.wantCloser ?? []).join(', ') },
    { header: Q.playWith, get: (r) => (r.playWith ?? []).join(', ') },
    { header: Q.helpFrom, get: (r) => (r.helpFrom ?? []).join(', ') },
    { header: Q.alone, get: (r) => r.alone ?? '' },
    { header: Q.hard, get: (r) => (r.hard ?? []).join(', ') },
    { header: Q.hardReason, get: (r) => r.hardReason ?? '' },
    { header: Q.happy, get: (r) => r.happy ?? '' },
    { header: Q.schoolFun, get: (r) => r.schoolFun ?? '' },
    { header: Q.family, get: (r) => r.family ?? '' },
    { header: Q.toTeacher, get: (r) => r.toTeacher ?? '' },
  ];
  const cols = all.filter((c) => !omit.some((o) => c.header === o || c.header.startsWith(`${o} [`)));
  const lines = [cols.map((c) => cell(c.header)).join(',')];
  rows.forEach((r, i) => lines.push(cols.map((c) => cell(c.get(r, i))).join(',')));
  return lines.join('\r\n');
}

// ---- Analysis fixture (hand-checkable) ------------------------------------
// Roster s1..s6 (가온 나래 다온 라희 마루 바다); s6 did not respond; "sx" is a
// deleted student who responded (rated s1 = 1, nominated s1 as hard).
function resp(
  studentId: string,
  p: Partial<SurveyResponse> & { ratings: Record<string, Score> },
): SurveyResponse {
  return {
    studentId,
    submittedAt: '2026-11-18T10:00:00.000Z',
    best: [],
    wantCloser: [],
    playWith: [],
    helpFrom: [],
    hard: [],
    hardReason: '',
    toTeacher: '',
    alone: null,
    happy: null,
    schoolFun: null,
    family: null,
    ...p,
  };
}

export function analysisFixture(): { cls: ClassRecord; result: SurveyResult } {
  const cls = fakeClass(6);
  const result: SurveyResult = {
    id: 'r1',
    classId: cls.id,
    name: '테스트 설문',
    importedAt: '2026-11-18T10:00:00.000Z',
    labels: {},
    dismissed: [],
    parentInclude: {},
    responses: {
      s1: resp('s1', { ratings: { s2: 5, s3: 4, s4: 2, s5: 3, s6: 1 }, hard: ['s4'], alone: 2, happy: 4, schoolFun: 4 }),
      s2: resp('s2', { ratings: { s1: 5, s3: 2, s4: 3, s5: 2, s6: 2 }, hard: ['s4'], alone: 4, happy: 2, schoolFun: 3 }),
      s3: resp('s3', { ratings: { s1: 2, s2: 2, s4: 3, s5: 4, s6: 3 }, alone: 3, happy: 3, schoolFun: 2 }),
      s4: resp('s4', { ratings: { s1: 2, s2: 3, s3: 3, s5: 3, s6: 3 }, hard: ['s1'], alone: 5, happy: 3, schoolFun: 3 }),
      s5: resp('s5', { ratings: { s1: 3, s2: 2, s3: 4, s4: 3, s6: 3 }, alone: 1, happy: 4, schoolFun: 4 }),
      sx: resp('sx', { ratings: { s1: 1 }, hard: ['s1'] }),
    },
  };
  return { cls, result };
}
