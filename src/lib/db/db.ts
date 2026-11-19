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

let dbBlocked = false;
const blockedListeners = new Set<(blocked: boolean) => void>();

function setDbBlocked(blocked: boolean) {
  if (dbBlocked === blocked) return;
  dbBlocked = blocked;
  blockedListeners.forEach((cb) => cb(blocked));
}

/** True while a database upgrade waits on another open window or tab of an older version. */
export function isDbBlocked(): boolean {
  return dbBlocked;
}

/**
 * Calls cb(true) when a database upgrade gets blocked by another window or tab of an older
 * version, and cb(false) once the open finishes. Read isDbBlocked() first: the block may
 * have started before the subscription.
 */
export function onDbBlockedChange(cb: (blocked: boolean) => void): () => void {
  blockedListeners.add(cb);
  return () => {
    blockedListeners.delete(cb);
  };
}

export function getDb(): Promise<SeatingDatabase> {
  if (!dbPromise) {
    const opening = openDB<SeatingDB>(DB_NAME, DB_VERSION, {
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
        setDbBlocked(true);
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
    const clear = () => setDbBlocked(false);
    opening.then(clear, clear);
    dbPromise = opening;
  }
  return dbPromise;
}

/** Test-only: closes the cached connection so the next getDb() reopens (and re-runs upgrades). */
export async function __resetDbForTests(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p).close();
}
