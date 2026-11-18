import { beforeEach, describe, expect, it } from 'vitest';
import {
  addSeatingRecord, deleteClass, deleteSeatingRecord, getClass, getSettings, listClasses,
  listSeatingRecords, removeStudent, saveClass, saveSettings, wipeAll,
} from '@/lib/db/repo';
import { makeClass, makeRecord } from './fixtures';

describe('repo', () => {
  beforeEach(async () => {
    await wipeAll();
  });

  it('saveClass then getClass returns the same object', async () => {
    const c = makeClass();
    await saveClass(c);
    expect(await getClass('c1')).toEqual(c);
    expect(await listClasses()).toHaveLength(1);
  });

  it('deleteClass also deletes its records', async () => {
    await saveClass(makeClass('c1'));
    await saveClass(makeClass('c2'));
    await addSeatingRecord(makeRecord('r1', 'c1', '2026-01-02'));
    await addSeatingRecord(makeRecord('r2', 'c2', '2026-01-02'));
    await deleteClass('c1');
    expect(await getClass('c1')).toBeUndefined();
    expect(await listSeatingRecords('c1')).toEqual([]);
    expect(await listSeatingRecords('c2')).toHaveLength(1);
  });

  it('removeStudent drops related constraints but keeps record name snapshots', async () => {
    await saveClass(makeClass());
    await addSeatingRecord(makeRecord('r1', 'c1', '2026-01-02'));
    const updated = await removeStudent('c1', 's2');
    expect(updated.students.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(updated.constraints).toEqual([]);
    expect((await getClass('c1'))!.constraints).toEqual([]);
    const [rec] = await listSeatingRecords('c1');
    expect(rec.studentNames.s2).toBe('나래');
  });

  it('removeStudent keeps unrelated constraints', async () => {
    await saveClass(makeClass());
    const updated = await removeStudent('c1', 's1');
    expect(updated.constraints.map((k) => k.id)).toEqual(['k2']);
  });

  it('listSeatingRecords is newest first', async () => {
    await saveClass(makeClass());
    await addSeatingRecord(makeRecord('r1', 'c1', '2026-01-01T00:00:00.000Z'));
    await addSeatingRecord(makeRecord('r3', 'c1', '2026-03-01T00:00:00.000Z'));
    await addSeatingRecord(makeRecord('r2', 'c1', '2026-02-01T00:00:00.000Z'));
    expect((await listSeatingRecords('c1')).map((r) => r.id)).toEqual(['r3', 'r2', 'r1']);
  });

  it('deleteSeatingRecord removes one record', async () => {
    await addSeatingRecord(makeRecord('r1', 'c1', '2026-01-01'));
    await deleteSeatingRecord('r1');
    expect(await listSeatingRecords('c1')).toEqual([]);
  });

  it('settings default and partial save', async () => {
    expect(await getSettings()).toEqual({ pinHash: null, pinSalt: null, activeClassId: null, idleMinutes: 5 });
    await saveSettings({ activeClassId: 'c1' });
    await saveSettings({ idleMinutes: 10 });
    expect(await getSettings()).toEqual({ pinHash: null, pinSalt: null, activeClassId: 'c1', idleMinutes: 10 });
  });

  it('wipeAll clears everything including settings', async () => {
    await saveClass(makeClass());
    await addSeatingRecord(makeRecord('r1', 'c1', '2026-01-01'));
    await saveSettings({ pinHash: 'x' });
    await wipeAll();
    expect(await listClasses()).toEqual([]);
    expect(await listSeatingRecords('c1')).toEqual([]);
    expect((await getSettings()).pinHash).toBeNull();
  });
});
