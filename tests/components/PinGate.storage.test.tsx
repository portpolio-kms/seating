import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as repo from '@/lib/db/repo';
import { PinGate } from '@/components/PinGate';

vi.mock('@/lib/db/repo', async (orig) => {
  const real = await orig<typeof import('@/lib/db/repo')>();
  return { ...real, getSettings: vi.fn(real.getSettings), saveSettings: vi.fn(real.saveSettings) };
});

const STORAGE_ERROR = '저장소를 열 수 없어요. 브라우저 설정(사생활 보호 모드 등)을 확인해 주세요';
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

beforeEach(async () => {
  vi.mocked(repo.getSettings).mockClear();
  vi.mocked(repo.saveSettings).mockClear();
  await repo.wipeAll();
});

describe('PinGate storage failures', () => {
  it('shows a message instead of a blank page when settings cannot be read', async () => {
    vi.mocked(repo.getSettings).mockRejectedValueOnce(new Error('blocked'));
    render(<PinGate onUnlock={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(STORAGE_ERROR);
  });

  it('shows the message when saving the PIN fails', async () => {
    vi.mocked(repo.saveSettings).mockRejectedValueOnce(new Error('quota'));
    const onUnlock = vi.fn();
    render(<PinGate onUnlock={onUnlock} />);
    await screen.findByText('PIN 정하기');
    type(screen.getByLabelText('PIN'), '1234');
    type(screen.getByLabelText('PIN 다시 입력'), '1234');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(STORAGE_ERROR);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('ignores a second submit while the first is still running', async () => {
    const onUnlock = vi.fn();
    render(<PinGate onUnlock={onUnlock} />);
    await screen.findByText('PIN 정하기');
    type(screen.getByLabelText('PIN'), '1234');
    type(screen.getByLabelText('PIN 다시 입력'), '1234');
    const form = screen.getByRole('button', { name: '확인' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(repo.saveSettings).toHaveBeenCalledTimes(1);
  });
});
