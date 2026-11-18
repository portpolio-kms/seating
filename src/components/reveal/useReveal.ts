'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StageView } from '@/lib/channel';
import type { RevealStyle } from '@/lib/db/repo';
import type { SeatId } from '@/lib/seating/types';

export const A_SHUFFLE_MS = 2500;
export const B_STEP_MS = { 1: 1200, 2: 700, 3: 350 } as const;
const ROLL_TICK_MS = 80;

export interface UseRevealOpts {
  stage: StageView;
  style: RevealStyle;
  speed: 1 | 2 | 3;
  onDone: () => void;
}

export interface UseRevealResult {
  /** undefined = still hidden (or shuffling); null = empty seat. */
  shown: Record<SeatId, string | null | undefined>;
  /** Style B: the name currently rolling in the big display. */
  rolling: string | null;
  skipAll(): void;
  flip(seatId: SeatId): void;
  done: boolean;
}

export function useReveal({ stage, style, speed, onDone }: UseRevealOpts): UseRevealResult {
  // Named seats in row-major unit order, seats in order within a unit.
  const derived = (() => {
    const ord: SeatId[] = [];
    const nm: string[] = [];
    const map = new Map<SeatId, string | null>();
    const units = [...stage.units].sort((a, b) => a.row - b.row || a.col - b.col);
    for (const u of units) {
      for (const s of u.seats) {
        map.set(s.seatId, s.name);
        if (s.name !== null) { ord.push(s.seatId); nm.push(s.name); }
      }
    }
    return { order: ord, names: nm, nameOf: map };
  })();
  // Content signature: a new-but-equal stage object must not restart the reveal.
  const sig = JSON.stringify([style, [...derived.nameOf]]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { order, names, nameOf } = useMemo(() => derived, [sig]);

  const [revealed, setRevealed] = useState<ReadonlySet<SeatId>>(() => new Set());
  const [rolling, setRolling] = useState<string | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const firedRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    firedRef.current = false;
    setRevealed(new Set());
    setRolling(null);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let interval: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
      if (interval !== undefined) clearInterval(interval);
      interval = undefined;
      setRolling(null);
    };
    stopRef.current = stop;
    const add = (id: SeatId) => setRevealed((p) => (p.has(id) ? p : new Set(p).add(id)));

    if (style === 'A') {
      timers.push(setTimeout(() => { setRevealed(new Set(order)); stop(); }, A_SHUFFLE_MS));
    } else if (style === 'B' && order.length > 0) {
      const pick = () => names[Math.floor(Math.random() * names.length)];
      setRolling(pick());
      interval = setInterval(() => setRolling(pick()), ROLL_TICK_MS);
      let i = 0;
      const step = () => {
        timers.push(setTimeout(() => {
          add(order[i]);
          const landed = names[i];
          i += 1;
          if (i >= order.length) stop();
          else { setRolling(landed); step(); }
        }, B_STEP_MS[speedRef.current]));
      };
      step();
    }
    return stop;
  }, [order, names, style]);

  const done = revealed.size >= order.length && order.every((id) => revealed.has(id));

  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true;
      onDoneRef.current();
    }
  }, [done]);

  const skipAll = useCallback(() => {
    stopRef.current();
    setRevealed(new Set(order));
  }, [order]);

  const flip = useCallback((seatId: SeatId) => {
    if (nameOf.get(seatId) == null) return;
    setRevealed((p) => (p.has(seatId) ? p : new Set(p).add(seatId)));
  }, [nameOf]);

  const shown = useMemo(() => {
    const out: Record<SeatId, string | null | undefined> = {};
    nameOf.forEach((name, id) => {
      out[id] = name === null ? null : revealed.has(id) ? name : undefined;
    });
    return out;
  }, [nameOf, revealed]);

  return { shown, rolling, skipAll, flip, done };
}
