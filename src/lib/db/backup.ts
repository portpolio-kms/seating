import type { SurveyResult } from '@/lib/survey/types';
import { getDb } from './db';
import { listClasses, SCHEMA_VERSION, type ClassRecord, type SeatingRecord } from './repo';

export interface BackupFile {
  format: 'seating-app-backup';
  version: number;
  exportedAt: string;
  classes: ClassRecord[];
  records: SeatingRecord[];
  /** Required in version 2, absent in version 1. */
  surveys?: SurveyResult[];
}

const UNREADABLE = '백업 파일을 읽을 수 없어요';
const TOO_NEW = '더 새로운 버전의 앱에서 만든 백업이에요';

/** PIN settings are never included. */
export async function exportBackup(classIds?: string[]): Promise<BackupFile> {
  const all = await listClasses();
  const classes = classIds ? all.filter((c) => classIds.includes(c.id)) : all;
  const ids = new Set(classes.map((c) => c.id));
  const records = (await (await getDb()).getAll('records')).filter((r) => ids.has(r.classId));
  const surveys = (await (await getDb()).getAll('surveys')).filter((s) => ids.has(s.classId));
  return {
    format: 'seating-app-backup',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    classes,
    records,
    surveys,
  };
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isDim = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 10;
const KINDS = new Set(['avoid-pair', 'avoid-group', 'must-pair', 'must-group']);

function isLayout(v: unknown): boolean {
  return (
    isObj(v) &&
    (v.mode === 'pair' || v.mode === 'group') &&
    isDim(v.rows) &&
    isDim(v.cols) &&
    (v.groupSize === 4 || v.groupSize === 6) &&
    Array.isArray(v.disabledSeats) &&
    v.disabledSeats.every(isStr)
  );
}

function isStudent(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    typeof v.number === 'number' &&
    Number.isFinite(v.number) &&
    isStr(v.name) &&
    (v.gender === 'M' || v.gender === 'F' || v.gender === null)
  );
}

function isConstraint(v: unknown): boolean {
  return isObj(v) && isStr(v.id) && isStr(v.a) && isStr(v.b) && isStr(v.kind) && KINDS.has(v.kind);
}

function isClass(v: unknown): v is ClassRecord {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    Array.isArray(v.students) &&
    v.students.every(isStudent) &&
    isLayout(v.layout) &&
    Array.isArray(v.constraints) &&
    v.constraints.every(isConstraint) &&
    typeof v.genderRule === 'boolean' &&
    (v.lastRevealStyle === 'A' || v.lastRevealStyle === 'B' || v.lastRevealStyle === 'C') &&
    isStr(v.createdAt)
  );
}

function isRecord(v: unknown): v is SeatingRecord {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.classId) &&
    isStr(v.createdAt) &&
    isLayout(v.layout) &&
    isObj(v.assignment) &&
    Object.values(v.assignment).every((x) => x === null || isStr(x)) &&
    isObj(v.studentNames) &&
    Object.values(v.studentNames).every(isStr)
  );
}

const isScore = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;
const isScoreOrNull = (v: unknown) => v === null || isScore(v);
const isStrArray = (v: unknown) => Array.isArray(v) && v.every(isStr);

function isResponse(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.studentId) &&
    isStr(v.submittedAt) &&
    isObj(v.ratings) &&
    Object.values(v.ratings).every(isScore) &&
    isStrArray(v.best) &&
    isStrArray(v.wantCloser) &&
    isStrArray(v.playWith) &&
    isStrArray(v.helpFrom) &&
    isStrArray(v.hard) &&
    isStr(v.hardReason) &&
    isStr(v.toTeacher) &&
    isScoreOrNull(v.alone) &&
    isScoreOrNull(v.happy) &&
    isScoreOrNull(v.schoolFun) &&
    isScoreOrNull(v.family)
  );
}

