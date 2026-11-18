'use client';

import { SeatingChart } from '@/components/SeatingChart';
import type { StageView } from '@/lib/channel';
import type { ClassRecord } from '@/lib/db/repo';
import { buildUnits, validateLayout } from '@/lib/seating/layout';
import type { Layout, SeatId } from '@/lib/seating/types';

const field = 'rounded border border-slate-300 px-2 py-1';

/** Drops disabled seats that no longer exist in the (possibly resized) layout. */
function pruned(layout: Layout): Layout {
  const all = new Set(buildUnits({ ...layout, disabledSeats: [] }).flatMap((u) => u.seats));
  return { ...layout, disabledSeats: layout.disabledSeats.filter((s) => all.has(s)) };
}

export function LayoutEditor({ cls, onChange }: { cls: ClassRecord; onChange: (c: ClassRecord) => void }) {
  const layout = cls.layout;
  const update = (patch: Partial<Layout>) => onChange({ ...cls, layout: pruned({ ...layout, ...patch }) });
  const clamp = (v: string) => Math.min(10, Math.max(1, Math.round(Number(v)) || 1));

  const stage: StageView = {
    className: cls.name,
    mode: layout.mode,
    rows: layout.rows,
    cols: layout.cols,
    units: buildUnits({ ...layout, disabledSeats: [] }).map((u) => ({
      id: u.id,
      row: u.row,
      col: u.col,
      seats: u.seats.map((seatId) => ({ seatId, name: null })),
    })),
  };

  const toggle = (seatId: SeatId) => {
    const off = layout.disabledSeats.includes(seatId);
    update({ disabledSeats: off ? layout.disabledSeats.filter((s) => s !== seatId) : [...layout.disabledSeats, seatId] });
  };

  const problems = validateLayout(layout, cls.students.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          배치 방식
          <select
            aria-label="배치 방식"
            className={field}
            value={layout.mode}
            onChange={(e) => update({ mode: e.target.value as Layout['mode'] })}
          >
            <option value="pair">짝</option>
            <option value="group">모둠</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          줄
          <input
            aria-label="줄"
            type="number"
            min={1}
            max={10}
            className={`${field} w-16`}
            value={layout.rows}
            onChange={(e) => update({ rows: clamp(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2">
          분단
          <input
            aria-label="분단"
            type="number"
            min={1}
            max={10}
            className={`${field} w-16`}
            value={layout.cols}
            onChange={(e) => update({ cols: clamp(e.target.value) })}
          />
        </label>
        {layout.mode === 'group' && (
          <label className="flex items-center gap-2">
            모둠 인원
            <select
              aria-label="모둠 인원"
              className={field}
              value={layout.groupSize}
              onChange={(e) => update({ groupSize: Number(e.target.value) as 4 | 6 })}
            >
              <option value={4}>4명</option>
              <option value={6}>6명</option>
            </select>
          </label>
        )}
      </div>

      <p className="text-sm text-slate-500">자리를 누르면 끄거나 켤 수 있어요.</p>
      <SeatingChart stage={stage} size="small" onSeatClick={toggle} disabledSeats={layout.disabledSeats} />

      {problems.length > 0 ? (
        <ul role="alert" className="space-y-1 text-red-600">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          onClick={() => onChange({ ...cls, layout: pruned(layout) })}
        >
          저장
        </button>
      )}
    </div>
  );
}
