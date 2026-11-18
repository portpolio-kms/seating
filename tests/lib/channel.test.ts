import { describe, it, expect } from 'vitest';
import { CHANNEL_NAME, openTeacherChannel, openPresenterChannel, recordToStageView, toStageView } from '@/lib/channel';
import type { ToPresenter, ToTeacher } from '@/lib/channel';
import type { ClassRecord } from '@/lib/db/repo';

const wait = () => new Promise((r) => setTimeout(r, 50));

function cls(): ClassRecord {
  return {
    id: 'c1',
    name: '3반',
    students: [
      { id: 's1', number: 1, name: '가온', gender: 'F' },
      { id: 's2', number: 2, name: '나래', gender: 'M' },
      { id: 's3', number: 3, name: '나래', gender: 'M' },
    ],
    layout: { mode: 'pair', rows: 1, cols: 2, groupSize: 4, disabledSeats: [] },
    constraints: [{ id: 'k1', a: 's1', b: 's2', kind: 'avoid-pair' }],
    genderRule: true,
    lastRevealStyle: 'A',
    createdAt: '2026-01-01',
  };
}

describe('channel', () => {
  it('teacher reveal reaches presenter as equal object', async () => {
    const got: ToPresenter[] = [];
    const p = openPresenterChannel((m) => got.push(m));
    const t = openTeacherChannel(() => {});
    const msg: ToPresenter = {
      type: 'reveal', revealId: 'r1', style: 'B', speed: 2,
      stage: { className: '3반', mode: 'pair', rows: 1, cols: 1, units: [] },
    };
    t.send(msg);
    await wait();
    expect(got).toEqual([msg]);
    t.close(); p.close();
  });

  it('presenter hello reaches teacher', async () => {
    const got: ToTeacher[] = [];
    const t = openTeacherChannel((m) => got.push(m));
    const p = openPresenterChannel(() => {});
    p.send({ type: 'hello' });
    await wait();
    expect(got).toEqual([{ type: 'hello' }]);
    t.close(); p.close();
  });

  it('closed channel stops receiving', async () => {
    const got: ToPresenter[] = [];
    const p = openPresenterChannel((m) => got.push(m));
    const t = openTeacherChannel(() => {});
    p.close();
    t.send({ type: 'speed', revealId: 'r', speed: 1 });
    await wait();
    expect(got).toEqual([]);
    t.close();
  });

  it('toStageView carries names only, no constraint data', () => {
    const c = cls();
    const a = { 'u0-0-s0': 's1', 'u0-0-s1': 's2', 'u0-1-s0': 's3', 'u0-1-s1': null };
    const v = toStageView(c, a);
    const json = JSON.stringify(v);
    for (const w of ['constraints', 'avoid', 'must', 'genderRule', 'students', 'gender']) {
      expect(json).not.toContain(w);
    }
    expect(v.className).toBe('3반');
    expect(v.units).toHaveLength(2);
    const names = v.units.flatMap((u) => u.seats.map((s) => s.name));
    expect(names).toEqual(['가온', '나래(2)', '나래(3)', null]);
  });

  it('ignores messages without a known string type (other apps on the same origin)', async () => {
    const toPresenter: unknown[] = [];
    const toTeacher: unknown[] = [];
    const p = openPresenterChannel((m) => toPresenter.push(m));
    const t = openTeacherChannel((m) => toTeacher.push(m));
    const stranger = new BroadcastChannel(CHANNEL_NAME);
    for (const junk of [null, 'hello', 42, {}, { type: 7 }, { type: 'unknown' }, ['hello'], { kind: 'idle' }]) {
      stranger.postMessage(junk);
    }
    // Each side also drops the other side's types.
    stranger.postMessage({ type: 'hello' });
    stranger.postMessage({ type: 'idle', view: { kind: 'title', className: 'x', date: 'y' } });
    await wait();
    expect(toPresenter).toEqual([{ type: 'idle', view: { kind: 'title', className: 'x', date: 'y' } }]);
    expect(toTeacher).toEqual([{ type: 'hello' }]);
    stranger.close(); t.close(); p.close();
  });

  it('recordToStageView uses the saved names and layout of the record', () => {
    const v = recordToStageView('3반', {
      id: 'r1',
      classId: 'c1',
      createdAt: '2026-01-01',
      layout: { mode: 'pair', rows: 1, cols: 1, groupSize: 4, disabledSeats: [] },
      assignment: { 'u0-0-s0': 'old', 'u0-0-s1': null },
      studentNames: { old: '전학간학생' },
    });
    expect(v.className).toBe('3반');
    expect(v.units.flatMap((u) => u.seats.map((s) => s.name))).toEqual(['전학간학생', null]);
  });
});
