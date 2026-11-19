import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetDbForTests, DB_NAME, isDbBlocked, onDbBlockedChange } from '@/lib/db/db';
import { deleteClass, getClass, listClasses, saveClass, wipeAll } from '@/lib/db/repo';
import { deleteSurvey, listSurveys, saveSurvey } from '@/lib/db/surveys';
import { exportBackup, importBackup, parseBackup } from '@/lib/db/backup';
import { analysisFixture } from '../survey/fixture';
import { makeClass } from './fixtures';

function survey(id: string, classId: string, importedAt: string) {
  return { ...analysisFixture().result, id, classId, importedAt };
}

describe('surveys repo', () => {
  beforeEach(async () => {
    await wipeAll();
  });

  it('listSurveys returns newest first and only for that class', async () => {
    await saveSurvey(survey('a', 'c1', '2026-11-01T00:00:00.000Z'));
    await saveSurvey(survey('b', 'c1', '2026-11-03T00:00:00.000Z'));
    await saveSurvey(survey('c', 'c1', '2026-11-02T00:00:00.000Z'));
    await saveSurvey(survey('d', 'c2', '2026-11-04T00:00:00.000Z'));
    expect((await listSurveys('c1')).map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('deleteSurvey removes one survey', async () => {
    await saveSurvey(survey('a', 'c1', '2026-11-01T00:00:00.000Z'));
    await deleteSurvey('a');
    expect(await listSurveys('c1')).toEqual([]);
  });

  it('deleteClass removes its surveys but not other classes', async () => {
    await saveClass(makeClass('c1'));
    await saveClass(makeClass('c2'));
    await saveSurvey(survey('a', 'c1', '2026-11-01T00:00:00.000Z'));
    await saveSurvey(survey('b', 'c2', '2026-11-01T00:00:00.000Z'));
    await deleteClass('c1');
    expect(await listSurveys('c1')).toEqual([]);
    expect(await listSurveys('c2')).toHaveLength(1);
  });

  it('wipeAll clears surveys', async () => {
    await saveSurvey(survey('a', 'c1', '2026-11-01T00:00:00.000Z'));
    await wipeAll();
    expect(await listSurveys('c1')).toEqual([]);
  });
});

describe('surveys in backups', () => {
  beforeEach(async () => {
    await wipeAll();
  });

  const v2 = (surveys: unknown[]) => ({
    format: 'seating-app-backup',
    version: 2,
    exportedAt: '2026-01-01T00:00:00.000Z',
    classes: [makeClass()],
    records: [],
    surveys,
  });

  it('exports version 2 with only the selected classes surveys', async () => {
    await saveClass(makeClass('c1'));
    await saveClass(makeClass('c2'));
    await saveSurvey(survey('a', 'c1', '2026-11-01T00:00:00.000Z'));
    await saveSurvey(survey('b', 'c2', '2026-11-01T00:00:00.000Z'));
    const b = await exportBackup(['c2']);
    expect(b.version).toBe(2);
    expect(b.surveys?.map((s) => s.id)).toEqual(['b']);
  });

  it('version 1 backup (no surveys) parses and imports with zero surveys', async () => {
    const v1 = { ...v2([]), version: 1, surveys: undefined };
    const r = parseBackup(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await importBackup(r.data, 'overwrite');
    expect(await listClasses()).toHaveLength(1);
    expect(await listSurveys('c1')).toEqual([]);
  });

  it('version 2 requires a surveys array', () => {
    const { surveys: _s, ...noSurveys } = v2([]);
    expect(parseBackup(JSON.stringify(noSurveys))).toEqual({ ok: false, error: '백업 파일을 읽을 수 없어요' });
  });

  it('version 2 round trips', () => {
    expect(parseBackup(JSON.stringify(v2([survey('a', 'c1', '2026-11-01T00:00:00.000Z')]))).ok).toBe(true);
  });

  it('rejects malformed surveys', () => {
    const good = survey('a', 'c1', '2026-11-01T00:00:00.000Z');
    const resp = good.responses.s1;
    const bad: unknown[] = [
      { ...good, id: 1 },
      { ...good, name: null },
      { ...good, importedAt: 5 },
      { ...good, labels: { s1: 1 } },
      { ...good, dismissed: [1] },
      { ...good, parentInclude: { s1: { ownHardReason: true, toTeacher: true } } },
      { ...good, parentInclude: { s1: { ownHardReason: true, toTeacher: true, hardCount: 'y' } } },
      { ...good, responses: { s1: { ...resp, ratings: { s2: 7 } } } },
      { ...good, responses: { s1: { ...resp, ratings: { s2: 2.5 } } } },
      { ...good, responses: { s1: { ...resp, best: [1] } } },
      { ...good, responses: { s1: { ...resp, hardReason: 3 } } },
      { ...good, responses: { s1: { ...resp, alone: 6 } } },
      { ...good, responses: { s1: { ...resp, happy: '3' } } },
      { ...good, responses: { s1: { ...resp, studentId: 1 } } },
      { ...good, responses: [] },
    ];
    for (const s of bad) {
      expect(parseBackup(JSON.stringify(v2([s])))).toEqual({ ok: false, error: '백업 파일을 읽을 수 없어요' });
    }
  });

  it('add-new remaps survey classId and issues new survey ids', async () => {
    await saveClass(makeClass('c1'));
    await saveSurvey(survey('a', 'c1', '2026-11-01T00:00:00.000Z'));
    await importBackup(await exportBackup(), 'add-new');
    const newClass = (await listClasses()).find((c) => c.id !== 'c1')!;
    const imported = await listSurveys(newClass.id);
    expect(imported).toHaveLength(1);
    expect(imported[0].id).not.toBe('a');
    expect(await listSurveys('c1')).toHaveLength(1);
  });

  it('overwrite replaces the class surveys and skips surveys of classes not in the file', async () => {
    await saveClass(makeClass('c1'));
    await saveSurvey(survey('old', 'c1', '2026-11-01T00:00:00.000Z'));
    const b = await exportBackup();
    b.surveys = [
      survey('new', 'c1', '2026-11-05T00:00:00.000Z'),
      survey('orphan', 'nowhere', '2026-11-05T00:00:00.000Z'),
    ];
    await importBackup(b, 'overwrite');
    expect((await listSurveys('c1')).map((s) => s.id)).toEqual(['new']);
    expect(await listSurveys('nowhere')).toEqual([]);
  });

  it('overwrite from a version 1 backup keeps the class surveys', async () => {
    await saveClass(makeClass('c1'));
    await saveClass(makeClass('c2'));
    await saveSurvey(survey('mine', 'c1', '2026-11-01T00:00:00.000Z'));
    await saveSurvey(survey('other', 'c2', '2026-11-01T00:00:00.000Z'));
    const r = parseBackup(JSON.stringify({ ...v2([]), version: 1, surveys: undefined }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await importBackup(r.data, 'overwrite');
    expect((await listSurveys('c1')).map((s) => s.id)).toEqual(['mine']);
    expect((await listSurveys('c2')).map((s) => s.id)).toEqual(['other']);
  });

  it('overwrite from a version 2 backup replaces only that class surveys', async () => {
    await saveClass(makeClass('c1'));
    await saveClass(makeClass('c2'));
    await saveSurvey(survey('mine', 'c1', '2026-11-01T00:00:00.000Z'));
    await saveSurvey(survey('other', 'c2', '2026-11-01T00:00:00.000Z'));
    const r = parseBackup(JSON.stringify(v2([survey('fresh', 'c1', '2026-11-05T00:00:00.000Z')])));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await importBackup(r.data, 'overwrite');
    expect((await listSurveys('c1')).map((s) => s.id)).toEqual(['fresh']);
    expect((await listSurveys('c2')).map((s) => s.id)).toEqual(['other']);
  });
});

describe('db upgrade from version 1', () => {
  it('keeps existing data and adds the surveys store', async () => {
    await __resetDbForTests();
    await indexedDB.deleteDatabase(DB_NAME);
    const old = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('classes', { keyPath: 'id' });
        db.createObjectStore('records', { keyPath: 'id' }).createIndex('classId', 'classId');
        db.createObjectStore('settings');
      },
    });
    await old.put('classes', makeClass('legacy'));
    old.close();

    expect((await getClass('legacy'))?.name).toBe('6학년 1반');
    await saveSurvey(survey('a', 'legacy', '2026-11-01T00:00:00.000Z'));
    expect(await listSurveys('legacy')).toHaveLength(1);
    await __resetDbForTests();
  });
});

describe('db upgrade blocked by an old window', () => {
  it('reports blocked, then completes once the old connection closes', async () => {
    await __resetDbForTests();
    await indexedDB.deleteDatabase(DB_NAME);
    const old = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('classes', { keyPath: 'id' });
        db.createObjectStore('records', { keyPath: 'id' }).createIndex('classId', 'classId');
        db.createObjectStore('settings');
      },
    });
    await old.put('classes', makeClass('legacy'));

    const changes: boolean[] = [];
    const off = onDbBlockedChange((b) => changes.push(b));
    expect(isDbBlocked()).toBe(false);
    const pending = getClass('legacy');
    await vi.waitFor(() => expect(changes).toEqual([true]));
    expect(isDbBlocked()).toBe(true);
    old.close();
    expect((await pending)?.id).toBe('legacy');
    expect(changes).toEqual([true, false]);
    expect(isDbBlocked()).toBe(false);
    off();
    await __resetDbForTests();
  });
});
