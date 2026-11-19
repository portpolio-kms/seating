import type { Assignment, Layout, PairConstraint, Student } from '@/lib/seating/types';
import { getDb, SETTINGS_KEY } from './db';

export const SCHEMA_VERSION = 2;

export type RevealStyle = 'A' | 'B' | 'C';

export interface ClassRecord {
  id: string;
  name: string;
  students: Student[];
  layout: Layout;
  constraints: PairConstraint[];
  genderRule: boolean;
  lastRevealStyle: RevealStyle;
  createdAt: string;
}

/** studentNames is a snapshot of names at confirmation time. */
export interface SeatingRecord {
  id: string;
  classId: string;
  createdAt: string;
  layout: Layout;
  assignment: Assignment;
  studentNames: Record<string, string>;
}

export interface AppSettings {
  pinHash: string | null;
  pinSalt: string | null;
  activeClassId: string | null;
  idleMinutes: number;
}

const DEFAULT_SETTINGS: AppSettings = { pinHash: null, pinSalt: null, activeClassId: null, idleMinutes: 5 };

export async function listClasses(): Promise<ClassRecord[]> {
  return (await getDb()).getAll('classes');
}

export async function getClass(id: string): Promise<ClassRecord | undefined> {
  return (await getDb()).get('classes', id);
}

export async function saveClass(c: ClassRecord): Promise<void> {
  await (await getDb()).put('classes', c);
}

export async function deleteClass(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['classes', 'records', 'surveys'], 'readwrite');
  await tx.objectStore('classes').delete(id);
  const keys = await tx.objectStore('records').index('classId').getAllKeys(id);
  await Promise.all(keys.map((k) => tx.objectStore('records').delete(k)));
  const surveyKeys = await tx.objectStore('surveys').index('classId').getAllKeys(id);
  await Promise.all(surveyKeys.map((k) => tx.objectStore('surveys').delete(k)));
  await tx.done;
}

export async function removeStudent(classId: string, studentId: string): Promise<ClassRecord> {
  const db = await getDb();
  const tx = db.transaction('classes', 'readwrite');
  const c = await tx.store.get(classId);
  if (!c) {
    tx.abort();
    throw new Error('학급을 찾을 수 없어요');
  }
  const updated: ClassRecord = {
    ...c,
    students: c.students.filter((s) => s.id !== studentId),
    constraints: c.constraints.filter((k) => k.a !== studentId && k.b !== studentId),
  };
  await tx.store.put(updated);
  await tx.done;
  return updated;
}

export async function addSeatingRecord(r: SeatingRecord): Promise<void> {
  await (await getDb()).put('records', r);
}

export async function listSeatingRecords(classId: string): Promise<SeatingRecord[]> {
  const all = await (await getDb()).getAllFromIndex('records', 'classId', classId);
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export async function deleteSeatingRecord(id: string): Promise<void> {
  await (await getDb()).delete('records', id);
}

export async function getSettings(): Promise<AppSettings> {
  const s = await (await getDb()).get('settings', SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(s: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await (await getDb()).put('settings', { ...current, ...s }, SETTINGS_KEY);
}

export async function wipeAll(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['classes', 'records', 'settings', 'surveys'], 'readwrite');
  await Promise.all([
    tx.objectStore('classes').clear(),
    tx.objectStore('records').clear(),
    tx.objectStore('settings').clear(),
    tx.objectStore('surveys').clear(),
  ]);
  await tx.done;
}
