import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CounselingCard } from '@/components/relations/CounselingCard';
import { addSeatingRecord, wipeAll } from '@/lib/db/repo';
import type { ParentInclude, SurveyResult } from '@/lib/survey/types';
import { analysisFixture } from '../../lib/survey/fixture';

beforeEach(async () => {
  await wipeAll();
});
afterEach(() => vi.restoreAllMocks());

/** Fixture plus free text that mentions other students by name. */
function data(include?: Partial<ParentInclude>) {
  const { cls, result } = analysisFixture();
  const r = result.responses;
  r.s1 = {
    ...r.s1,
    best: ['s2'],
    playWith: ['s2', 's3'],
    helpFrom: ['s2'],
    wantCloser: ['s5'],
    hardReason: '라희가 자꾸 놀려요',
    toTeacher: '나래와 바다랑 더 놀고 싶어요',
    family: 5,
  };
  r.s4 = { ...r.s4, hardReason: '가온이가 내 물건을 가져가요' };
  r.s2 = { ...r.s2, best: ['s1', 'sx'] };
  if (include) {
    result.parentInclude = {
      s1: { ownHardReason: false, toTeacher: false, hardCount: false, ...include },
    };
  }
  return { cls, result };
}

function setup(studentId = 's1', survey?: SurveyResult) {
  const d = data();
  const s = survey ?? d.result;
  const onSurveyChange = vi.fn();
  const onSelectStudent = vi.fn();
  const view = render(
    <CounselingCard
      cls={d.cls}
      survey={s}
      studentId={studentId}
      onSurveyChange={onSurveyChange}
      onSelectStudent={onSelectStudent}
    />,
  );
  return { ...d, onSurveyChange, onSelectStudent, view };
}

const section = (name: string) => screen.getByRole('region', { name });

describe('CounselingCard - teacher view', () => {
  it('shows mutual friends, nominations and the nominator reason text with names', () => {
    setup('s1');
    expect(within(section('서로 친함')).getByText('나래')).toBeInTheDocument();
    const by = section('이 학생을 지목한 학생');
    expect(within(by).getByText('라희')).toBeInTheDocument();
    expect(within(by).getByText('가온이가 내 물건을 가져가요')).toBeInTheDocument();
    const mine = section('이 학생이 지목한 학생');
    expect(within(mine).getByText('라희')).toBeInTheDocument();
    expect(within(mine).getByText('라희가 자꾸 놀려요')).toBeInTheDocument();
    expect(within(section('이 학생을 친한 친구로 고른 학생')).getByText('나래')).toBeInTheDocument();
    expect(within(section('본인 응답')).getByText('나래와 바다랑 더 놀고 싶어요')).toBeInTheDocument();
  });

  it('shows a deleted student as (삭제된 학생)', () => {
    setup('s2');
    expect(within(section('3. 가장 친한 친구')).getByText('(삭제된 학생)')).toBeInTheDocument();
  });

  it('shows radar signals and the isolation note', () => {
    setup('s4');
    expect(screen.getByText(/친구 2명이 함께 있기 힘들다고 적음/)).toBeInTheDocument();
    expect(
      screen.getByText('참고: 서로 친한 친구가 없고 혼자 있는 때가 많다고 답했어요'),
    ).toBeInTheDocument();
  });

  it('lists related pair constraints', () => {
    const d = data();
    d.cls.constraints = [{ id: 'k1', a: 's1', b: 's4', kind: 'avoid-pair' }];
    render(
      <CounselingCard cls={d.cls} survey={d.result} studentId="s1" onSurveyChange={vi.fn()} onSelectStudent={vi.fn()} />,
    );
    expect(within(section('관련 쌍 조건')).getByText('라희 · 짝 금지')).toBeInTheDocument();
  });

  it('shows the desk-mate from the most recent seating record', async () => {
    const { cls } = data();
    await addSeatingRecord({
      id: 'old',
      classId: cls.id,
      createdAt: '2026-10-01T00:00:00.000Z',
      layout: cls.layout,
      assignment: { 'u0-0-s0': 's1', 'u0-0-s1': 's3' },
      studentNames: { s1: '가온', s3: '다온' },
    });
    await addSeatingRecord({
      id: 'new',
      classId: cls.id,
      createdAt: '2026-11-01T00:00:00.000Z',
      layout: cls.layout,
      assignment: { 'u0-0-s0': 's2', 'u0-0-s1': 's1' },
      studentNames: { s1: '가온', s2: '나래' },
    });
    setup('s1');
    expect(await within(section('최근 확정 자리')).findByText('짝: 나래')).toBeInTheDocument();
  });

  it('moves between students in number order', () => {
    const { onSelectStudent } = setup('s2');
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(onSelectStudent).toHaveBeenLastCalledWith('s1');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(onSelectStudent).toHaveBeenLastCalledWith('s3');
    fireEvent.change(screen.getByLabelText('학생 선택'), { target: { value: 's5' } });
    expect(onSelectStudent).toHaveBeenLastCalledWith('s5');
  });

  it('renders a non-respondent card without errors, with metrics from others only', () => {
    setup('s6');
    expect(screen.getByText(/설문 미응답/)).toBeInTheDocument();
    expect(within(section('지표')).getByText('2.4')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '본인 응답' })).toBeNull();
  });
});

