import type { Gender, Student } from './seating/types';

export function displayName(s: Student, all: Student[]): string {
  const dup = all.some((o) => o.id !== s.id && o.name === s.name);
  return dup ? `${s.name}(${s.number})` : s.name;
}

export interface ParsedRosterRow { number: number; name: string; gender: Gender }

function parseGender(v: string | undefined): Gender {
  const t = (v ?? '').trim();
  if (['남', '남자', 'M', 'm'].includes(t)) return 'M';
  if (['여', '여자', 'F', 'f'].includes(t)) return 'F';
  return null;
}

/** Parses pasted roster text (tab or comma separated). One column = names only. */
export function parseRosterText(text: string): { rows: ParsedRosterRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const rows: ParsedRosterRow[] = [];
  const errors: string[] = [];
  if (lines.length > 0 && lines[0].includes('번호') && lines[0].includes('이름')) lines.shift();
  lines.forEach((line, i) => {
    const cols = line.split(/\t|,/).map((c) => c.trim());
    if (cols.length === 1) {
      rows.push({ number: i + 1, name: cols[0], gender: null });
      return;
    }
    const num = Number(cols[0]);
    if (!/^\d+$/.test(cols[0]) || num < 1) {
      errors.push(`${i + 1}번째 줄: 번호를 읽을 수 없어요 (${cols[0]})`);
      return;
    }
    if (!cols[1]) {
      errors.push(`${i + 1}번째 줄: 이름이 비어 있어요`);
      return;
    }
    rows.push({ number: num, name: cols[1], gender: parseGender(cols[2]) });
  });
  return { rows, errors };
}
