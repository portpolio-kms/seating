import type { Student } from '@/lib/seating/types';
import type { ParentInclude } from './types';

// Apps Script uses each value verbatim as the question title; the parser matches
// columns by startsWith(value). Keep these strings in sync with the sheet headers.
export const Q = {
  name: '1. 내 이름',
  ratings: '2. 친구별 친밀도',
  best: '3. 가장 친한 친구',
  wantCloser: '4. 더 친해지고 싶은 친구',
  playWith: '5. 쉬는 시간에 주로 같이 노는 친구',
  helpFrom: '6. 어려울 때 도움을 청할 수 있는 친구',
  alone: '7. 쉬는 시간에 혼자 있을 때가 있다',
  hard: '8. 지금 함께 있기 힘든 친구',
  hardReason: '8-1. 그 이유',
  happy: '9. 요즘 나는 행복하다',
  schoolFun: '10. 학교생활이 즐겁다',
  family: '11. 우리 가족과 지내는 것이 행복하다',
  toTeacher: '12. 선생님께 하고 싶은 말이나 고민',
} as const;

export function studentLabel(s: Pick<Student, 'number' | 'name'>): string {
  return `${s.number}. ${s.name}`;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export const EMPTY_INCLUDE: ParentInclude = {
  ownHardReason: false,
  toTeacher: false,
  hardCount: false,
};
