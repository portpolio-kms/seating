import { describe, expect, it } from 'vitest';
import { analyzeSurvey } from '@/lib/survey/analyze';
import { buildParentCard, containsStudentName, maskNames } from '@/lib/survey/parentView';
import type { ParentInclude } from '@/lib/survey/types';
import { analysisFixture } from './fixture';

const ALL: ParentInclude = { ownHardReason: true, toTeacher: true, hardCount: true };
const NONE: ParentInclude = { ownHardReason: false, toTeacher: false, hardCount: false };
const stu = (id: string, number: number, name: string) => ({ id, number, name, gender: null });

describe('maskNames', () => {
  const roster = [stu('a', 1, '김가온'), stu('b', 2, '이나래')];
  it('masks full and given names, keeping particles', () => {
    expect(maskNames('김가온이랑 놀기 싫어요. 가온이가 장난쳐요. 나래야 미안', roster)).toBe(
      '○○이랑 놀기 싫어요. ○○이가 장난쳐요. ○○야 미안',
    );
  });
  it('masks 2-char names fully and leaves other text alone', () => {
    expect(maskNames('가온이랑 놀았어요', [stu('a', 1, '가온')])).toBe('○○이랑 놀았어요');
    expect(maskNames('그냥 힘들어요', roster)).toBe('그냥 힘들어요');
  });
  it('containsStudentName detects names', () => {
    expect(containsStudentName('나래가 싫어', roster)).toBe(true);
    expect(containsStudentName('아무도 없음', roster)).toBe(false);
  });
});

describe('buildParentCard', () => {
  it('include none -> no texts, hardCount null', () => {
    const { cls, result } = analysisFixture();
    result.responses.s1.hardReason = '가온 때문에 힘들어요';
    result.responses.s1.toTeacher = '안녕하세요';
    const m = analyzeSurvey(result, cls);
    const c = buildParentCard(result, 's1', cls, m.s1, NONE);
    expect(c.texts).toEqual([]);
    expect(c.hardCount).toBeNull();
    expect(c.studentLabel).toBe('가온');
    expect(c.surveyName).toBe('테스트 설문');
  });
  it('includes and masks own texts; counts own answers', () => {
    const { cls, result } = analysisFixture();
    result.responses.s1.toTeacher = '다온이랑 놀고 싶어요';
    result.responses.s1.hardReason = '라희가 놀려요';
    result.responses.s1.playWith = ['s2', 's3'];
    result.responses.s1.helpFrom = ['s2'];
    const m = analyzeSurvey(result, cls);
    const c = buildParentCard(result, 's1', cls, m.s1, ALL);
    expect(c.texts).toEqual([
      { label: '친구 관계 고민(본인)', text: '○○가 놀려요' },
      { label: '선생님께 하고 싶은 말', text: '○○이랑 놀고 싶어요' },
    ]);
    expect(c.hardCount).toBe(1);
    expect(c.playWithCount).toBe(2);
    expect(c.helpFromCount).toBe(1);
    expect(c.mutualCount).toBe(m.s1.mutual.length);
    expect(c.receivedAvg).toBe(m.s1.receivedAvg);
    expect(c.scores).toEqual({ alone: 2, happy: 4, schoolFun: 4, family: null });
  });
  it('hardCount is the number of roster students who nominated this student', () => {
    const { cls, result } = analysisFixture();
    const m = analyzeSurvey(result, cls);
    expect(m.s4.nominatedBy.length).toBe(2);
    expect(buildParentCard(result, 's4', cls, m.s4, ALL).hardCount).toBe(2);
    expect(buildParentCard(result, 's4', cls, m.s4, NONE).hardCount).toBeNull();
  });
  it('non-respondent -> scores null, zero counts', () => {
    const { cls, result } = analysisFixture();
    const m = analyzeSurvey(result, cls);
    const c = buildParentCard(result, 's6', cls, m.s6, ALL);
    expect(c.scores).toBeNull();
    expect(c.texts).toEqual([]);
    expect(c.playWithCount).toBe(0);
    expect(c.helpFromCount).toBe(0);
  });
  it('never leaks another student name, given name or id (all students, all flags)', () => {
    const { cls, result } = analysisFixture();
    // Every response mentions every roster name in its free text.
    const names = cls.students.map((s) => s.name).join(' ');
    for (const r of Object.values(result.responses)) {
      r.hardReason = `${names} 때문에 힘들어요`;
      r.toTeacher = `${names}랑 ${names}가`;
      r.playWith = cls.students.map((s) => s.id);
      r.helpFrom = cls.students.map((s) => s.id);
    }
    const m = analyzeSurvey(result, cls);
    for (const me of cls.students) {
      const json = JSON.stringify(buildParentCard(result, me.id, cls, m[me.id], ALL));
      for (const other of cls.students) {
        if (other.id === me.id) continue;
        expect(json, `${me.id} leaks name of ${other.id}`).not.toContain(other.name);
        expect(json, `${me.id} leaks id ${other.id}`).not.toContain(other.id);
      }
      expect(json).not.toContain('sx');
    }
  });
});

