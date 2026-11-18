import type { Assignment, LayoutMode, SeatId } from '@/lib/seating/types';
import { buildUnits } from '@/lib/seating/layout';
import { displayName } from '@/lib/roster';
import type { ClassRecord, RevealStyle } from '@/lib/db/repo';

export const CHANNEL_NAME = 'seating-app';

/** Names only. Constraint information must never appear in these types. */
export interface SeatView { seatId: SeatId; name: string | null }
export interface UnitView { id: string; row: number; col: number; seats: SeatView[] }
export interface StageView { className: string; mode: LayoutMode; rows: number; cols: number; units: UnitView[] }
export type IdleView = { kind: 'title'; className: string; date: string } | { kind: 'chart'; stage: StageView };
export type ToPresenter =
  | { type: 'idle'; view: IdleView }
  | { type: 'reveal'; revealId: string; style: RevealStyle; stage: StageView; speed: 1 | 2 | 3 }
  | { type: 'control'; revealId: string; action: 'skip-all' | 'flip'; seatId?: SeatId }
  | { type: 'speed'; revealId: string; speed: 1 | 2 | 3 };
export type ToTeacher =
  | { type: 'hello' }
  | { type: 'flipped'; revealId: string; seatId: SeatId }
  | { type: 'done'; revealId: string };

function open<In, Out>(onMessage: (m: In) => void): { send(m: Out): void; close(): void } {
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = (e: MessageEvent) => onMessage(e.data as In);
  return {
    send: (m) => ch.postMessage(m),
    close: () => { ch.onmessage = null; ch.close(); },
  };
}

export function openTeacherChannel(onMessage: (m: ToTeacher) => void): { send(m: ToPresenter): void; close(): void } {
  return open<ToTeacher, ToPresenter>(onMessage);
}

export function openPresenterChannel(onMessage: (m: ToPresenter) => void): { send(m: ToTeacher): void; close(): void } {
  return open<ToPresenter, ToTeacher>(onMessage);
}

export function toStageView(cls: ClassRecord, assignment: Assignment): StageView {
  const byId = new Map(cls.students.map((s) => [s.id, s]));
  const units: UnitView[] = buildUnits(cls.layout).map((u) => ({
    id: u.id,
    row: u.row,
    col: u.col,
    seats: u.seats.map((seatId) => {
      const sid = assignment[seatId];
      const st = sid ? byId.get(sid) : undefined;
      return { seatId, name: st ? displayName(st, cls.students) : null };
    }),
  }));
  return { className: cls.name, mode: cls.layout.mode, rows: cls.layout.rows, cols: cls.layout.cols, units };
}
