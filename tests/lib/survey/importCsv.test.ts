import { describe, expect, it } from 'vitest';
import { importSurveyCsv } from '@/lib/survey/importCsv';
import { Q } from '@/lib/survey/questions';
import { buildCsv, fakeClass } from './fixture';

const cls = fakeClass(4); // s1 1. 가온, s2 2. 나래, s3 3. 다온, s4 4. 라희

describe('importSurveyCsv', () => {
  it('maps a normal CSV to studentIds', () => {
    const csv = buildCsv([
      {
        name: '1. 가온',
        ratings: { '2. 나래': '4', '3. 다온': '2', '1. 가온': '5' },
        best: ['2. 나래'],
        hard: ['3. 다온', '1. 가온'],
        hardReason: '자주 다퉈요',
        alone: '3',
        happy: '5',
        toTeacher: '안녕, "선생님"',
      },
      { name: '2. 나래', ratings: { '1. 가온': '5' }, best: ['1. 가온', '3. 다온'] },
      { name: '3. 다온' },
    ]);
    const p = importSurveyCsv(csv, cls);
    expect(p.ok).toBe(true);
    expect(p.responded).toEqual(['s1', 's2', 's3']);
    expect(p.notResponded).toEqual(['s4']);
    expect(p.unmatched).toEqual([]);
    expect(p.duplicates).toEqual([]);
    const r = p.result!;
    expect(r.classId).toBe('c1');
    expect(r.dismissed).toEqual([]);
    expect(r.parentInclude).toEqual({});
    expect(r.labels).toEqual({ s1: '1. 가온', s2: '2. 나래', s3: '3. 다온', s4: '4. 라희' });
    const a = r.responses.s1;
    expect(a.submittedAt).toBe('2026/11/18 10:00:00');
    expect(a.ratings).toEqual({ s2: 4, s3: 2 }); // self score dropped
    expect(a.best).toEqual(['s2']);
    expect(a.hard).toEqual(['s3']); // self nomination dropped
    expect(a.hardReason).toBe('자주 다퉈요');
    expect(a.alone).toBe(3);
    expect(a.happy).toBe(5);
    expect(a.schoolFun).toBeNull();
    expect(a.toTeacher).toBe('안녕, "선생님"');
    expect(r.responses.s2.best).toEqual(['s1', 's3']);
    expect(r.responses.s3.ratings).toEqual({});
    expect(r.responses.s3.best).toEqual([]);
  });

  it('rejects a CSV without the Q.hard column', () => {
    const p = importSurveyCsv(buildCsv([{ name: '1. 가온' }], cls, [Q.hard]), cls);
    expect(p.ok).toBe(false);
    expect(p.error).toBe('이 앱에서 만든 설문의 CSV가 아니에요');
    expect(p.missing).toContain(Q.hard);
  });

  it('lists Q.ratings once when the grid is missing', () => {
    const p = importSurveyCsv(buildCsv([{ name: '1. 가온' }], cls, [Q.ratings]), cls);
    expect(p.ok).toBe(false);
    expect(p.missing).toEqual([Q.ratings]);
  });

  it('reports unknown respondent names and ignores unknown grid labels', () => {
    const csv = buildCsv([
      { name: '9. 하늘', ratings: { '1. 가온': '5' } },
      { name: '1. 가온', ratings: { '2. 나래': '3' } },
    ]).replace('[2. 나래]', '[2. 다른이름]');
    const p = importSurveyCsv(csv, cls);
    expect(p.ok).toBe(true);
    expect(p.unmatched).toEqual(['9. 하늘']);
    expect(p.responded).toEqual(['s1']);
    expect(p.result!.responses.s1.ratings).toEqual({});
  });

  it('flags duplicates and uses the last row', () => {
    const csv = buildCsv([
      { name: '1. 가온', best: ['2. 나래'], happy: '1' },
      { name: '1. 가온', best: ['3. 다온'], happy: '4' },
    ]);
    const p = importSurveyCsv(csv, cls);
    expect(p.duplicates).toEqual(['s1']);
    expect(p.responded).toEqual(['s1']);
    expect(p.result!.responses.s1.best).toEqual(['s3']);
    expect(p.result!.responses.s1.happy).toBe(4);
  });
});
