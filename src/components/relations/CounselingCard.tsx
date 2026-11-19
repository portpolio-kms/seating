'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { listSeatingRecords, type ClassRecord, type SeatingRecord } from '@/lib/db/repo';
import { displayName } from '@/lib/roster';
import { buildUnits } from '@/lib/seating/layout';
import type { ConstraintKind } from '@/lib/seating/types';
import { analyzeSurvey, buildRadar } from '@/lib/survey/analyze';
import { buildParentCard, containsStudentName, namesToMask, type ParentCard } from '@/lib/survey/parentView';
import { EMPTY_INCLUDE, Q, studentLabel } from '@/lib/survey/questions';
import type { ParentInclude, Score, SurveyResult } from '@/lib/survey/types';

interface Props {
  cls: ClassRecord;
  survey: SurveyResult;
  studentId: string;
  /** Persists a changed survey (RelationsPanel's updateSurvey saves it). */
  onSurveyChange: (s: SurveyResult) => void;
  onSelectStudent: (studentId: string) => void;
}

const DELETED = '(삭제된 학생)';
const NAME_WARNING = '학생 이름이 들어 있어요. 학부모 보기에서는 ○○로 가려져요';
const ISOLATED_NOTE = '참고: 서로 친한 친구가 없고 혼자 있는 때가 많다고 답했어요';
const LEVEL_LABEL = { high: '높음', medium: '보통' } as const;
const KIND_LABEL: Record<ConstraintKind, string> = {
  'avoid-pair': '짝 금지',
  'avoid-group': '모둠 금지',
  'must-pair': '반드시 짝',
  'must-group': '반드시 같은 모둠',
};
const button = 'rounded border border-slate-300 bg-white px-3 py-1 text-sm font-semibold hover:bg-slate-50';

const avg = (v: number | null) => (v == null ? '-' : v.toFixed(1));
const score = (v: Score | null) => (v == null ? '-' : `${v} / 5`);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1">
      <h3 className="font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Names({ names }: { names: string[] }) {
  if (names.length === 0) return <p className="text-sm text-slate-500">없음</p>;
  return (
    <p className="text-sm">
      {names.map((n, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <span>{n}</span>
        </span>
      ))}
    </p>
  );
}

