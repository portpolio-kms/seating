'use client';

import type { ClassRecord } from '@/lib/db/repo';
import { displayName } from '@/lib/roster';
import { canAddConstraint } from '@/lib/seating/constraints';
import type { ConstraintKind } from '@/lib/seating/types';
import { analyzeSurvey, buildRadar, buildSuggestions } from '@/lib/survey/analyze';
import type { SurveyResult } from '@/lib/survey/types';

interface Props {
  cls: ClassRecord;
  survey: SurveyResult;
  /** Persists a changed class (new constraint). */
  onChange: (c: ClassRecord) => void;
  /** Persists a changed survey (RelationsPanel's updateSurvey saves it). */
  onSurveyChange: (s: SurveyResult) => void;
  openCard: (studentId: string) => void;
}

const LEVEL_LABEL = { high: '높음', medium: '보통' } as const;

export function RadarView({ cls, survey, onChange, onSurveyChange, openCard }: Props) {
  const metrics = analyzeSurvey(survey, cls);
  const radar = buildRadar(survey, cls, metrics);
  const byId = new Map(cls.students.map((s) => [s.id, s]));
  const name = (id: string) => {
    const s = byId.get(id);
    return s ? displayName(s, cls.students) : id;
  };
  const number = (id: string) => byId.get(id)?.number ?? 0;

  const suggestions = buildSuggestions(survey, cls)
    .filter((s) => s.status !== 'dismissed')
    .sort((x, y) => {
      const [x1, x2] = [number(x.a), number(x.b)].sort((p, q) => p - q);
      const [y1, y2] = [number(y.a), number(y.b)].sort((p, q) => p - q);
      return x1 - y1 || x2 - y2;
    });

  const add = (a: string, b: string, kind: ConstraintKind) => {
    const msg = canAddConstraint(cls.constraints, { a, b, kind });
    if (msg) {
      window.alert(msg);
      return;
    }
    onChange({ ...cls, constraints: [...cls.constraints, { id: crypto.randomUUID(), a, b, kind }] });
  };

  const dismiss = (key: string) => {
    if (survey.dismissed.includes(key)) return;
    onSurveyChange({ ...survey, dismissed: [...survey.dismissed, key] });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-bold">관심 학생</h3>
        {radar.items.length === 0 ? (
          <p className="text-sm text-slate-600">지금 기준으로 먼저 챙길 학생이 없어요</p>
        ) : (
          <ul aria-label="관심 학생 목록" className="space-y-2">
            {radar.items.map((it) => (
              <li key={it.studentId} className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${
                    it.level === 'high' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {LEVEL_LABEL[it.level]}
                </span>
                <button
                  type="button"
                  className="font-semibold text-blue-700 underline"
                  onClick={() => openCard(it.studentId)}
                >
                  {name(it.studentId)}
                </button>
                {it.noResponse && (
                  <span className="rounded bg-slate-200 px-2 py-0.5 text-xs">설문 미응답</span>
                )}
                <span className="text-slate-700">{it.reasons.join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="설문 미응답 학생" className="space-y-1">
        <h3 className="font-bold">설문 미응답</h3>
        {radar.notResponded.length === 0 ? (
          <p className="text-sm text-slate-600">모두 응답했어요</p>
        ) : (
          <p className="text-sm">
            {radar.notResponded.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                {name(id)}
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">쌍 조건 추천</h3>
        {suggestions.length === 0 ? (
          <p className="text-sm text-slate-600">추천할 쌍이 없어요</p>
        ) : (
          <ul aria-label="쌍 조건 추천" className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">
                  {name(s.a)} · {name(s.b)}
                </span>
                {s.mutual && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs">서로 지목</span>}
                {s.status === 'exists' ? (
                  <span className="text-slate-600">이미 설정됨</span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-0.5"
                      onClick={() => add(s.a, s.b, 'avoid-pair')}
                    >
                      짝 금지 추가
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-0.5"
                      onClick={() => add(s.a, s.b, 'avoid-group')}
                    >
                      모둠 금지 추가
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-0.5"
                      onClick={() => dismiss(s.key)}
                    >
                      넘기기
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
