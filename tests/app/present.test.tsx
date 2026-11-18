import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { StageView, ToPresenter } from '@/lib/channel';

const sent: unknown[] = [];
let handler: (m: ToPresenter) => void = () => {};
const close = vi.fn();
vi.mock('@/lib/channel', async (orig) => ({
  ...(await orig<typeof import('@/lib/channel')>()),
  openPresenterChannel: (cb: (m: ToPresenter) => void) => {
    handler = cb;
    return { send: (m: unknown) => sent.push(m), close };
  },
}));

import PresentPage from '@/app/present/page';

const stage: StageView = {
  className: '3-1', mode: 'pair', rows: 1, cols: 1,
  units: [{ id: 'u0-0', row: 0, col: 0, seats: [{ seatId: 'u0-0-s0', name: '가온' }, { seatId: 'u0-0-s1', name: '나래' }] }],
};

beforeEach(() => { vi.useFakeTimers(); sent.length = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('/present', () => {
  it('sends hello on mount and closes on unmount', () => {
    const { unmount } = render(<PresentPage />);
    expect(sent).toContainEqual({ type: 'hello' });
    unmount();
    expect(close).toHaveBeenCalled();
  });

  it('renders title view', () => {
    const { getByText } = render(<PresentPage />);
    act(() => handler({ type: 'idle', view: { kind: 'title', className: '3학년 1반', date: '2026-11-18' } }));
    expect(getByText('3학년 1반')).toBeInTheDocument();
    expect(getByText('2026-11-18')).toBeInTheDocument();
  });

  it('reveal renders names, has no button, sends done', () => {
    const { container, getByTestId } = render(<PresentPage />);
    act(() => handler({ type: 'reveal', revealId: 'r1', style: 'A', stage, speed: 2 }));
    act(() => { vi.advanceTimersByTime(2600); });
    expect(getByTestId('seat-u0-0-s0')).toHaveTextContent('가온');
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(sent).toContainEqual({ type: 'done', revealId: 'r1' });
  });

  it('control flip and skip-all are applied', () => {
    const { getByTestId } = render(<PresentPage />);
    act(() => handler({ type: 'reveal', revealId: 'r2', style: 'C', stage, speed: 2 }));
    act(() => handler({ type: 'control', revealId: 'r2', action: 'flip', seatId: 'u0-0-s1' }));
    expect(getByTestId('seat-u0-0-s1')).toHaveTextContent('나래');
    act(() => handler({ type: 'control', revealId: 'r2', action: 'skip-all' }));
    expect(getByTestId('seat-u0-0-s0')).toHaveTextContent('가온');
  });
});
