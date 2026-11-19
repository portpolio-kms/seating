import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SurveySetup } from '@/components/relations/SurveySetup';
import { buildAppsScript } from '@/lib/survey/appsScript';
import { fakeClass } from '../../lib/survey/fixture';

afterEach(() => vi.unstubAllGlobals());

describe('SurveySetup', () => {
  it('copies the generated script to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const cls = fakeClass(4);
    render(<SurveySetup cls={cls} />);
    const title = (screen.getByLabelText('설문 제목') as HTMLInputElement).value;
    expect(title).toMatch(/^테스트반 교우관계 설문 \d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByRole('button', { name: '복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(buildAppsScript(cls, title)));
    expect(await screen.findByText('복사했어요')).toBeTruthy();
  });

  it('uses the edited title', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const cls = fakeClass(4);
    render(<SurveySetup cls={cls} />);
    fireEvent.change(screen.getByLabelText('설문 제목'), { target: { value: '내 설문' } });
    fireEvent.click(screen.getByRole('button', { name: '복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(buildAppsScript(cls, '내 설문')));
  });

  it('falls back to the default title when the title is blank', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const cls = fakeClass(4);
    render(<SurveySetup cls={cls} />);
    const defaultTitle = (screen.getByLabelText('설문 제목') as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText('설문 제목'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(buildAppsScript(cls, defaultTitle)));
  });

  it('tells to download the responses tab as CSV', () => {
    render(<SurveySetup cls={fakeClass(4)} />);
    expect(
      screen.getByText(
        "응답이 모이면 아래쪽 '설문지 응답 시트1' 탭을 연 상태에서 파일 → 다운로드 → 쉼표로 구분된 값(.csv)을 고릅니다.",
      ),
    ).toBeTruthy();
  });

  it('shows a manual-copy message when the clipboard fails', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } });
    render(<SurveySetup cls={fakeClass(4)} />);
    fireEvent.click(screen.getByRole('button', { name: '복사' }));
    expect(await screen.findByText('직접 선택해서 복사해 주세요')).toBeTruthy();
  });

  it('shows the 7 steps', () => {
    render(<SurveySetup cls={fakeClass(4)} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
  });

  it('asks for a roster when empty', () => {
    const cls = { ...fakeClass(4), students: [] };
    render(<SurveySetup cls={cls} />);
    expect(screen.getByText('명단을 먼저 입력해 주세요')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '복사' })).toBeNull();
  });
});
