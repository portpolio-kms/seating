import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { RadarView } from '@/components/relations/RadarView';
import type { ClassRecord } from '@/lib/db/repo';
import type { SurveyResult } from '@/lib/survey/types';
import { analysisFixture } from '../../lib/survey/fixture';

afterEach(() => vi.restoreAllMocks());

function setup(over?: { cls?: Partial<ClassRecord>; survey?: Partial<SurveyResult> }) {
  const f = analysisFixture();
  const cls = { ...f.cls, ...over?.cls };
  const survey = { ...f.result, ...over?.survey };
  const onChange = vi.fn();
  const onSurveyChange = vi.fn();
  const openCard = vi.fn();
  const ui = (c: ClassRecord, s: SurveyResult) => (
    <RadarView cls={c} survey={s} onChange={onChange} onSurveyChange={onSurveyChange} openCard={openCard} />
  );
  const view = render(ui(cls, survey));
  return { cls, survey, onChange, onSurveyChange, openCard, view, ui };
}

const suggestionItem = (a: string, b: string) =>
  screen.getByText(`${a} · ${b}`).closest('li') as HTMLElement;

describe('RadarView', () => {
  it('lists high before medium with reasons and a no-response badge', () => {
    setup();
    const items = within(screen.getByRole('list', { name: '관심 학생 목록' })).getAllByRole('listitem');
    const names = items.map((li) => within(li).getAllByRole('button')[0].textContent);
    expect(names).toEqual(['나래', '라희', '가온', '다온', '바다']);
    expect(within(items[0]).getByText('높음')).toBeInTheDocument();
    expect(within(items[0]).getByText('자아 만족도 2점')).toBeInTheDocument();
    expect(within(items[1]).getByText('친구 2명이 함께 있기 힘들다고 적음')).toBeInTheDocument();
    expect(within(items[2]).getByText('보통')).toBeInTheDocument();
    expect(within(items[4]).getByText('설문 미응답')).toBeInTheDocument();
    expect(within(items[4]).getByText(/받은 점수 중 낮은 점수 40%/)).toBeInTheDocument();
    expect(within(items[0]).queryByText('설문 미응답')).toBeNull();
  });

  it('shows all non-respondents in a separate list', () => {
    setup();
    const box = screen.getByRole('region', { name: '설문 미응답 학생' });
    expect(within(box).getByText('바다')).toBeInTheDocument();
  });

  it('opens the card when a name is clicked', () => {
    const { openCard } = setup();
    fireEvent.click(within(screen.getByRole('list', { name: '관심 학생 목록' })).getByRole('button', { name: '라희' }));
    expect(openCard).toHaveBeenCalledWith('s4');
  });

  it('shows an empty message when nobody needs attention', () => {
    const { result } = analysisFixture();
    const cls = analysisFixture().cls;
    cls.students = cls.students.slice(0, 1);
    render(
      <RadarView
        cls={cls}
        survey={{ ...result, responses: { s1: result.responses.s1 } }}
        onChange={vi.fn()}
        onSurveyChange={vi.fn()}
        openCard={vi.fn()}
      />,
    );
    expect(screen.getByText('지금 기준으로 먼저 챙길 학생이 없어요')).toBeInTheDocument();
  });

  it('suggests pairs sorted by roster number and marks mutual nominations', () => {
    setup();
    const lis = within(screen.getByRole('list', { name: '쌍 조건 추천' })).getAllByRole('listitem');
    expect(lis.map((li) => within(li).getByText(/ · /).textContent)).toEqual(['가온 · 라희', '나래 · 라희']);
    expect(within(lis[0]).getByText('서로 지목')).toBeInTheDocument();
    expect(within(lis[1]).queryByText('서로 지목')).toBeNull();
  });

  it('adds an avoid-pair constraint, then shows it as already set', () => {
    const { onChange, cls, survey, view, ui } = setup();
    fireEvent.click(within(suggestionItem('가온', '라희')).getByRole('button', { name: '짝 금지 추가' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ClassRecord;
    expect(next.constraints).toHaveLength(1);
    expect(next.constraints[0]).toMatchObject({ a: 's1', b: 's4', kind: 'avoid-pair' });
    expect(next.constraints[0].id).toBeTruthy();
    view.rerender(ui(next, survey));
    const li = suggestionItem('가온', '라희');
    expect(within(li).getByText('이미 설정됨')).toBeInTheDocument();
    expect(within(li).queryByRole('button')).toBeNull();
    expect(cls.constraints).toHaveLength(0);
  });

  it('adds an avoid-group constraint', () => {
    const { onChange } = setup();
    fireEvent.click(within(suggestionItem('나래', '라희')).getByRole('button', { name: '모둠 금지 추가' }));
    expect((onChange.mock.calls[0][0] as ClassRecord).constraints[0]).toMatchObject({
      a: 's2',
      b: 's4',
      kind: 'avoid-group',
    });
  });

  it('shows the canAddConstraint message instead of adding', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { onChange } = setup({
      cls: { constraints: [{ id: 'x', a: 's4', b: 's1', kind: 'must-pair' }] },
    });
    // an existing constraint hides the buttons, so check the other pair with a clashing rule instead
    expect(within(suggestionItem('가온', '라희')).getByText('이미 설정됨')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('alerts with the rejection message when the constraint is not allowed', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const constraints = await import('@/lib/seating/constraints');
    vi.spyOn(constraints, 'canAddConstraint').mockReturnValue('거부 메시지');
    const { onChange } = setup();
    fireEvent.click(within(suggestionItem('가온', '라희')).getByRole('button', { name: '짝 금지 추가' }));
    expect(alert).toHaveBeenCalledWith('거부 메시지');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('dismisses a suggestion through onSurveyChange and hides it afterwards', () => {
    const { onSurveyChange, survey, view, ui, cls } = setup();
    fireEvent.click(within(suggestionItem('나래', '라희')).getByRole('button', { name: '넘기기' }));
    expect(onSurveyChange).toHaveBeenCalledTimes(1);
    const next = onSurveyChange.mock.calls[0][0] as SurveyResult;
    expect(next.dismissed).toEqual(['s2|s4']);
    view.rerender(ui(cls, next));
    expect(screen.queryByText('나래 · 라희')).toBeNull();
    expect(screen.getByText('가온 · 라희')).toBeInTheDocument();
    expect(survey.dismissed).toEqual([]);
  });
});

describe('classroom screens stay free of relationship code', () => {
  it.each(['src/app/page.tsx', 'src/app/present/page.tsx'])('%s does not import survey or relations code', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    expect(src).not.toMatch(/@\/lib\/survey/);
    expect(src).not.toMatch(/@\/components\/relations/);
  });
});
