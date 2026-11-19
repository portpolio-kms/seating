import { deleteDB, openDB, type IDBPDatabase } from 'idb';
import { __resetDbForTests, DB_NAME } from '@/lib/db/db';

/**
 * Simulates an old (version 1) window still open: a raw v1 connection with no versionchange
 * handler, so the app's v2 upgrade stays blocked until the returned connection is closed.
 */
export async function openOldVersionConnection(): Promise<IDBPDatabase> {
  await __resetDbForTests();
  await deleteDB(DB_NAME);
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('classes', { keyPath: 'id' });
      db.createObjectStore('records', { keyPath: 'id' }).createIndex('classId', 'classId');
      db.createObjectStore('settings');
    },
  });
}
