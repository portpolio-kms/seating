import type { Assignment, LayoutMode, SeatId } from '@/lib/seating/types';
import { buildUnits } from '@/lib/seating/layout';
import { displayName } from '@/lib/roster';
import type { ClassRecord, RevealStyle, SeatingRecord } from '@/lib/db/repo';

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

const PRESENTER_TYPES: ReadonlySet<string> = new Set<ToPresenter['type']>(['idle', 'reveal', 'control', 'speed']);
const TEACHER_TYPES: ReadonlySet<string> = new Set<ToTeacher['type']>(['hello', 'flipped', 'done']);

/**
 * True when `data` carries one of `known` as its string `type`. GitHub Pages serves every project of
 * an account from one origin, so another app there could post on a channel with the same name.
 */
export function hasKnownType(data: unknown, known: ReadonlySet<string>): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const t = (data as { type?: unknown }).type;
  return typeof t === 'string' && known.has(t);
}

function open<In, Out>(
  known: ReadonlySet<string>,
  onMessage: (m: In) => void,
): { send(m: Out): void; close(): void } {
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = (e: MessageEvent) => {
    if (hasKnownType(e.data, known)) onMessage(e.data as In);
  };
  return {
    send: (m) => ch.postMessage(m),
    close: () => { ch.onmessage = null; ch.close(); },
  };
}

export function openTeacherChannel(onMessage: (m: ToTeacher) => void): { send(m: ToPresenter): void; close(): void } {
  return open<ToTeacher, ToPresenter>(TEACHER_TYPES, onMessage);
}

export function openPresenterChannel(onMessage: (m: ToPresenter) => void): { send(m: ToTeacher): void; close(): void } {
  return open<ToPresenter, ToTeacher>(PRESENTER_TYPES, onMessage);
}

/** Chart of a saved record, using the names saved at confirmation time (not the current roster). */
export function recordToStageView(className: string, rec: SeatingRecord): StageView {
  const units: UnitView[] = buildUnits(rec.layout).map((u) => ({
    id: u.id,
    row: u.row,
    col: u.col,
    seats: u.seats.map((seatId) => {
      const sid = rec.assignment[seatId];
      return { seatId, name: sid ? (rec.studentNames[sid] ?? null) : null };
    }),
  }));
  return { className, mode: rec.layout.mode, rows: rec.layout.rows, cols: rec.layout.cols, units };
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
