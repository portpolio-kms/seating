'use client';

import type { StageView, UnitView } from '@/lib/channel';
import type { SeatId } from '@/lib/seating/types';

export interface SeatingChartProps {
  stage: StageView;
  orientation?: 'front' | 'teacher';
  size?: 'tv' | 'print' | 'small';
  onSeatClick?: (seatId: SeatId) => void;
  selectedSeat?: SeatId;
  highlightSeats?: SeatId[];
  /** Seats shown as switched off (used by the layout editor, where disabled seats are still rendered). */
  disabledSeats?: SeatId[];
}

const sizeClass = {
  tv: { name: 'text-[2rem] leading-tight', seat: 'min-h-16 min-w-32 px-3 py-2', gap: 'gap-6' },
  small: { name: 'text-sm', seat: 'min-h-8 min-w-14 px-1 py-0.5', gap: 'gap-2' },
  print: { name: 'text-base', seat: 'min-h-10 min-w-20 px-2 py-1', gap: 'gap-3' },
} as const;

export function SeatingChart({
  stage,
  orientation = 'front',
  size = 'small',
  onSeatClick,
  selectedSeat,
  highlightSeats = [],
  disabledSeats = [],
}: SeatingChartProps) {
  const teacher = orientation === 'teacher';
  const s = sizeClass[size];
  const print = size === 'print';
  const highlight = new Set(highlightSeats);
  const disabled = new Set(disabledSeats);

  const board = (
    <div
      className={`rounded text-center font-bold tracking-widest ${
        print ? 'border border-black text-black' : 'bg-emerald-800 text-white'
      } ${size === 'tv' ? 'py-3 text-3xl' : 'py-1 text-sm'}`}
    >
      칠판
    </div>
  );

  const renderUnit = (u: UnitView) => {
    const seats = teacher ? [...u.seats].reverse() : u.seats;
    const row = teacher ? stage.rows - u.row : u.row + 1;
    const col = teacher ? stage.cols - u.col : u.col + 1;
    return (
      <div
        key={u.id}
        data-testid={`unit-${u.id}`}
        style={{ gridRow: row, gridColumn: col }}
        className={`grid grid-cols-2 gap-1 rounded-lg p-1 ${print ? 'border border-black' : 'bg-slate-200'}`}
      >
        {seats.map((seat) => {
          const isDisabled = disabled.has(seat.seatId);
          const color = print
            ? 'border border-black bg-white text-black'
            : isDisabled
              ? 'border border-dashed border-slate-400 bg-slate-100 text-slate-400 line-through'
              : selectedSeat === seat.seatId
                ? 'bg-blue-600 text-white'
                : highlight.has(seat.seatId)
                  ? 'bg-amber-200 text-slate-900 ring-2 ring-amber-500'
                  : 'bg-white text-slate-900';
          const cls = `flex items-center justify-center rounded text-center font-semibold ${s.seat} ${s.name} ${color}`;
          const label = isDisabled ? '꺼짐' : (seat.name ?? '');
          return onSeatClick ? (
            <button
              key={seat.seatId}
              type="button"
              data-testid={`seat-${seat.seatId}`}
              className={cls}
              onClick={() => onSeatClick(seat.seatId)}
            >
              {label}
            </button>
          ) : (
            <div key={seat.seatId} data-testid={`seat-${seat.seatId}`} className={cls}>
              {label}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`flex flex-col ${s.gap} ${print ? 'bg-white text-black' : ''}`}>
      {!teacher && board}
      <div
        className={`grid justify-center ${s.gap}`}
        style={{ gridTemplateColumns: `repeat(${stage.cols}, max-content)` }}
      >
        {stage.units.map(renderUnit)}
      </div>
      {teacher && board}
    </div>
  );
}
