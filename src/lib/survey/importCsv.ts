import type { ClassRecord } from '@/lib/db/repo';
import { parseCsv } from './csv';
import { Q, studentLabel } from './questions';
import type { Score, SurveyResponse, SurveyResult } from './types';

export interface ImportPreview {
  ok: boolean;
  error?: string;
  missing?: string[];
  result?: Omit<SurveyResult, 'id' | 'name' | 'importedAt'>;
  responded: string[];
  notResponded: string[];
  unmatched: string[];
  duplicates: string[];
}

const NOT_APP_CSV = '이 앱에서 만든 설문의 CSV가 아니에요';

function toScore(v: string | undefined): Score | null {
  const t = (v ?? '').trim();
  return t === '1' || t === '2' || t === '3' || t === '4' || t === '5' ? (Number(t) as Score) : null;
}

export function importSurveyCsv(text: string, cls: ClassRecord): ImportPreview {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const col = (title: string) => header.findIndex((h) => h.startsWith(title));
  // Grid columns: start with Q.ratings and end with "[label]".
  const gridCols: { idx: number; label: string }[] = [];
  header.forEach((h, idx) => {
    if (!h.startsWith(Q.ratings)) return;
    const m = /\[([^\]]*)\]\s*$/.exec(h);
    if (m) gridCols.push({ idx, label: m[1] });
  });

  const missing: string[] = [];
  for (const [k, title] of Object.entries(Q)) {
    if (k === 'ratings') {
      if (gridCols.length === 0) missing.push(title);
    } else if (col(title) < 0) {
      missing.push(title);
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: NOT_APP_CSV,
      missing,
      responded: [],
      notResponded: [],
      unmatched: [],
      duplicates: [],
    };
  }

  const byLabel = new Map(cls.students.map((s) => [studentLabel(s), s.id]));
  const idx = {
    name: col(Q.name),
    best: col(Q.best),
    wantCloser: col(Q.wantCloser),
    playWith: col(Q.playWith),
    helpFrom: col(Q.helpFrom),
    alone: col(Q.alone),
    hard: col(Q.hard),
    hardReason: col(Q.hardReason),
    happy: col(Q.happy),
    schoolFun: col(Q.schoolFun),
    family: col(Q.family),
    toTeacher: col(Q.toTeacher),
  };

  const responses: Record<string, SurveyResponse> = {};
  const unmatched: string[] = [];
  const duplicates: string[] = [];

  for (const r of rows.slice(1)) {
    if (r.every((c) => c.trim() === '')) continue;
    const label = (r[idx.name] ?? '').trim();
    const sid = byLabel.get(label);
    if (!sid) {
      if (label !== '' && !unmatched.includes(label)) unmatched.push(label);
      continue;
    }
    if (responses[sid] && !duplicates.includes(sid)) duplicates.push(sid);

    const checks = (i: number): string[] => {
      const out: string[] = [];
      for (const part of (r[i] ?? '').split(',')) {
        const t = part.trim();
        const id = t ? byLabel.get(t) : undefined;
        if (id && id !== sid && !out.includes(id)) out.push(id);
      }
      return out;
    };
    const ratings: Record<string, Score> = {};
    for (const g of gridCols) {
      const tid = byLabel.get(g.label);
      const score = toScore(r[g.idx]);
      if (tid && tid !== sid && score) ratings[tid] = score;
    }
    responses[sid] = {
      studentId: sid,
      submittedAt: r[0] ?? '',
      ratings,
      best: checks(idx.best),
      wantCloser: checks(idx.wantCloser),
      playWith: checks(idx.playWith),
      helpFrom: checks(idx.helpFrom),
      hard: checks(idx.hard),
      hardReason: r[idx.hardReason] ?? '',
      toTeacher: r[idx.toTeacher] ?? '',
      alone: toScore(r[idx.alone]),
      happy: toScore(r[idx.happy]),
      schoolFun: toScore(r[idx.schoolFun]),
      family: toScore(r[idx.family]),
    };
  }

  return {
    ok: true,
    result: {
      classId: cls.id,
      labels: Object.fromEntries(cls.students.map((s) => [s.id, studentLabel(s)])),
      responses,
      dismissed: [],
      parentInclude: {},
    },
    responded: Object.keys(responses),
    notResponded: cls.students.map((s) => s.id).filter((id) => !responses[id]),
    unmatched,
    duplicates,
  };
}
