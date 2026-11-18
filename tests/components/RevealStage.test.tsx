import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { useReveal } from '@/components/reveal/useReveal';
import { RevealStage } from '@/components/reveal/RevealStage';
import type { StageView } from '@/lib/channel';

const names = ['가온', '나래', '다온', '라희'];
const stage: StageView = {
  className: '3-1', mode: 'pair', rows: 1, cols: 2,
  units: [
    { id: 'u0-0', row: 0, col: 0, seats: [{ seatId: 'u0-0-s0', name: names[0] }, { seatId: 'u0-0-s1', name: names[1] }] },
    { id: 'u0-1', row: 0, col: 1, seats: [{ seatId: 'u0-1-s0', name: names[2] }, { seatId: 'u0-1-s1', name: names[3] }] },
  ],
};
const finals = Object.fromEntries(stage.units.flatMap((u) => u.seats.map((s) => [s.seatId, s.name])));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useReveal', () => {
  it('A: ends after 2.5s with all names, onDone once', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useReveal({ stage, style: 'A', speed: 2, onDone }));
    expect(Object.values(result.current.shown).every((v) => v === undefined)).toBe(true);
    act(() => { vi.advanceTimersByTime(2400); });
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.shown).toEqual(finals);
    expect(result.current.done).toBe(true);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('B speed 3: 4 seats finish in 1.4s; skipAll finishes at once', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useReveal({ stage, style: 'B', speed: 3, onDone }));
    act(() => { vi.advanceTimersByTime(360); });
    expect(result.current.shown['u0-0-s0']).toBe('가온');
    expect(result.current.shown['u0-0-s1']).toBeUndefined();
    expect(result.current.rolling).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(result.current.shown).toEqual(finals);
    expect(onDone).toHaveBeenCalledTimes(1);

    const onDone2 = vi.fn();
    const r2 = renderHook(() => useReveal({ stage, style: 'B', speed: 1, onDone: onDone2 }));
    act(() => { vi.advanceTimersByTime(1300); });
    act(() => { r2.result.current.skipAll(); });
    expect(r2.result.current.shown).toEqual(finals);
    expect(onDone2).toHaveBeenCalledTimes(1);
  });

  it('C: starts hidden, flip reveals one seat, all flipped -> onDone', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useReveal({ stage, style: 'C', speed: 2, onDone }));
    expect(Object.values(result.current.shown).every((v) => v === undefined)).toBe(true);
    act(() => { result.current.flip('u0-1-s0'); });
    expect(result.current.shown['u0-1-s0']).toBe('다온');
    expect(result.current.shown['u0-0-s0']).toBeUndefined();
    expect(onDone).not.toHaveBeenCalled();
    act(() => { ['u0-0-s0', 'u0-0-s1', 'u0-1-s1'].forEach((s) => result.current.flip(s)); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('empty seats are null and ignored', () => {
    const withEmpty: StageView = { ...stage, units: [{ ...stage.units[0], seats: [stage.units[0].seats[0], { seatId: 'u0-0-s1', name: null }] }] };
    const onDone = vi.fn();
    const { result } = renderHook(() => useReveal({ stage: withEmpty, style: 'C', speed: 2, onDone }));
    expect(result.current.shown['u0-0-s1']).toBeNull();
    act(() => { result.current.flip('u0-0-s0'); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('RevealStage', () => {
  it('C: clicking a card flips it and reports onFlip', () => {
    const onFlip = vi.fn();
    const { getByTestId } = render(<RevealStage stage={stage} style="C" speed={2} onDone={() => {}} onFlip={onFlip} />);
    expect(getByTestId('seat-u0-0-s0')).toHaveTextContent('?');
    fireEvent.click(getByTestId('seat-u0-0-s0'));
    expect(getByTestId('seat-u0-0-s0')).toHaveTextContent('가온');
    expect(onFlip).toHaveBeenCalledWith('u0-0-s0');
  });

  it('A: shows final names after 2.5s', () => {
    const { getByTestId } = render(<RevealStage stage={stage} style="A" speed={2} onDone={() => {}} />);
    act(() => { vi.advanceTimersByTime(2600); });
    expect(getByTestId('seat-u0-1-s1')).toHaveTextContent('라희');
  });
});
