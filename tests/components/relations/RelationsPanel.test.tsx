import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { wipeAll } from '@/lib/db/repo';
import { listSurveys, saveSurvey } from '@/lib/db/surveys';
import { RelationsPanel } from '@/components/relations/RelationsPanel';
import type { SurveyResult } from '@/lib/survey/types';
import { fakeClass } from '../../lib/survey/fixture';

vi.mock('vis-network/standalone', () => ({
  Network: class {
    on() {}
    destroy() {}
  },
}));

beforeEach(async () => {
  await wipeAll();
});

const survey = (id: string, name: string, importedAt: string): SurveyResult => ({
  id,
  classId: 'c1',
  name,
  importedAt,
  labels: {},
  responses: {},
  dismissed: [],
  parentInclude: {},
});

describe('RelationsPanel', () => {
  it('offers only the existing sub-views and starts on setup when there are no surveys', async () => {
    render(<RelationsPanel cls={fakeClass(4)} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '설문 만들기' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '결과 올리기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '관계망' })).toBeNull();
    expect(screen.queryByLabelText('설문 선택')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '결과 올리기' }));
    expect(screen.getByText('먼저 결과를 올려 주세요')).toBeInTheDocument();
  });

  it('lists surveys newest first and selects the newest by default', async () => {
    await saveSurvey(survey('a', '10월 설문', '2026-10-01T00:00:00.000Z'));
    await saveSurvey(survey('b', '11월 설문', '2026-11-01T00:00:00.000Z'));
    render(<RelationsPanel cls={fakeClass(4)} onChange={vi.fn()} />);
    const select = await screen.findByLabelText('설문 선택');
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual(['b', 'a']);
    expect(select).toHaveValue('b');
  });

  it('deletes a survey only after confirming', async () => {
    await saveSurvey(survey('a', '10월 설문', '2026-10-01T00:00:00.000Z'));
    render(<RelationsPanel cls={fakeClass(4)} onChange={vi.fn()} />);
    await screen.findByLabelText('설문 선택');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    expect(await listSurveys('c1')).toHaveLength(1);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    await waitFor(async () => expect(await listSurveys('c1')).toEqual([]));
    expect(screen.queryByLabelText('설문 선택')).toBeNull();
    confirm.mockRestore();
  });

  it('keeps the view the user picked when the survey load resolves later', async () => {
    await saveSurvey(survey('a', '10월 설문', '2026-10-01T00:00:00.000Z'));
    render(<RelationsPanel cls={fakeClass(4)} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '설문 만들기' }));
    await screen.findByLabelText('설문 선택');
    expect(screen.getByRole('button', { name: '설문 만들기' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the local calendar date of the import', async () => {
    const iso = '2026-10-01T00:00:00.000Z';
    await saveSurvey(survey('a', '10월 설문', iso));
    render(<RelationsPanel cls={fakeClass(4)} onChange={vi.fn()} />);
    const d = new Date(iso);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(await screen.findByRole('option', { name: `10월 설문 (${local})` })).toBeInTheDocument();
  });

  it('shows the radar button only with a survey; dismissal persists; adding calls onChange', async () => {
    const { analysisFixture } = await import('../../lib/survey/fixture');
    const { cls, result } = analysisFixture();
    const first = render(<RelationsPanel cls={cls} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '관심 학생' })).toBeNull();
    first.unmount();
    await saveSurvey(result);
    const onChange = vi.fn();
    render(<RelationsPanel cls={cls} onChange={onChange} />);
    fireEvent.click(await screen.findByRole('button', { name: '관심 학생' }));
    const li = screen.getByText('나래 · 라희').closest('li') as HTMLElement;
    fireEvent.click(within(li).getByRole('button', { name: '넘기기' }));
    await waitFor(async () => expect((await listSurveys(cls.id))[0].dismissed).toEqual(['s2|s4']));
    expect(screen.queryByText('나래 · 라희')).toBeNull();
    const li2 = screen.getByText('가온 · 라희').closest('li') as HTMLElement;
    fireEvent.click(within(li2).getByRole('button', { name: '짝 금지 추가' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].constraints[0]).toMatchObject({ a: 's1', b: 's4', kind: 'avoid-pair' });
  });

  it('hides the radar button and shows the empty upload state after the last survey is deleted', async () => {
    const { analysisFixture } = await import('../../lib/survey/fixture');
    const { cls, result } = analysisFixture();
    await saveSurvey(result);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RelationsPanel cls={cls} onChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '관심 학생' }));
    expect(screen.getByText('쌍 조건 추천')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '결과 올리기' }));
    fireEvent.click(await screen.findByRole('button', { name: '지우기' }));
    await waitFor(() => expect(screen.getByText('먼저 결과를 올려 주세요')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '관심 학생' })).toBeNull();
  });

  it('shows the graph button only with a survey and renders the graph view', async () => {
    const { analysisFixture } = await import('../../lib/survey/fixture');
    const { cls, result } = analysisFixture();
    const first = render(<RelationsPanel cls={cls} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '관계망' })).toBeNull();
    first.unmount();
    await saveSurvey(result);
    render(<RelationsPanel cls={cls} onChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '관계망' }));
    expect(screen.getByLabelText('선 필터')).toBeInTheDocument();
  });
});