function Metrics({ items }: { items: [string, string | number][] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label} className="rounded border border-slate-200 px-3 py-2">
          <dt className="text-xs text-slate-600">{label}</dt>
          <dd className="text-lg font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Desk-mates or group-mates of the student in a record (snapshot names; removed students as deleted). */
function seatMates(rec: SeatingRecord, studentId: string, current: Set<string>): string[] | null {
  const unit = buildUnits(rec.layout).find((u) => u.seats.some((seat) => rec.assignment[seat] === studentId));
  if (!unit) return null;
  return unit.seats
    .map((seat) => rec.assignment[seat])
    .filter((sid): sid is string => !!sid && sid !== studentId)
    .map((sid) => (current.has(sid) ? (rec.studentNames[sid] ?? DELETED) : DELETED));
}

/**
 * Parent view. Renders ONLY from the ParentCard object, which holds no other student's name
 * (counts only; free text already masked by buildParentCard).
 */
function ParentCardView({ card }: { card: ParentCard }) {
  const metrics: [string, string | number][] = [
    ['받은 평균', avg(card.receivedAvg)],
    ['서로 친한 친구 수', card.mutualCount],
    ['같이 노는 친구 수', card.playWithCount],
    ['도움 청할 친구 수', card.helpFromCount],
  ];
  if (card.hardCount != null) metrics.push(['지목받은 수', card.hardCount]);
  return (
    <section aria-label="학부모 보기" className="space-y-4">
      <h2 className="text-xl font-bold">
        {card.studentLabel} 교우관계 상담 카드 <span className="text-sm font-normal">({card.surveyName})</span>
      </h2>
      <Metrics items={metrics} />
      {card.scores ? (
        <dl className="space-y-1 text-sm">
          {(
            [
              [Q.alone, card.scores.alone],
              [Q.happy, card.scores.happy],
              [Q.schoolFun, card.scores.schoolFun],
              [Q.family, card.scores.family],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="flex gap-3">
              <dt className="flex-1">{label}</dt>
              <dd className="font-semibold">{score(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-slate-600">설문 미응답이라 본인 응답이 없어요</p>
      )}
      {card.texts.map((t) => (
        <div key={t.label} className="space-y-1">
          <h3 className="font-bold">{t.label}</h3>
          <p className="whitespace-pre-wrap text-sm">{t.text}</p>
        </div>
      ))}
    </section>
  );
}

export function CounselingCard({ cls, survey, studentId, onSurveyChange, onSelectStudent }: Props) {
  const [parentMode, setParentMode] = useState(false);
  const [records, setRecords] = useState<SeatingRecord[] | null>(null);
  const [recordError, setRecordError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSeatingRecords(cls.id).then(
      (rs) => !cancelled && setRecords(rs),
      () => !cancelled && setRecordError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [cls.id]);

  const ordered = [...cls.students].sort((a, b) => a.number - b.number);
  const index = ordered.findIndex((s) => s.id === studentId);
  const student = ordered[index];
  if (!student) return <p className="text-sm text-slate-600">학생을 골라 주세요</p>;

  const byId = new Map(cls.students.map((s) => [s.id, s]));
  const order = (id: string) => byId.get(id)?.number ?? Number.MAX_SAFE_INTEGER;
  const name = (id: string) => {
    const s = byId.get(id);
    return s ? displayName(s, cls.students) : DELETED;
  };
  const names = (ids: string[]) => ids.map(name);

  const metrics = analyzeSurvey(survey, cls);
  const m = metrics[studentId];
  const radar = buildRadar(survey, cls, metrics).items.find((r) => r.studentId === studentId);
  const resp = survey.responses[studentId];
  const include: ParentInclude = survey.parentInclude[studentId] ?? EMPTY_INCLUDE;
  const maskList = namesToMask(cls, survey);

  const toggle = (key: keyof ParentInclude) =>
    onSurveyChange({
      ...survey,
      parentInclude: { ...survey.parentInclude, [studentId]: { ...include, [key]: !include[key] } },
    });

  const chosenAsBestBy = Object.entries(survey.responses)
    .filter(([from, r]) => from !== studentId && r.best.includes(studentId))
    .map(([from]) => from)
    .sort((a, b) => order(a) - order(b));
  const constraints = cls.constraints.filter((c) => c.a === studentId || c.b === studentId);
  const latest = records?.[0] ?? null;
  const mates = latest ? seatMates(latest, studentId, new Set(cls.students.map((s) => s.id))) : null;

  const checkbox = (key: keyof ParentInclude, label: string, text?: string) => (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={include[key]} onChange={() => toggle(key)} />
        {label}
      </label>
      {include[key] && text && containsStudentName(text, maskList) && (
        <p className="ml-6 text-xs text-amber-800">{NAME_WARNING}</p>
      )}
    </div>
  );

  const teacherView = (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">
        {studentLabel(student)} 상담 카드 <span className="text-sm font-normal">({survey.name})</span>
      </h2>
      {!resp && (
        <p className="rounded bg-slate-100 px-3 py-2 text-sm">
          설문 미응답 학생이에요. 다른 학생들의 응답에서 나온 내용만 보여요.
        </p>
      )}
      <Section title="지표">
        <Metrics
          items={
            resp
              ? [
                  ['받은 평균', avg(m.receivedAvg)],
                  ['서로 친한 친구 수', m.mutual.length],
                  ['같이 노는 친구 수', resp.playWith.length],
                  ['도움 청할 친구 수', resp.helpFrom.length],
                  ['지목받은 수', m.nominatedBy.length],
                ]
              : [
                  ['받은 평균', avg(m.receivedAvg)],
                  ['점수를 준 학생 수', m.receivedCount],
                  ['지목받은 수', m.nominatedBy.length],
                ]
          }
        />
      </Section>
      <Section title="관심 신호">
        {radar ? (
          <p className="text-sm">
            <span
              className={`mr-2 rounded px-2 py-0.5 text-xs font-bold ${
                radar.level === 'high' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {LEVEL_LABEL[radar.level]}
            </span>
            {radar.reasons.join(' · ')}
          </p>
        ) : (
          <p className="text-sm text-slate-500">특별한 신호가 없어요</p>
        )}
        {m.isolatedRef && <p className="text-sm text-amber-800">{ISOLATED_NOTE}</p>}
      </Section>
      {resp && (
        <>
          <Section title="서로 친함">
            <Names names={names(m.mutual)} />
          </Section>
          <Section title="한쪽만 좋아함">
            <p className="text-xs text-slate-600">이 학생만 좋아함</p>
            <Names names={names(m.likesOneSided)} />
            <p className="text-xs text-slate-600">상대만 좋아함</p>
            <Names names={names(m.likedByOneSided)} />
          </Section>
          <Section title={Q.best}>
            <Names names={names(resp.best)} />
          </Section>
          <Section title={Q.wantCloser}>
            <Names names={names(resp.wantCloser)} />
          </Section>
          <Section title={Q.playWith}>
            <Names names={names(resp.playWith)} />
          </Section>
          <Section title={Q.helpFrom}>
            <Names names={names(resp.helpFrom)} />
          </Section>
        </>
      )}
      <Section title="이 학생을 친한 친구로 고른 학생">
        <Names names={names(chosenAsBestBy)} />
      </Section>
      {resp && (
        <Section title="이 학생이 지목한 학생">
          <Names names={names(resp.hard.filter((h) => h !== studentId))} />
          {resp.hardReason.trim() && (
            <p className="text-sm">
              <span className="mr-2 text-xs text-slate-600">{Q.hardReason}</span>
              <span className="whitespace-pre-wrap">{resp.hardReason}</span>
            </p>
          )}
        </Section>
      )}
      <Section title="이 학생을 지목한 학생">
        {m.nominatedBy.length === 0 ? (
          <p className="text-sm text-slate-500">없음</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {m.nominatedBy.map((from) => {
              const reason = survey.responses[from]?.hardReason.trim() ?? '';
              return (
                <li key={from} className="flex flex-wrap gap-2">
                  <span className="font-semibold">{name(from)}</span>
                  {reason ? (
                    <span className="whitespace-pre-wrap">{reason}</span>
                  ) : (
                    <span className="text-slate-500">(이유 없음)</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      {resp && (
        <Section title="본인 응답">
          <dl className="space-y-1 text-sm">
            {(
              [
                [Q.alone, resp.alone],
                [Q.happy, resp.happy],
                [Q.schoolFun, resp.schoolFun],
                [Q.family, resp.family],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="flex gap-3">
                <dt className="flex-1">{label}</dt>
                <dd className="font-semibold">{score(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-600">{Q.toTeacher}</p>
          {resp.toTeacher.trim() ? (
            <p className="whitespace-pre-wrap text-sm">{resp.toTeacher}</p>
          ) : (
            <p className="text-sm text-slate-500">없음</p>
          )}
        </Section>
      )}
      <Section title="관련 쌍 조건">
        {constraints.length === 0 ? (
          <p className="text-sm text-slate-500">없음</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {constraints.map((c) => (
              <li key={c.id}>{`${name(c.a === studentId ? c.b : c.a)} · ${KIND_LABEL[c.kind]}`}</li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="최근 확정 자리">
        {recordError ? (
          <p className="text-sm text-red-800">자리 기록을 불러오지 못했어요</p>
        ) : records === null ? null : !latest ? (
          <p className="text-sm text-slate-500">아직 확정한 자리 배치가 없어요</p>
        ) : mates === null ? (
          <p className="text-sm text-slate-500">최근 기록에 이 학생 자리가 없어요</p>
        ) : (
          <p className="text-sm">
            {`${latest.layout.mode === 'pair' ? '짝' : '같은 모둠'}: ${mates.length ? mates.join(', ') : '없음'}`}
          </p>
        )}
      </Section>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!parentMode && (
          <>
            <select
              aria-label="학생 선택"
              className="rounded border border-slate-300 px-2 py-1"
              value={studentId}
              onChange={(e) => onSelectStudent(e.target.value)}
            >
              {ordered.map((s) => (
                <option key={s.id} value={s.id}>
                  {studentLabel(s)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={button}
              disabled={index <= 0}
              onClick={() => onSelectStudent(ordered[index - 1].id)}
            >
              이전
            </button>
            <button
              type="button"
              className={button}
              disabled={index >= ordered.length - 1}
              onClick={() => onSelectStudent(ordered[index + 1].id)}
            >
              다음
            </button>
          </>
        )}
        <button type="button" className={button} onClick={() => setParentMode((p) => !p)}>
          {parentMode ? '교사 보기' : '학부모 보기'}
        </button>
        <button type="button" className={button} onClick={() => window.print()}>
          {parentMode ? '학부모용 인쇄' : '교사용 인쇄'}
        </button>
      </div>

      {!parentMode && (
        <fieldset className="space-y-1 rounded border border-slate-200 px-3 py-2">
          <legend className="px-1 text-sm font-bold">학부모 보기에 포함</legend>
          {checkbox('ownHardReason', '친구 관계 고민(본인) 포함', resp?.hardReason)}
          {checkbox('toTeacher', '선생님께 하고 싶은 말 포함', resp?.toTeacher)}
          {checkbox('hardCount', '지목받은 수 포함')}
        </fieldset>
      )}

      {/* Only the shown view is printed (see @media print in globals.css). */}
      <div className="print-area">
        {parentMode ? (
          <ParentCardView card={buildParentCard(survey, studentId, cls, m, include)} />
        ) : (
          teacherView
        )}
      </div>
    </div>
  );
}
