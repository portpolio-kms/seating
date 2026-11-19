import { beforeEach, describe, expect, it } from 'vitest';
import { addSeatingRecord, listClasses, listSeatingRecords, saveClass, saveSettings, wipeAll } from '@/lib/db/repo';
import { exportBackup, importBackup, parseBackup } from '@/lib/db/backup';
import { makeClass, makeRecord } from './fixtures';

describe('backup', () => {
  beforeEach(async () => {
    await wipeAll();
  });

  it('export excludes PIN settings', async () => {
    await saveClass(makeClass());
    await saveSettings({ pinHash: 'secrethash', pinSalt: 'secretsalt' });
    const b = await exportBackup();
    const s = JSON.stringify(b);
    expect(s).not.toContain('pinHash');
    expect(s).not.toContain('secrethash');
    expect(b.format).toBe('seating-app-backup');
    expect(b.version).toBe(2);
  });

  it('export can be limited to classIds', async () => {
    await saveClass(makeClass('c1'));
    await saveClass(makeClass('c2'));
    await addSeatingRecord(makeRecord('r1', 'c1', '2026-01-01'));
    await addSeatingRecord(makeRecord('r2', 'c2', '2026-01-01'));
    const b = await exportBackup(['c2']);
    expect(b.classes.map((c) => c.id)).toEqual(['c2']);
    expect(b.records.map((r) => r.id)).toEqual(['r2']);
  });

  it('parseBackup rejects bad input', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: '백업 파일을 읽을 수 없어요' });
    expect(parseBackup('{"format":"other","version":1}')).toEqual({ ok: false, error: '백업 파일을 읽을 수 없어요' });
    expect(parseBackup('{"format":"seating-app-backup","version":3,"classes":[],"records":[]}')).toEqual({
      ok: false,
      error: '더 새로운 버전의 앱에서 만든 백업이에요',
    });
  });

  it('parseBackup accepts an exported file', async () => {
    await saveClass(makeClass());
    const b = await exportBackup();
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.classes).toHaveLength(1);
  });

  it('import add-new doubles classes with fresh ids and remaps records', async () => {
    await saveClass(makeClass());
    await addSeatingRecord(makeRecord('r1', 'c1', '2026-01-01'));
    const b = await exportBackup();
    await importBackup(b, 'add-new');
    const classes = await listClasses();
    expect(classes).toHaveLength(2);
    expect(new Set(classes.map((c) => c.id)).size).toBe(2);
    const newClass = classes.find((c) => c.id !== 'c1')!;
    const recs = await listSeatingRecords(newClass.id);
    expect(recs).toHaveLength(1);
    expect(recs[0].id).not.toBe('r1');
    expect(await listSeatingRecords('c1')).toHaveLength(1);
  });

  it('import overwrite replaces content and keeps class count', async () => {
    await saveClass(makeClass());
    await addSeatingRecord(makeRecord('r1', 'c1', '2026-01-01'));
    const b = await exportBackup();
    b.classes[0].name = '바뀐 이름';
    b.records = [];
    await importBackup(b, 'overwrite');
    const classes = await listClasses();
    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('바뀐 이름');
    expect(await listSeatingRecords('c1')).toEqual([]);
  });

  describe('parseBackup validation', () => {
    const file = (over: Record<string, unknown> = {}) => ({
      format: 'seating-app-backup',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      classes: [makeClass()],
      records: [makeRecord('r1', 'c1', '2026-01-01')],
      ...over,
    });
    const UNREADABLE = { ok: false, error: '백업 파일을 읽을 수 없어요' };
    const parse = (o: unknown) => parseBackup(JSON.stringify(o));

    it('accepts a well-formed file', () => {
      expect(parse(file()).ok).toBe(true);
    });

    it('rejects a class without students', () => {
      const { students: _s, ...noStudents } = makeClass();
      expect(parse(file({ classes: [noStudents] }))).toEqual(UNREADABLE);
    });

    it('rejects bad versions', () => {
      for (const version of [0, -1, 1.5, '1', null]) expect(parse(file({ version }))).toEqual(UNREADABLE);
    });

    it('rejects malformed class fields', () => {
      const bad: Record<string, unknown>[] = [
        { id: 1 },
        { name: null },
        { students: [{ id: 's1', number: Infinity, name: '가온', gender: null }] },
        { students: [{ id: 's1', number: 1, name: '가온', gender: 'X' }] },
        { layout: { ...makeClass().layout, rows: 0 } },
        { layout: { ...makeClass().layout, cols: 11 } },
        { layout: { ...makeClass().layout, rows: 2.5 } },
        { layout: { ...makeClass().layout, groupSize: 5 } },
        { layout: { ...makeClass().layout, mode: 'row' } },
        { layout: { ...makeClass().layout, disabledSeats: [1] } },
        { constraints: [{ id: 'k', a: 's1', b: 's2', kind: 'friends' }] },
        { genderRule: 'yes' },
        { lastRevealStyle: 'D' },
        { createdAt: 5 },
      ];
      for (const over of bad) expect(parse(file({ classes: [{ ...makeClass(), ...over }] }))).toEqual(UNREADABLE);
    });

    it('rejects malformed records', () => {
      const bad: Record<string, unknown>[] = [
        { id: undefined },
        { classId: 3 },
        { createdAt: null },
        { layout: { mode: 'pair' } },
        { assignment: { 'u0-0-s0': 5 } },
        { assignment: [] },
        { studentNames: { s1: null } },
      ];
      for (const over of bad) {
        expect(parse(file({ records: [{ ...makeRecord('r1', 'c1', '2026-01-01'), ...over }] }))).toEqual(UNREADABLE);
      }
    });
  });

  it('import overwrite skips records whose class is not in the file', async () => {
    const b = await exportBackup();
    b.classes = [makeClass('c1')];
    b.records = [makeRecord('r1', 'c1', '2026-01-01'), makeRecord('orphan', 'nowhere', '2026-01-01')];
    await importBackup(b, 'overwrite');
    expect((await listSeatingRecords('c1')).map((r) => r.id)).toEqual(['r1']);
    expect(await listSeatingRecords('nowhere')).toEqual([]);
  });
});
