import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { wipeAll } from '@/lib/db/repo';
import { listSurveys, saveSurvey } from '@/lib/db/surveys';
import { RelationsPanel } from '@/components/relations/RelationsPanel';
import type { SurveyResult } from '@/lib/survey/types';
import { fakeClass } from '../../lib/survey/fixture';

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
});
