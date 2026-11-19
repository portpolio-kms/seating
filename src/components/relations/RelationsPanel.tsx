'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClassRecord } from '@/lib/db/repo';
import { deleteSurvey, listSurveys, saveSurvey } from '@/lib/db/surveys';
import type { SurveyResult } from '@/lib/survey/types';
import { CounselingCard } from './CounselingCard';
import { GraphView } from './GraphView';
import { RadarView } from './RadarView';
import { SurveySetup } from './SurveySetup';
import { SurveyUpload } from './SurveyUpload';

const VIEWS = [
  { id: 'setup', label: '설문 만들기' },
  { id: 'upload', label: '결과 올리기' },
  { id: 'radar', label: '관심 학생' },
  { id: 'graph', label: '관계망' },
  { id: 'card', label: '상담 카드' },
] as const;
type View = (typeof VIEWS)[number]['id'];
/** Views that need a selected survey. */
const SURVEY_VIEWS: readonly View[] = ['radar', 'graph', 'card'];

const dateLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function RelationsPanel({ cls, onChange }: { cls: ClassRecord; onChange: (c: ClassRecord) => void }) {
  const [view, setView] = useState<View>('setup');
  const [surveys, setSurveys] = useState<SurveyResult[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewChosen = useRef(false);

  useEffect(() => {
    let alive = true;
    listSurveys(cls.id).then(
      (list) => {
        if (!alive) return;
        setSurveys(list);
        setSelectedSurveyId(list[0]?.id ?? null);
        if (list.length > 0 && !viewChosen.current) setView('upload');
      },
      () => alive && setError('설문 결과를 불러오지 못했어요.'),
    );
    return () => {
      alive = false;
    };
  }, [cls.id]);

  const survey = surveys.find((s) => s.id === selectedSurveyId) ?? null;

  const addSurvey = (s: SurveyResult) => {
    setSurveys((list) => [s, ...list.filter((x) => x.id !== s.id)]);
    setSelectedSurveyId(s.id);
  };

  /** Saves a changed survey (dismissed flags, parent view...) and updates local state. */
  const updateSurvey = useCallback(async (s: SurveyResult) => {
    setSurveys((list) => list.map((x) => (x.id === s.id ? s : x)));
    try {
      await saveSurvey(s);
      setError(null);
    } catch {
      setError('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
    }
  }, []);

  /** Moves to a student's counseling card. */
  const openCard = useCallback((studentId: string) => {
    setSelectedStudentId(studentId);
    viewChosen.current = true;
    setView('card');
  }, []);

  const remove = async (s: SurveyResult) => {
    if (!window.confirm(`'${s.name}' 설문 결과를 지울까요? 되돌릴 수 없어요.`)) return;
    try {
      await deleteSurvey(s.id);
    } catch {
      setError('지우지 못했어요.');
      return;
    }
    const rest = surveys.filter((x) => x.id !== s.id);
    setSurveys(rest);
    if (selectedSurveyId === s.id) setSelectedSurveyId(rest[0]?.id ?? null);
  };

  // Survey-dependent views fall back to the upload view when the survey is gone.
  const shown: View = !survey && SURVEY_VIEWS.includes(view) ? 'upload' : view;

  // The card shows the selected student, or the first by number when none (or a removed one) is selected.
  const cardStudentId = cls.students.some((s) => s.id === selectedStudentId)
    ? selectedStudentId
    : ([...cls.students].sort((a, b) => a.number - b.number)[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.filter((v) => !SURVEY_VIEWS.includes(v.id) || survey).map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={shown === v.id}
            className={`rounded-lg border px-3 py-1 text-sm font-semibold ${
              shown === v.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white'
            }`}
            onClick={() => {
              viewChosen.current = true;
              setView(v.id);
            }}
          >
            {v.label}
          </button>
        ))}
        {surveys.length > 0 && (
          <select
            aria-label="설문 선택"
            className="ml-auto rounded border border-slate-300 px-2 py-1"
            value={selectedSurveyId ?? ''}
            onChange={(e) => setSelectedSurveyId(e.target.value)}
          >
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({dateLabel(s.importedAt)})
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-red-800">{error}</p>}

      {shown === 'setup' && <SurveySetup cls={cls} />}
      {shown === 'radar' && survey && (
        <RadarView
          cls={cls}
          survey={survey}
          onChange={onChange}
          onSurveyChange={(s) => void updateSurvey(s)}
          openCard={openCard}
        />
      )}
      {shown === 'graph' && survey && <GraphView cls={cls} survey={survey} openCard={openCard} />}
      {shown === 'card' &&
        survey &&
        (cardStudentId ? (
          <CounselingCard
            cls={cls}
            survey={survey}
            studentId={cardStudentId}
            onSurveyChange={(s) => void updateSurvey(s)}
            onSelectStudent={setSelectedStudentId}
          />
        ) : (
          <p className="text-sm text-slate-600">먼저 학생 명단을 입력해 주세요</p>
        ))}
      {shown === 'upload' && (
        <div className="space-y-6">
          <SurveyUpload cls={cls} onSaved={addSurvey} />
          <section className="space-y-2">
            <h3 className="font-bold">올려 둔 설문</h3>
            {surveys.length === 0 ? (
              <p className="text-sm text-slate-600">먼저 결과를 올려 주세요</p>
            ) : (
              <ul className="space-y-1">
                {surveys.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 text-sm">
                    <span>
                      {s.name} · {dateLabel(s.importedAt)} · 응답 {Object.keys(s.responses).length}명
                    </span>
                    <button type="button" className="text-red-700 underline" onClick={() => void remove(s)}>
                      지우기
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