describe('CounselingCard - parent include checkboxes', () => {
  it('saves the include flag through onSurveyChange', () => {
    const { onSurveyChange } = setup('s1');
    fireEvent.click(screen.getByLabelText('선생님께 하고 싶은 말 포함'));
    expect(onSurveyChange).toHaveBeenCalledTimes(1);
    expect(onSurveyChange.mock.calls[0][0].parentInclude.s1).toEqual({
      ownHardReason: false,
      toTeacher: true,
      hardCount: false,
    });
  });

  it('warns when a checked free text contains a student name', () => {
    setup('s1', data({ toTeacher: true }).result);
    expect(screen.getByLabelText('선생님께 하고 싶은 말 포함')).toBeChecked();
    expect(screen.getByText('학생 이름이 들어 있어요. 학부모 보기에서는 ○○로 가려져요')).toBeInTheDocument();
  });

  it('does not warn when nothing is checked', () => {
    setup('s1');
    expect(screen.queryByText('학생 이름이 들어 있어요. 학부모 보기에서는 ○○로 가려져요')).toBeNull();
  });
});

describe('CounselingCard - parent view', () => {
  const others = ['나래', '다온', '라희', '마루', '바다'];

  it('contains no other roster name even with every item included', () => {
    const { view } = setup('s1', data({ ownHardReason: true, toTeacher: true, hardCount: true }).result);
    fireEvent.click(screen.getByRole('button', { name: '학부모 보기' }));
    const text = view.container.textContent ?? '';
    for (const n of others) expect(text).not.toContain(n);
    expect(text).toContain('가온');
    expect(text).toContain('○○가 자꾸 놀려요');
    expect(text).toContain('○○와 ○○랑 더 놀고 싶어요');
    expect(within(section('학부모 보기')).getByText('지목받은 수')).toBeInTheDocument();
    expect(text).not.toContain('내 물건을 가져가요');
  });

  it('contains no other roster name for any student', () => {
    const all = data({ ownHardReason: true, toTeacher: true, hardCount: true });
    for (const s of all.cls.students) {
      all.result.parentInclude[s.id] = { ownHardReason: true, toTeacher: true, hardCount: true };
    }
    for (const s of all.cls.students) {
      const { view } = setup(s.id, all.result);
      fireEvent.click(screen.getByRole('button', { name: '학부모 보기' }));
      const text = view.container.textContent ?? '';
      for (const o of all.cls.students) if (o.id !== s.id) expect(text).not.toContain(o.name);
      view.unmount();
    }
  });

  it('hides unchecked free text and the nomination count by default', () => {
    const { view } = setup('s1');
    fireEvent.click(screen.getByRole('button', { name: '학부모 보기' }));
    const text = view.container.textContent ?? '';
    expect(text).not.toContain('놀려요');
    expect(text).not.toContain('놀고 싶어요');
    expect(text).not.toContain('지목받은 수');
  });

  it('renders a non-respondent parent card without errors', () => {
    setup('s6');
    fireEvent.click(screen.getByRole('button', { name: '학부모 보기' }));
    expect(within(section('학부모 보기')).getByText(/설문 미응답/)).toBeInTheDocument();
  });
});

describe('CounselingCard - print', () => {
  it('prints the currently shown view inside .print-area', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { view } = setup('s1');
    fireEvent.click(screen.getByRole('button', { name: '인쇄' }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('.print-area')?.textContent).toContain('서로 친함');

    fireEvent.click(screen.getByRole('button', { name: '학부모 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '인쇄' }));
    expect(print).toHaveBeenCalledTimes(2);
    const area = view.container.querySelector('.print-area');
    expect(area?.textContent).not.toContain('서로 친함');
    expect(area?.textContent).toContain('받은 평균');
  });
});
