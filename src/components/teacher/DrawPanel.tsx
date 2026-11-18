'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RevealStage, type RevealControl } from '@/components/reveal/RevealStage';
import { SeatingChart } from '@/components/SeatingChart';
import { toStageView, type ToPresenter, type ToTeacher } from '@/lib/channel';
import {
  addSeatingRecord,
  listSeatingRecords,
  type ClassRecord,
  type RevealStyle,
  type SeatingRecord,
} from '@/lib/db/repo';
import { displayName } from '@/lib/roster';
import { findViolations, generateSeating } from '@/lib/seating/solver';
import type { Assignment, ConstraintKind, SeatId } from '@/lib/seating/types';

/** Teacher side of the presenter channel; the page adapts the BroadcastChannel to this, tests inject a fake. */
export interface TeacherChannel {
  send(m: ToPresenter): void;
  subscribe(fn: (m: ToTeacher) => void): () => void;
}

type Speed = 1 | 2 | 3;
type Phase = 'ready' | 'revealing' | 'revealed' | 'confirmed';

const STYLES: { style: RevealStyle; label: string }[] = [
  { style: 'A', label: 'A 한 번에 공개' },
  { style: 'B', label: 'B 한 명씩 뽑기' },
  { style: 'C', label: 'C 카드 뒤집기' },
];
const SPEEDS: { speed: Speed; label: string }[] = [
  { speed: 1, label: '느리게' },
  { speed: 2, label: '보통' },
  { speed: 3, label: '빠르게' },
];
const KIND_LABEL: Record<ConstraintKind, string> = {
  'avoid-pair': '짝 금지',
  'avoid-group': '모둠 금지',
  'must-pair': '반드시 짝',
  'must-group': '반드시 같은 모둠',
};
const POPUP_BLOCKED = '팝업이 차단됐어요. 주소창 오른쪽에서 허용해 주세요';
const SAVE_FAILED = '저장하지 못했어요. 다시 시도해 주세요';

const button = 'rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-40';
const primary = 'rounded-lg bg-blue-600 px-5 py-2 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-40';
const toggle = (on: boolean) =>
  `rounded-lg border px-3 py-2 font-semibold ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`;

interface ScreenArea { availLeft: number; availTop: number; availWidth: number; availHeight: number }
interface ScreenDetailsLike { screens: ScreenArea[]; currentScreen: ScreenArea }

/** /x/teacher/ → /x/present/ (keeps any GitHub Pages base path without env plumbing). */
function presenterUrl(): string {
  const m = window.location.pathname.match(/^(.*\/)teacher(\/(index\.html)?)?$/);
  return m ? `${m[1]}present/` : '../present/';
}

/**
 * Opens the presenter window, on the second screen when the Window Management API is available and
 * permitted. Returns null when the popup was blocked.
 */
