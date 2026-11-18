import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DrawPanel, type TeacherChannel } from '@/components/teacher/DrawPanel';
import type { ToPresenter, ToTeacher } from '@/lib/channel';
import { addSeatingRecord, listSeatingRecords, saveClass, wipeAll, type ClassRecord } from '@/lib/db/repo';
import type { PairConstraint } from '@/lib/seating/types';

function fakeChannel() {
  let listener: ((m: ToTeacher) => void) | undefined;
  const send = vi.fn<(m: ToPresenter) => void>();
  const channel: TeacherChannel = {
    send,
    subscribe: (fn) => {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
  };
  return { channel, send, emit: (m: ToTeacher) => act(() => listener?.(m)) };
}

const make = (constraints: PairConstraint[] = []): ClassRecord => ({
  id: 'c1',
  name: '6학년 1반',
  students: ['가온', '나래', '다온', '라희'].map((name, i) => ({ id: `s${i}`, number: i + 1, name, gender: null })),
  layout: { mode: 'pair', rows: 1, cols: 2, groupSize: 4, disabledSeats: [] },
  constraints,
  genderRule: false,
  lastRevealStyle: 'A',
  createdAt: '2026-01-01T00:00:00.000Z',
});

function Harness({ initial, channel }: { initial: ClassRecord; channel: TeacherChannel }) {
  const [cls, setCls] = useState(initial);
  return <DrawPanel cls={cls} channel={channel} onChange={setCls} />;
}

async function renderPanel(cls: ClassRecord) {
  await saveClass(cls);
  const fake = fakeChannel();
  render(<Harness initial={cls} channel={fake.channel} />);
  // Wait for the initial "last confirmed record" lookup to settle.
  await screen.findByRole('button', { name: '마지막 확정 좌석표' });
  return fake;
}

const sentOfType = (send: ReturnType<typeof fakeChannel>['send'], type: ToPresenter['type']) =>
  send.mock.calls.map(([m]) => m).filter((m) => m.type === type);

async function drawAndFinish() {
  fireEvent.click(screen.getByRole('button', { name: '뽑기 시작' }));
  fireEvent.click(screen.getByRole('button', { name: '나머지 바로 공개' }));
  await screen.findByRole('button', { name: '이대로 확정' });
}

beforeEach(async () => {
  await wipeAll();
});

describe('DrawPanel', () => {
  it('impossible constraints in pair mode: shows reasons and sends nothing to the presenter', async () => {
    const { send } = await renderPanel(
      make([
        { id: 'k1', a: 's0', b: 's1', kind: 'must-pair' },
        { id: 'k2', a: 's0', b: 's1', kind: 'avoid-pair' },
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: '뽑기 시작' }));
    expect(screen.getByRole('alert')).toHaveTextContent('떨어져야 하는 조건');
    expect(send).not.toHaveBeenCalled();
  });

  it('a successful draw sends exactly one reveal without constraint data', async () => {
    const { send } = await renderPanel(make([{ id: 'k1', a: 's0', b: 's1', kind: 'avoid-pair' }]));
    fireEvent.click(screen.getByRole('button', { name: '뽑기 시작' }));
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.type).toBe('reveal');
    expect(JSON.stringify(msg)).not.toMatch(/constraint|avoid|must|violation|kind|위반|금지/);
    expect(screen.getByText('조건 위반 0건')).toBeInTheDocument();
  });

  it('hello during a reveal re-sends the same reveal (same revealId)', async () => {
    const { send, emit } = await renderPanel(make());
    fireEvent.click(screen.getByRole('button', { name: '뽑기 시작' }));
    const first = send.mock.calls[0][0];
    emit({ type: 'hello' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual(first);
  });

  it('flips from the presenter are mirrored in the preview (style C)', async () => {
    const { send, emit } = await renderPanel({ ...make(), lastRevealStyle: 'C' });
    fireEvent.click(screen.getByRole('button', { name: '뽑기 시작' }));
    const msg = send.mock.calls[0][0];
    if (msg.type !== 'reveal') throw new Error('expected reveal');
    const seat = msg.stage.units[0].seats[0];
    expect(screen.getByTestId(`seat-${seat.seatId}`)).toHaveTextContent('?');
    emit({ type: 'flipped', revealId: msg.revealId, seatId: seat.seatId });
    expect(screen.getByTestId(`seat-${seat.seatId}`)).toHaveTextContent(seat.name!);
  });

  it('a card click in the preview sends control:flip (style C)', async () => {
    const { send } = await renderPanel({ ...make(), lastRevealStyle: 'C' });
    fireEvent.click(screen.getByRole('button', { name: '뽑기 시작' }));
    const msg = send.mock.calls[0][0];
    if (msg.type !== 'reveal') throw new Error('expected reveal');
    const seatId = msg.stage.units[0].seats[1].seatId;
    fireEvent.click(screen.getByTestId(`seat-${seatId}`));
    expect(send).toHaveBeenLastCalledWith({ type: 'control', revealId: msg.revealId, action: 'flip', seatId });
  });

  it('confirm saves one record and sends idle chart', async () => {
    const { send } = await renderPanel(make());
    await drawAndFinish();
    fireEvent.click(screen.getByRole('button', { name: '이대로 확정' }));
    await waitFor(async () => expect(await listSeatingRecords('c1')).toHaveLength(1));
    await waitFor(() => {
      const last = send.mock.calls.at(-1)![0];
      expect(last.type === 'idle' && last.view.kind === 'chart').toBe(true);
    });
  });

  it('warns when a swap puts an avoid-pair together, without blocking', async () => {
    const { send } = await renderPanel(make([{ id: 'k1', a: 's0', b: 's1', kind: 'avoid-pair' }]));
    await drawAndFinish();
    const msg = send.mock.calls[0][0];
    if (msg.type !== 'reveal') throw new Error('expected reveal');
    const seats = msg.stage.units.flatMap((u) => u.seats.map((s) => ({ ...s, unit: u.id })));
    const gaon = seats.find((s) => s.name === '가온')!;
    const narae = seats.find((s) => s.name === '나래')!;
    const mate = seats.find((s) => s.unit === gaon.unit && s.seatId !== gaon.seatId)!;
    expect(screen.queryByText(/짝 금지 조건과 겹쳐요/)).toBeNull();
    fireEvent.click(screen.getByTestId(`seat-${narae.seatId}`));
    fireEvent.click(screen.getByTestId(`seat-${mate.seatId}`));
    expect(screen.getByText('⚠ 가온·나래: 짝 금지 조건과 겹쳐요')).toBeInTheDocument();
    expect(screen.getByTestId(`seat-${mate.seatId}`)).toHaveTextContent('나래');
    // The presenter only ever gets names, and only on confirm.
    for (const [m] of send.mock.calls) expect(JSON.stringify(m)).not.toMatch(/constraint|avoid|위반|금지/);
  });

  it('a swap before confirming sends nothing to the presenter; confirm sends the swapped chart', async () => {
    const { send } = await renderPanel(make());
    await drawAndFinish();
    const msg = send.mock.calls[0][0];
    if (msg.type !== 'reveal') throw new Error('expected reveal');
    const [a, b] = msg.stage.units[0].seats;
    const sentBefore = send.mock.calls.length;
    fireEvent.click(screen.getByTestId(`seat-${a.seatId}`));
    fireEvent.click(screen.getByTestId(`seat-${b.seatId}`));
    expect(screen.getByTestId(`seat-${a.seatId}`)).toHaveTextContent(b.name!);
    expect(send.mock.calls.length).toBe(sentBefore);
    fireEvent.click(screen.getByRole('button', { name: '이대로 확정' }));
    await waitFor(() => expect(send.mock.calls.length).toBe(sentBefore + 1));
    const last = send.mock.calls.at(-1)![0];
    if (last.type !== 'idle' || last.view.kind !== 'chart') throw new Error('expected idle chart');
    expect(last.view.stage.units[0].seats.map((x) => x.name)).toEqual([b.name, a.name]);
  });

  it('after confirming, a swap updates the record but reaches the presenter only via 발표 창에 반영', async () => {
    const { send } = await renderPanel(make());
    await drawAndFinish();
    fireEvent.click(screen.getByRole('button', { name: '이대로 확정' }));
    const pushBtn = await screen.findByRole('button', { name: '발표 창에 반영' });
    expect(pushBtn).toBeDisabled();
    const msg = send.mock.calls[0][0];
    if (msg.type !== 'reveal') throw new Error('expected reveal');
    const [a, b] = msg.stage.units[0].seats;
    const sentBefore = send.mock.calls.length;
    fireEvent.click(screen.getByTestId(`seat-${a.seatId}`));
    fireEvent.click(screen.getByTestId(`seat-${b.seatId}`));
    await waitFor(async () => {
      const [rec] = await listSeatingRecords('c1');
      expect(rec.studentNames[rec.assignment[a.seatId]!]).toBe(b.name);
    });
    expect(send.mock.calls.length).toBe(sentBefore);
    expect(pushBtn).toBeEnabled();
    fireEvent.click(pushBtn);
    expect(send.mock.calls.length).toBe(sentBefore + 1);
    const last = send.mock.calls.at(-1)![0];
    if (last.type !== 'idle' || last.view.kind !== 'chart') throw new Error('expected idle chart');
    expect(last.view.stage.units[0].seats.map((x) => x.name)).toEqual([b.name, a.name]);
    expect(pushBtn).toBeDisabled();
  });

  it('a roster change after drawing blocks confirming until a new draw', async () => {
    await saveClass(make());
    const fake = fakeChannel();
    const { rerender } = render(<DrawPanel cls={make()} channel={fake.channel} />);
    await screen.findByRole('button', { name: '마지막 확정 좌석표' });
    await drawAndFinish();
    expect(screen.getByRole('button', { name: '이대로 확정' })).toBeEnabled();
    expect(screen.queryByText('명단이 바뀌었어요. 다시 뽑아 주세요')).toBeNull();
    const removed = { ...make(), students: make().students.slice(0, 3) };
    rerender(<DrawPanel cls={removed} channel={fake.channel} />);
    expect(screen.getByText('명단이 바뀌었어요. 다시 뽑아 주세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이대로 확정' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '이대로 확정' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(await listSeatingRecords('c1')).toHaveLength(0);
    // A renamed student is still the same student: no block.
    const renamed = { ...make(), students: make().students.map((x, i) => (i === 0 ? { ...x, name: '하늘' } : x)) };
    rerender(<DrawPanel cls={renamed} channel={fake.channel} />);
    expect(screen.queryByText('명단이 바뀌었어요. 다시 뽑아 주세요')).toBeNull();
    // A new draw with the changed roster can be confirmed again.
    rerender(<DrawPanel cls={removed} channel={fake.channel} />);
    fireEvent.click(screen.getByRole('button', { name: '다시 뽑기' }));
    fireEvent.click(screen.getByRole('button', { name: '나머지 바로 공개' }));
    expect(await screen.findByRole('button', { name: '이대로 확정' })).toBeEnabled();
    expect(screen.queryByText('명단이 바뀌었어요. 다시 뽑아 주세요')).toBeNull();
  });

  it('마지막 확정 좌석표 uses the names saved with the record, not the current roster', async () => {
    const cls = make();
    await addSeatingRecord({
      id: 'r1',
      classId: 'c1',
      createdAt: '2026-01-02T00:00:00.000Z',
      layout: cls.layout,
      assignment: { 'u0-0-s0': 's0', 'u0-0-s1': 'gone' },
      studentNames: { s0: '예전이름', gone: '전학간학생' },
    });
    const { send } = await renderPanel(cls);
    fireEvent.click(screen.getByRole('button', { name: '마지막 확정 좌석표' }));
    const m = send.mock.calls.at(-1)![0];
    if (m.type !== 'idle' || m.view.kind !== 'chart') throw new Error('expected idle chart');
    expect(m.view.stage.units[0].seats.map((x) => x.name)).toEqual(['예전이름', '전학간학생']);
  });

  it('idle choice sends the class title immediately', async () => {
    const { send } = await renderPanel(make());
    fireEvent.click(screen.getByRole('button', { name: '학급 이름' }));
    const m = send.mock.calls[0][0];
    expect(m.type === 'idle' && m.view.kind === 'title' && m.view.className).toBe('6학년 1반');
  });

  it('opens the presenter window synchronously within the click, even when screen details are pending', async () => {
    await renderPanel(make());
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const pending = new Promise<never>(() => {});
    const w = window as Window & { getScreenDetails?: () => Promise<never> };
    w.getScreenDetails = () => pending;
    try {
      fireEvent.click(screen.getByRole('button', { name: '발표 창 열기' }));
      expect(open).toHaveBeenCalledTimes(1);
      expect(open.mock.calls[0][0]).toMatch(/present\/$/);
      expect(await screen.findByRole('alert')).toHaveTextContent('팝업이 차단됐어요');
    } finally {
      delete w.getScreenDetails;
      open.mockRestore();
    }
  });

  it('moves the opened window to the other screen when permission is granted', async () => {
    await renderPanel(make());
    const win = { moveTo: vi.fn(), resizeTo: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(win);
    const w = window as Window & { getScreenDetails?: () => Promise<unknown> };
    const main = { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1040 };
    const tv = { availLeft: 1920, availTop: 0, availWidth: 3840, availHeight: 2160 };
    w.getScreenDetails = () => Promise.resolve({ screens: [main, tv], currentScreen: main });
    const perms = { query: vi.fn().mockResolvedValue({ state: 'granted' }) };
    Object.defineProperty(navigator, 'permissions', { value: perms, configurable: true });
    try {
      fireEvent.click(screen.getByRole('button', { name: '발표 창 열기' }));
      await waitFor(() => expect(win.moveTo).toHaveBeenCalledWith(1920, 0));
      expect(win.resizeTo).toHaveBeenCalledWith(3840, 2160);
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      delete w.getScreenDetails;
      delete (navigator as { permissions?: unknown }).permissions;
      open.mockRestore();
    }
  });

  it('remembers the chosen reveal style', async () => {
    const spy = vi.fn();
    await saveClass(make());
    const { channel } = fakeChannel();
    render(<DrawPanel cls={make()} channel={channel} onChange={spy} />);
    await screen.findByRole('button', { name: '마지막 확정 좌석표' });
    fireEvent.click(screen.getByRole('button', { name: /카드 뒤집기/ }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ lastRevealStyle: 'C' }));
  });
});
