import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, ClassRecord, SeatingRecord } from './repo';

export const DB_NAME = 'seating-app';
export const DB_VERSION = 1;
export const SETTINGS_KEY = 'app';

interface SeatingDB extends DBSchema {
  classes: { key: string; value: ClassRecord };
  records: { key: string; value: SeatingRecord; indexes: { classId: string } };
  settings: { key: string; value: AppSettings };
}

export type SeatingDatabase = IDBPDatabase<SeatingDB>;

let dbPromise: Promise<SeatingDatabase> | null = null;

export function getDb(): Promise<SeatingDatabase> {
  if (!dbPromise) {
    dbPromise = openDB<SeatingDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('classes', { keyPath: 'id' });
        const records = db.createObjectStore('records', { keyPath: 'id' });
        records.createIndex('classId', 'classId');
        db.createObjectStore('settings');
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}