export async function openPresenterWindow(): Promise<Window | null> {
  let features = 'popup,width=1280,height=720';
  const w = window as Window & { getScreenDetails?: () => Promise<ScreenDetailsLike> };
  if (typeof w.getScreenDetails === 'function') {
    try {
      const { screens, currentScreen: cur } = await w.getScreenDetails();
      const other = screens.find((s) => s.availLeft !== cur.availLeft || s.availTop !== cur.availTop);
      if (other) {
        features = `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
      }
    } catch {
      // Permission denied or unsupported: open a plain window.
    }
  }
  return window.open(presenterUrl(), 'seating-present', features);
}

function todayLabel(): string {
  return new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

const titleMessage = (className: string): ToPresenter => ({
  type: 'idle',
  view: { kind: 'title', className, date: todayLabel() },
});

export function DrawPanel({
  cls,
  channel,
  onChange,
  onRevealingChange,
}: {
  cls: ClassRecord;
  channel: TeacherChannel;
  /** Receives settings changes (reveal style, gender rule) for the parent to persist. */
  onChange?: (c: ClassRecord) => void;
  /** True while a reveal is running (the teacher page pauses its idle lock). */
  onRevealingChange?: (revealing: boolean) => void;
}) {
  const [style, setStyle] = useState<RevealStyle>(cls.lastRevealStyle);
  const [speed, setSpeed] = useState<Speed>(2);
  const [phase, setPhase] = useState<Phase>('ready');
  const [reasons, setReasons] = useState<string[]>([]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [reveal, setReveal] = useState<{ id: string; style: RevealStyle } | null>(null);
  const [selected, setSelected] = useState<SeatId | null>(null);
  const [record, setRecord] = useState<SeatingRecord | null>(null);
  const [lastRecord, setLastRecord] = useState<SeatingRecord | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  const controlRef = useRef<RevealControl>(null);
  /** What the presenter shows now (last reveal or idle message), re-sent on hello. */
  const presenterRef = useRef<ToPresenter | null>(null);
  const revealIdRef = useRef<string | null>(null);
  /** True while the presenter shows the current draw, so swaps are pushed to it. */
  const showingDrawRef = useRef(false);
  const classNameRef = useRef(cls.name);
  classNameRef.current = cls.name;
  const onRevealingRef = useRef(onRevealingChange);
  onRevealingRef.current = onRevealingChange;

  const sendToPresenter = useCallback(
    (m: ToPresenter) => {
      if (m.type === 'reveal' || m.type === 'idle') presenterRef.current = m;
      channel.send(m);
    },
    [channel],
  );

  useEffect(() => {
    let cancelled = false;
    listSeatingRecords(cls.id)
      .then((rs) => !cancelled && setLastRecord(rs[0] ?? null))
      .catch(() => !cancelled && setLastRecord(null));
    return () => {
      cancelled = true;
    };
  }, [cls.id]);

  useEffect(
    () =>
      channel.subscribe((m) => {
        if (m.type === 'hello') {
          channel.send(presenterRef.current ?? titleMessage(classNameRef.current));
          return;
        }
        if (m.revealId !== revealIdRef.current) return;
        if (m.type === 'flipped') controlRef.current?.flip(m.seatId);
        else if (m.type === 'done') setPhase((p) => (p === 'revealing' ? 'revealed' : p));
      }),
    [channel],
  );

  useEffect(() => {
    onRevealingRef.current?.(phase === 'revealing');
  }, [phase]);
  useEffect(() => () => onRevealingRef.current?.(false), []);

  const stage = useMemo(() => (assignment ? toStageView(cls, assignment) : null), [cls, assignment]);
  const violations = useMemo(
    () => (assignment ? findViolations(assignment, cls.layout, cls.constraints) : []),
    [assignment, cls.layout, cls.constraints],
  );
  const nameOf = (id: string) => {
    const s = cls.students.find((x) => x.id === id);
    return s ? displayName(s, cls.students) : '(삭제된 학생)';
  };
  const warnSeats = useMemo(() => {
    if (!assignment || violations.length === 0) return [];
    const ids = new Set(violations.flatMap((v) => [v.a, v.b]));
    return Object.keys(assignment).filter((seat) => ids.has(assignment[seat] ?? ''));
  }, [assignment, violations]);

  const revealing = phase === 'revealing';

  const chooseStyle = (s: RevealStyle) => {
    setStyle(s);
    onChange?.({ ...cls, lastRevealStyle: s });
  };

  const changeSpeed = (s: Speed) => {
    setSpeed(s);
    if (revealing && reveal) {
      const cur = presenterRef.current;
      if (cur?.type === 'reveal') presenterRef.current = { ...cur, speed: s };
      channel.send({ type: 'speed', revealId: reveal.id, speed: s });
    }
  };

  const openWindow = async () => {
    const win = await openPresenterWindow();
    setNotice(win ? null : POPUP_BLOCKED);
  };

  const start = () => {
    setNotice(null);
    setSelected(null);
    const result =
      cls.students.length === 0
        ? { ok: false as const, reasons: ['명단에 학생이 없어요. 명단 탭에서 학생을 추가해 주세요'] }
        : generateSeating({
            students: cls.students,
            layout: cls.layout,
            constraints: cls.constraints,
            genderRule: cls.genderRule,
            rng: Math.random,
          });
    if (!result.ok) {
      // Reasons stay on the teacher screen; the presenter is not told anything.
      setReasons(result.reasons);
      setAssignment(null);
      setReveal(null);
      setRecord(null);
      setPhase('ready');
      revealIdRef.current = null;
      return;
    }
    const id = crypto.randomUUID();
    revealIdRef.current = id;
    showingDrawRef.current = true;
    setReasons([]);
    setAssignment(result.assignment);
    setRecord(null);
    setReveal({ id, style });
    setPhase('revealing');
    sendToPresenter({ type: 'reveal', revealId: id, style, stage: toStageView(cls, result.assignment), speed });
  };

  const skipAll = () => {
    if (!reveal) return;
    controlRef.current?.skipAll();
    channel.send({ type: 'control', revealId: reveal.id, action: 'skip-all' });
  };

  const onPreviewFlip = (seatId: SeatId) => {
    if (reveal) channel.send({ type: 'control', revealId: reveal.id, action: 'flip', seatId });
  };

  const studentNames = () => Object.fromEntries(cls.students.map((s) => [s.id, displayName(s, cls.students)]));

  const save = async (rec: SeatingRecord): Promise<boolean> => {
    try {
      await addSeatingRecord(rec);
    } catch {
      setNotice(SAVE_FAILED);
      return false;
    }
    setRecord(rec);
    setLastRecord(rec);
    return true;
  };

  const confirm = async () => {
    if (!assignment) return;
    const ok = await save({
      id: crypto.randomUUID(),
      classId: cls.id,
      createdAt: new Date().toISOString(),
      layout: cls.layout,
      assignment,
      studentNames: studentNames(),
    });
    if (!ok) return;
    setPhase('confirmed');
    showingDrawRef.current = true;
    sendToPresenter({ type: 'idle', view: { kind: 'chart', stage: toStageView(cls, assignment) } });
  };

  const clickSeat = (seatId: SeatId) => {
    if (!assignment) return;
    if (selected === null) return setSelected(seatId);
    if (selected === seatId) return setSelected(null);
    const next: Assignment = { ...assignment, [selected]: assignment[seatId] ?? null, [seatId]: assignment[selected] ?? null };
    setSelected(null);
    setAssignment(next);
    if (showingDrawRef.current) {
      sendToPresenter({ type: 'idle', view: { kind: 'chart', stage: toStageView(cls, next) } });
    }
    // A swap after confirming updates the saved record.
    if (phase === 'confirmed' && record) void save({ ...record, assignment: next, studentNames: studentNames() });
  };

  const showTitle = () => {
    showingDrawRef.current = false;
    sendToPresenter(titleMessage(cls.name));
  };

  const showLastChart = () => {
    if (!lastRecord) return;
    showingDrawRef.current = lastRecord.id === record?.id;
    sendToPresenter({
      type: 'idle',
      view: { kind: 'chart', stage: toStageView({ ...cls, layout: lastRecord.layout }, lastRecord.assignment) },
    });
  };

  const warnings = [
    ...new Set(violations.map((v) => `⚠ ${nameOf(v.a)}·${nameOf(v.b)}: ${KIND_LABEL[v.kind]} 조건과 겹쳐요`)),
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">연출 방식</span>
        {STYLES.map((s) => (
          <button
            key={s.style}
            type="button"
            aria-pressed={style === s.style}
            disabled={revealing}
            className={toggle(style === s.style)}
            onClick={() => chooseStyle(s.style)}
          >
            {s.label}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={cls.genderRule}
            disabled={revealing}
            onChange={(e) => onChange?.({ ...cls, genderRule: e.target.checked })}
          />
          남녀 짝 맞추기 (가능한 만큼)
        </label>
      </section>

      {(style === 'B' || reveal?.style === 'B') && (
        <section className="flex flex-wrap items-center gap-3" aria-label="속도">
          <span className="font-semibold">속도</span>
          {SPEEDS.map((s) => (
            <button
              key={s.speed}
              type="button"
              aria-pressed={speed === s.speed}
              className={toggle(speed === s.speed)}
              onClick={() => changeSpeed(s.speed)}
            >
              {s.label}
            </button>
          ))}
        </section>
      )}

      <section className="flex flex-wrap items-center gap-3">
        <button type="button" className={button} onClick={() => void openWindow()}>
          발표 창 열기
        </button>
        <span className="font-semibold">대기 화면</span>
        <button type="button" className={button} disabled={revealing} onClick={showTitle}>
          학급 이름
        </button>
        {lastRecord !== undefined && (
          <button type="button" className={button} disabled={revealing || !lastRecord} onClick={showLastChart}>
            마지막 확정 좌석표
          </button>
        )}
      </section>

      {notice && (
        <p role="alert" className="rounded bg-amber-100 px-3 py-2 text-amber-900">
          {notice}
        </p>
      )}

      {phase === 'ready' && (
        <button type="button" className={primary} onClick={start}>
          뽑기 시작
        </button>
      )}

      {reasons.length > 0 && (
        <div role="alert" className="space-y-1 rounded bg-red-50 px-4 py-3 text-red-800">
          <p className="font-semibold">자리를 정하지 못했어요. 이 내용은 교사 화면에만 보여요.</p>
          <ul className="list-disc pl-5">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {stage && reveal && phase !== 'ready' && (
        <section className="space-y-3">
          <p className={`font-semibold ${violations.length === 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            조건 위반 {violations.length}건
          </p>
          {warnings.map((w) => (
            <p key={w} role="status" className="rounded bg-amber-100 px-3 py-1 text-amber-900">
              {w}
            </p>
          ))}

          {revealing ? (
            <>
              <p className="text-sm text-slate-500">
                발표 창 미리보기{reveal.style === 'C' ? ' — 카드를 누르면 발표 창에서도 뒤집혀요' : ''}
              </p>
              <RevealStage
                key={reveal.id}
                stage={stage}
                style={reveal.style}
                speed={speed}
                size="small"
                onDone={() => setPhase((p) => (p === 'revealing' ? 'revealed' : p))}
                onFlip={onPreviewFlip}
                controlRef={controlRef}
              />
              <button type="button" className={button} onClick={skipAll}>
                나머지 바로 공개
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">두 자리를 차례로 누르면 서로 바꿔요.</p>
              <SeatingChart
                stage={stage}
                size="small"
                onSeatClick={clickSeat}
                selectedSeat={selected ?? undefined}
                highlightSeats={warnSeats}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={button} onClick={start}>
                  다시 뽑기
                </button>
                {phase === 'revealed' ? (
                  <button type="button" className={primary} onClick={() => void confirm()}>
                    이대로 확정
                  </button>
                ) : (
                  <span className="font-semibold text-emerald-700">확정했어요. 기록 탭에서 볼 수 있어요.</span>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
