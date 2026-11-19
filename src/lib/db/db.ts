import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SurveyResult } from '@/lib/survey/types';
import type { AppSettings, ClassRecord, SeatingRecord } from './repo';

export const DB_NAME = 'seating-app';
export const DB_VERSION = 2;
export const SETTINGS_KEY = 'app';

interface SeatingDB extends DBSchema {
  classes: { key: string; value: ClassRecord };
  records: { key: string; value: SeatingRecord; indexes: { classId: string } };
  settings: { key: string; value: AppSettings };
  surveys: { key: string; value: SurveyResult; indexes: { classId: string } };
}

export type SeatingDatabase = IDBPDatabase<SeatingDB>;

let dbPromise: Promise<SeatingDatabase> | null = null;

const blockedListeners = new Set<() => void>();

/** Calls cb when a database upgrade is blocked by another open window or tab of an older version. */
export function onDbBlocked(cb: () => void): () => void {
  blockedListeners.add(cb);
  return () => {
    blockedListeners.delete(cb);
  };
}

export function getDb(): Promise<SeatingDatabase> {
  if (!dbPromise) {
    dbPromise = openDB<SeatingDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Never recreate stores that exist: version-1 databases keep their data.
        if (oldVersion < 1) {
          db.createObjectStore('classes', { keyPath: 'id' });
          const records = db.createObjectStore('records', { keyPath: 'id' });
          records.createIndex('classId', 'classId');
          db.createObjectStore('settings');
        }
        if (oldVersion < 2) {
          const surveys = db.createObjectStore('surveys', { keyPath: 'id' });
          surveys.createIndex('classId', 'classId');
        }
      },
      blocked() {
        blockedListeners.forEach((cb) => cb());
      },
      blocking() {
        // A newer version wants to upgrade: step aside so it never waits on us.
        const p = dbPromise;
        dbPromise = null;
        void p?.then((db) => db.close());
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Test-only: closes the cached connection so the next getDb() reopens (and re-runs upgrades). */
export async function __resetDbForTests(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p).close();
}
