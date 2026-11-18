import type { ClassRecord, SeatingRecord } from '@/lib/db/repo';

export function makeClass(id = 'c1'): ClassRecord {
  return {
    id,
    name: '6학년 1반',
    students: [
      { id: 's1', number: 1, name: '가온', gender: 'F' },
      { id: 's2', number: 2, name: '나래', gender: 'F' },
      { id: 's3', number: 3, name: '다온', gender: 'M' },
    ],
    layout: { mode: 'pair', rows: 2, cols: 2, groupSize: 4, disabledSeats: [] },
    constraints: [
      { id: 'k1', a: 's1', b: 's2', kind: 'avoid-pair' },
      { id: 'k2', a: 's2', b: 's3', kind: 'must-pair' },
    ],
    genderRule: false,
    lastRevealStyle: 'A',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

export function makeRecord(id: string, classId: string, createdAt: string): SeatingRecord {
  return {
    id,
    classId,
    createdAt,
    layout: makeClass().layout,
    assignment: { 'u0-0-s0': 's1', 'u0-0-s1': 's2' },
    studentNames: { s1: '가온', s2: '나래' },
  };
}
