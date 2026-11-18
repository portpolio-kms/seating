export type Gender = 'M' | 'F' | null;
export interface Student { id: string; number: number; name: string; gender: Gender }
export type LayoutMode = 'pair' | 'group';
export type SeatId = string; // 'u{row}-{col}-s{index}'
export interface Layout { mode: LayoutMode; rows: number; cols: number; groupSize: 4 | 6; disabledSeats: SeatId[] }
export interface Unit { id: string; row: number; col: number; seats: SeatId[] }
export type Assignment = Record<SeatId, string | null>; // seatId -> studentId