describe('maskNames bypass regressions', () => {
  it('compound surname: given name is masked', () => {
    const r = [stu('a', 1, '남궁민수')];
    expect(maskNames('민수야 미안', r)).toBe('○○야 미안');
    expect(maskNames('남궁민수가 때렸어요', r)).toBe('○○가 때렸어요');
    expect(containsStudentName('민수야 미안', r)).toBe(true);
  });
  it('2-char names: second char masked before 이/아/야 only', () => {
    const r = [stu('a', 1, '이준'), stu('b', 2, '김솔')];
    expect(maskNames('준이가 때렸어요', r)).toBe('○○이가 때렸어요');
    expect(maskNames('솔아 미안', r)).toBe('○○아 미안');
    expect(maskNames('준비물을 챙겼어요', r)).toBe('준비물을 챙겼어요');
    expect(containsStudentName('준이가 때렸어요', r)).toBe(true);
    expect(containsStudentName('준비물', r)).toBe(false);
  });
  it('whitespace in roster name or text', () => {
    const r = [stu('a', 1, '김 가온')];
    expect(maskNames('김가온이랑 놀아요. 가온이가 해요', r)).toBe('○○이랑 놀아요. ○○이가 해요');
    expect(maskNames('김 가온이랑', r)).toBe('○○이랑');
    expect(containsStudentName('김 가온이랑', r)).toBe(true);
    expect(containsStudentName('김가온이랑', r)).toBe(true);
  });
  it('case-insensitive romanized names', () => {
    const r = [stu('a', 1, 'Daniel')];
    expect(maskNames('daniel이랑 DANIEL', r)).toBe('○○이랑 ○○');
    expect(containsStudentName('daniel', r)).toBe(true);
  });
  it('NFC normalizes decomposed text', () => {
    const r = [stu('a', 1, '김가온')];
    expect(maskNames('김가온이랑'.normalize('NFD'), r)).toBe('○○이랑');
    expect(containsStudentName('김가온'.normalize('NFD'), r)).toBe(true);
  });
  it('leak test with surnamed, compound, 2-char, spaced and romanized names', () => {
    const { cls, result } = analysisFixture();
    ['김가온', '남궁민수', '이준', '김 솔', 'Daniel', '이나래'].forEach((n, i) => {
      cls.students[i].name = n;
    });
    const text =
      '김가온 가온이가 남궁민수 민수야 이준 준이가 김솔 솔아 daniel Daniel 이나래 나래야 김 가온';
    for (const r of Object.values(result.responses)) {
      r.hardReason = text;
      r.toTeacher = text;
    }
    const m = analyzeSurvey(result, cls);
    for (const me of cls.students) {
      const json = JSON.stringify(buildParentCard(result, me.id, cls, m[me.id], ALL));
      const others = cls.students.filter((s) => s.id !== me.id);
      expect(containsStudentName(json, others), `${me.id} leaks: ${json}`).toBe(false);
      for (const o of others) expect(json).not.toContain(o.id);
    }
  });
});
