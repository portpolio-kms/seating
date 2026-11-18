'use client';

import { useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { Ref } from 'react';
import type { StageView } from '@/lib/channel';
import type { RevealStyle } from '@/lib/db/repo';
import type { SeatId } from '@/lib/seating/types';
import { SeatingChart } from '@/components/SeatingChart';
import { useReveal } from './useReveal';

export interface RevealControl { skipAll(): void; flip(seatId: SeatId): void }

export interface RevealStageProps {
  stage: StageView;
  style: RevealStyle;
  speed: 1 | 2 | 3;
  onDone: () => void;
  size?: 'tv' | 'small';
  /** Called when a card is flipped by click/touch (style C only). */
  onFlip?: (seatId: SeatId) => void;
  controlRef?: Ref<RevealControl>;
}

const SHUFFLE_TICK_MS = 90;

export function RevealStage({ stage, style, speed, onDone, size = 'small', onFlip, controlRef }: RevealStageProps) {
  const { shown, rolling, skipAll, flip, done } = useReveal({ stage, style, speed, onDone });
  useImperativeHandle(controlRef, () => ({ skipAll, flip }), [skipAll, flip]);

  const names = useMemo(
    () => stage.units.flatMap((u) => u.seats.flatMap((s) => (s.name === null ? [] : [s.name]))),
    [stage],
  );

  // Drives the shuffling names in style A.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (style !== 'A' || done) return;
    const id = setInterval(() => setTick((t) => t + 1), SHUFFLE_TICK_MS);
    return () => clearInterval(id);
  }, [style, done]);

  const view = useMemo<StageView>(() => ({
    ...stage,
    units: stage.units.map((u) => ({
      ...u,
      seats: u.seats.map((s) => {
        const v = shown[s.seatId];
        if (v !== undefined) return { seatId: s.seatId, name: v };
        if (style === 'A') return { seatId: s.seatId, name: names[Math.floor(Math.random() * names.length)] ?? '' };
        if (style === 'C') return { seatId: s.seatId, name: '?' };
        return { seatId: s.seatId, name: '·' };
      }),
    })),
    // tick is intentionally a dependency: it re-rolls the shuffled names for style A.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stage, shown, style, names, tick]);

  const seatState = useMemo(() => {
    const out: Record<SeatId, 'hidden' | 'pending'> = {};
    if (style === 'A') return out;
    for (const [id, v] of Object.entries(shown)) if (v === undefined) out[id] = style === 'C' ? 'hidden' : 'pending';
    return out;
  }, [shown, style]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (style !== 'C') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-seat-id]');
    const seatId = el?.dataset.seatId;
    if (!seatId) return;
    if (shown[seatId] !== undefined) return; // empty seat or already flipped
    flip(seatId);
    onFlip?.(seatId);
  };

  const chartSize = size === 'tv' ? 'tv' : 'small';
  return (
    <div onClick={onClick} className="flex flex-col gap-4">
      {style === 'B' && rolling !== null && !done && (
        <div className={`text-center font-extrabold text-blue-700 ${size === 'tv' ? 'text-8xl' : 'text-4xl'}`} aria-live="off">
          {rolling}
        </div>
      )}
      <SeatingChart stage={view} size={chartSize} seatState={seatState} />
    </div>
  );
}
