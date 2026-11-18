import type { Layout, Unit } from './types';

function seatsPerUnit(layout: Layout): number {
  return layout.mode === 'pair' ? 2 : layout.groupSize;
}

export function buildUnits(layout: Layout): Unit[] {
  const disabled = new Set(layout.disabledSeats);
  const per = seatsPerUnit(layout);
  const units: Unit[] = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const id = `u${row}-${col}`;
      const seats: string[] = [];
      for (let i = 0; i < per; i++) {
        const seat = `${id}-s${i}`;
        if (!disabled.has(seat)) seats.push(seat);
      }
      if (seats.length > 0) units.push({ id, row, col, seats });
    }
  }
  return units;
}

export function seatCount(layout: Layout): number {
  return buildUnits(layout).reduce((n, u) => n + u.seats.length, 0);
}

export function validateLayout(layout: Layout, studentCount: number): string[] {
  const seats = seatCount(layout);
  if (studentCount > seats) {
    return [`자리가 ${studentCount - seats}개 부족해요 (학생 ${studentCount}명, 자리 ${seats}개)`];
  }
  return [];
}
