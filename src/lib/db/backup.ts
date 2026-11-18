import { getDb } from './db';
import { listClasses, SCHEMA_VERSION, type ClassRecord, type SeatingRecord } from './repo';

export interface BackupFile {
  format: 'seating-app-backup';
  version: number;
  exportedAt: string;
  classes: ClassRecord[];
  records: SeatingRecord[];
}

const UNREADABLE = '백업 파일을 읽을 수 없어요';
const TOO_NEW = '더 새로운 버전의 앱에서 만든 백업이에요';

/** PIN settings are never included. */
export async function exportBackup(classIds?: string[]): Promise<BackupFile> {
  const all = await listClasses();
  const classes = classIds ? all.filter((c) => classIds.includes(c.id)) : all;
  const ids = new Set(classes.map((c) => c.id));
  const records = (await (await getDb()).getAll('records')).filter((r) => ids.has(r.classId));
  return {
    format: 'seating-app-backup',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    classes,
    records,
  };
}

export function parseBackup(json: string): { ok: true; data: BackupFile } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: UNREADABLE };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: UNREADABLE };
  const o = raw as Record<string, unknown>;
  if (o.format !== 'seating-app-backup' || typeof o.version !== 'number') return { ok: false, error: UNREADABLE };
  if (o.version > SCHEMA_VERSION) return { ok: false, error: TOO_NEW };
  if (!Array.isArray(o.classes) || !Array.isArray(o.records)) return { ok: false, error: UNREADABLE };
  return { ok: true, data: raw as BackupFile };
}

export async function importBackup(data: BackupFile, mode: 'overwrite' | 'add-new'): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['classes', 'records'], 'readwrite');
  const classes = tx.objectStore('classes');
  const records = tx.objectStore('records');

  if (mode === 'overwrite') {
    // Replace imported classes and their records; other classes are left alone.
    for (const c of data.classes) {
      const oldKeys = await records.index('classId').getAllKeys(c.id);
      await Promise.all(oldKeys.map((k) => records.delete(k)));
      await classes.put(c);
    }
    await Promise.all(data.records.map((r) => records.put(r)));
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
  }
  await tx.done;
}
