import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIdleLock } from '@/hooks/useIdleLock';

describe('useIdleLock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('locks once after idle minutes', () => {
    const onLock = vi.fn();
    renderHook(() => useIdleLock({ minutes: 5, enabled: true, onLock }));
    act(() => { vi.advanceTimersByTime(5 * 60_000); });
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('activity resets the timer', () => {
    const onLock = vi.fn();
    renderHook(() => useIdleLock({ minutes: 5, enabled: true, onLock }));
    act(() => { vi.advanceTimersByTime(4 * 60_000 + 59_000); });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); });
    act(() => { vi.advanceTimersByTime(4 * 60_000); });
    expect(onLock).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const onLock = vi.fn();
    renderHook(() => useIdleLock({ minutes: 5, enabled: false, onLock }));
    act(() => { vi.advanceTimersByTime(10 * 60_000); });
    expect(onLock).not.toHaveBeenCalled();
  });
});