function isParentInclude(v: unknown): boolean {
  return (
    isObj(v) &&
    typeof v.ownHardReason === 'boolean' &&
    typeof v.toTeacher === 'boolean' &&
    typeof v.hardCount === 'boolean'
  );
}

function isSurvey(v: unknown): v is SurveyResult {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.classId) &&
    isStr(v.name) &&
    isStr(v.importedAt) &&
    isObj(v.labels) &&
    Object.values(v.labels).every(isStr) &&
    isObj(v.responses) &&
    Object.values(v.responses).every(isResponse) &&
    isStrArray(v.dismissed) &&
    isObj(v.parentInclude) &&
    Object.values(v.parentInclude).every(isParentInclude)
  );
}

/**
 * Checks the whole file before anything is written: a malformed class (no students array, a bad
 * layout...) would otherwise be stored and break every screen that reads it.
 */
export function parseBackup(json: string): { ok: true; data: BackupFile } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: UNREADABLE };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: UNREADABLE };
  const o = raw as Record<string, unknown>;
  if (o.format !== 'seating-app-backup' || !Number.isInteger(o.version) || (o.version as number) < 1) {
    return { ok: false, error: UNREADABLE };
  }
  if ((o.version as number) > SCHEMA_VERSION) return { ok: false, error: TOO_NEW };
  if (!Array.isArray(o.classes) || !Array.isArray(o.records)) return { ok: false, error: UNREADABLE };
  if (!o.classes.every(isClass) || !o.records.every(isRecord)) return { ok: false, error: UNREADABLE };
  // Version 1 predates surveys; version 2 must carry a valid surveys array.
  if ((o.version as number) >= 2 && (!Array.isArray(o.surveys) || !o.surveys.every(isSurvey))) {
    return { ok: false, error: UNREADABLE };
  }
  if ((o.version as number) < 2) {
    // Version 1 never had surveys: drop any stray key so unvalidated data cannot be imported.
    const { surveys: _ignored, ...rest } = o;
    return { ok: true, data: rest as unknown as BackupFile };
  }
  return { ok: true, data: raw as BackupFile };
}

export async function importBackup(data: BackupFile, mode: 'overwrite' | 'add-new'): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['classes', 'records', 'surveys'], 'readwrite');
  const classes = tx.objectStore('classes');
  const records = tx.objectStore('records');
  const surveys = tx.objectStore('surveys');
  const importedSurveys = data.surveys ?? [];

  if (mode === 'overwrite') {
    // Replace imported classes and their records; other classes are left alone.
    const imported = new Set(data.classes.map((c) => c.id));
    for (const c of data.classes) {
      const oldKeys = await records.index('classId').getAllKeys(c.id);
      await Promise.all(oldKeys.map((k) => records.delete(k)));
      // A version-1 file has no surveys at all: keep the class's existing surveys then.
      if (data.surveys !== undefined) {
        const oldSurveyKeys = await surveys.index('classId').getAllKeys(c.id);
        await Promise.all(oldSurveyKeys.map((k) => surveys.delete(k)));
      }
      await classes.put(c);
    }
    // Records whose class is not in the file would be invisible orphans: skip them.
    await Promise.all(data.records.filter((r) => imported.has(r.classId)).map((r) => records.put(r)));
    await Promise.all(importedSurveys.filter((s) => imported.has(s.classId)).map((s) => surveys.put(s)));
  } else {
    const idMap = new Map<string, string>();
    for (const c of data.classes) {
      const newId = crypto.randomUUID();
      idMap.set(c.id, newId);
      await classes.put({ ...c, id: newId });
    }
    for (const r of data.records) {
      const classId = idMap.get(r.classId);
      if (classId) await records.put({ ...r, id: crypto.randomUUID(), classId });
    }
    for (const s of importedSurveys) {
      const classId = idMap.get(s.classId);
      if (classId) await surveys.put({ ...s, id: crypto.randomUUID(), classId });
    }
  }
  await tx.done;
}
