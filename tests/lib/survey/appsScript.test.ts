import { describe, expect, it } from 'vitest';
import { buildAppsScript } from '@/lib/survey/appsScript';
import { Q } from '@/lib/survey/questions';
import { fakeClass } from './fixture';

describe('buildAppsScript', () => {
  it('contains all 13 Q titles in order 1 -> 12', () => {
    const code = buildAppsScript(fakeClass(4), '테스트 설문');
    const values = Object.values(Q);
    expect(values).toHaveLength(13);
    let pos = -1;
    for (const v of values) {
      const idx = code.indexOf(JSON.stringify(v), pos + 1);
      expect(idx, v).toBeGreaterThan(pos);
      pos = idx;
    }
  });

  it('includes student labels but no constraint data', () => {
    const cls = fakeClass(4);
    cls.constraints = [{ id: 'k1', a: 's1', b: 's2', kind: 'avoid-pair' }, { id: 'k2', a: 's3', b: 's4', kind: 'must-pair' }];
    const code = buildAppsScript(cls, '제목');
    expect(code).toContain('3. 다온');
    expect(code).not.toMatch(/avoid|must|k1|k2/);
  });

  it('escapes quotes in names and title safely', () => {
    const cls = fakeClass(2);
    cls.students[0].name = '가"온' + String.fromCharCode(92);
    const code = buildAppsScript(cls, '반 "설문"');
    expect(code).toContain(JSON.stringify(['1. 가"온' + String.fromCharCode(92), '2. 나래']));
    expect(code).toContain(JSON.stringify('반 "설문"'));
    expect(() => new Function(code)).not.toThrow();
  });

  it('is syntactically valid JavaScript with a single entry function', () => {
    const code = buildAppsScript(fakeClass(6), '제목');
    expect(() => new Function(code)).not.toThrow();
    expect(code.match(/function createSeatingSurvey\(\)/g)).toHaveLength(1);
    expect(code).toContain('setCollectEmail(false)');
    expect(code).toContain('setLimitOneResponsePerUser(false)');
    expect(code).toContain('getPublishedUrl()');
  });

  it('sorts students by number', () => {
    const cls = fakeClass(3);
    cls.students = [...cls.students].reverse();
    const code = buildAppsScript(cls, 't');
    expect(code).toContain(JSON.stringify(['1. 가온', '2. 나래', '3. 다온']));
  });
});
