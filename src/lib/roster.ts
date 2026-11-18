import type { Student } from './seating/types';

export function displayName(s: Student, all: Student[]): string {
  const dup = all.some((o) => o.id !== s.id && o.name === s.name);
  return dup ? `${s.name}(${s.number})` : s.name;
}
