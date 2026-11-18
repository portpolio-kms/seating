import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PinGate } from '@/components/PinGate';
import { getSettings, saveSettings, wipeAll } from '@/lib/db/repo';
import { hashPin, newSalt } from '@/lib/auth/pin';

const pinInput = () => screen.getByLabelText('PIN') as HTMLInputElement;
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

beforeEach(async () => { await wipeAll(); });

describe('PinGate setup', () => {
  it('shows mismatch error', async () => {
    const onUnlock = vi.fn();
    render(<PinGate onUnlock={onUnlock} />);
    await screen.findByText('PIN 정하기');
    type(screen.getByLabelText('PIN'), '1234');
    type(screen.getByLabelText('PIN 다시 입력'), '1235');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByText('두 PIN이 달라요')).toBeInTheDocument();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('saves and unlocks when both match', async () => {
    const onUnlock = vi.fn();
    render(<PinGate onUnlock={onUnlock} />);
    await screen.findByText('PIN 정하기');
    type(screen.getByLabelText('PIN'), '1234');
    type(screen.getByLabelText('PIN 다시 입력'), '1234');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
    const s = await getSettings();
    expect(s.pinSalt).toBeTruthy();
    expect(s.pinHash).toBe(await hashPin('1234', s.pinSalt!));
  });
});

describe('PinGate unlock', () => {
  beforeEach(async () => {
    const salt = newSalt();
    await saveSettings({ pinSalt: salt, pinHash: await hashPin('1234', salt) });
  });

  it('rejects wrong PIN', async () => {
    const onUnlock = vi.fn();
    render(<PinGate onUnlock={onUnlock} />);
    await screen.findByText('이 잠금은 학생이 지나가다 보는 것을 막는 용도예요.');
    expect(pinInput()).toHaveAttribute('type', 'password');
    expect(pinInput()).toHaveAttribute('inputmode', 'numeric');
    type(pinInput(), '0000');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByText('PIN이 맞지 않아요')).toBeInTheDocument();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('accepts correct PIN', async () => {
    const onUnlock = vi.fn();
    render(<PinGate onUnlock={onUnlock} />);
    await screen.findByLabelText('PIN');
    type(pinInput(), '1234');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
  });

  it('warnOnScreen requires confirmation first', async () => {
    render(<PinGate onUnlock={() => {}} warnOnScreen />);
    await screen.findByText('지금 화면이 TV에 보일 수 있어요. 계속할까요?');
    expect(screen.queryByLabelText('PIN')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '계속' }));
    expect(await screen.findByLabelText('PIN')).toBeInTheDocument();
  });

  it('forgot PIN wipes data after confirm and shows setup', async () => {
    render(<PinGate onUnlock={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'PIN을 잊었어요' }));
    expect(screen.getByText('모든 데이터를 지우고 새로 시작할까요? 되돌릴 수 없어요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '모든 데이터를 지우고 새로 시작' }));
    await screen.findByText('PIN 정하기');
    expect((await getSettings()).pinHash).toBeNull();
  });
});

describe('PinGate onCancel', () => {
  it('offers 돌아가기 only when onCancel is given, on warn and unlock steps', async () => {
    const salt = newSalt();
    await saveSettings({ pinSalt: salt, pinHash: await hashPin('1234', salt) });
    const { unmount } = render(<PinGate onUnlock={vi.fn()} warnOnScreen />);
    await screen.findByText(/TV에 보일 수 있어요/);
    expect(screen.queryByRole('button', { name: '돌아가기' })).toBeNull();
    unmount();

    const onCancel = vi.fn();
    render(<PinGate onUnlock={vi.fn()} warnOnScreen onCancel={onCancel} />);
    await screen.findByText(/TV에 보일 수 있어요/);
    fireEvent.click(screen.getByRole('button', { name: '계속' }));
    await screen.findByLabelText('PIN');
    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
