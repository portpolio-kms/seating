'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PinGate } from '@/components/PinGate';
import { RevealStage } from '@/components/reveal/RevealStage';
import { SeatingChart } from '@/components/SeatingChart';
import { DB_BLOCKED_MESSAGE, useDbBlocked } from '@/hooks/useDbBlocked';
import { recordToStageView, toStageView } from '@/lib/channel';
import {
  addSeatingRecord,
  getClass,
  getSettings,
  listClasses,
  listSeatingRecords,
  type ClassRecord,
  type RevealStyle,
  type SeatingRecord,
} from '@/lib/db/repo';
import { displayName } from '@/lib/roster';
import { generateSeating } from '@/lib/seating/solver';
import type { Assignment } from '@/lib/seating/types';

type View =
  | { kind: 'home' }
  | { kind: 'pick' }
  | { kind: 'error' }
  | { kind: 'reveal'; id: string; style: RevealStyle; assignment: Assignment }
  | { kind: 'chart' };

const STYLES: { style: RevealStyle; label: string }[] = [
  { style: 'A', label: 'A 한 번에 공개' },
  { style: 'B', label: 'B 한 명씩 뽑기' },
  { style: 'C', label: 'C 카드 뒤집기' },
];

const big = 'rounded-2xl px-10 py-6 text-3xl font-bold';
const primary = `${big} bg-blue-600 text-white hover:bg-blue-700`;
const secondary = `${big} border-2 border-slate-300 bg-white hover:bg-slate-50`;
const TEACHER_HREF = '/teacher/?from=classroom';

export default function Home() {
  const [cls, setCls] = useState<ClassRecord | null | undefined>(undefined);
  const [view, setView] = useState<View>({ kind: 'home' });
  const [last, setLast] = useState<SeatingRecord | null>(null);
  const [revealDone, setRevealDone] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const alive = useRef(true);
  const dbBlocked = useDbBlocked();

  const reload = useCallback(async () => {
    try {
      const [classes, settings] = await Promise.all([listClasses(), getSettings()]);
      classes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const active = classes.find((c) => c.id === settings.activeClassId) ?? classes[0] ?? null;
      const records = active ? await listSeatingRecords(active.id) : [];
      if (!alive.current) return;
      setCls(active);
      setLast(records[0] ?? null);
    } catch {
      if (alive.current) setCls(null);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  const stage = useMemo(() => {
    if (!cls || view.kind !== 'reveal') return null;
    return toStageView(cls, view.assignment);
  }, [cls, view]);

  if (cls === undefined) {
    // While another window blocks the database upgrade, loading never finishes: say why.
    if (!dbBlocked) return null;
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center">
        <p role="alert" className="text-3xl font-bold text-amber-900">
          {DB_BLOCKED_MESSAGE}
        </p>
      </main>
    );
  }

  if (cls === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
        <p className="text-4xl font-bold">교사 화면에서 학급을 먼저 만들어 주세요</p>
        <Link href={TEACHER_HREF} className={primary}>
          교사 화면
        </Link>
      </main>
    );
  }

  const draw = (style: RevealStyle) => {
    const result = generateSeating({
      students: cls.students,
      layout: cls.layout,
      constraints: cls.constraints,
      genderRule: cls.genderRule,
      rng: Math.random,
    });
    if (cls.students.length === 0 || !result.ok) return setView({ kind: 'error' });
    setRevealDone(false);
    setSaveError(false);
    setView({ kind: 'reveal', id: crypto.randomUUID(), style, assignment: result.assignment });
  };

  const confirm = async (style: RevealStyle, assignment: Assignment) => {
    // The class may have been deleted (or all data wiped) in the teacher window meanwhile:
    // never write a record for a class that no longer exists.
    let exists = false;
    try {
      exists = (await getClass(cls.id)) !== undefined;
    } catch {
      // Storage unreadable: treated like a missing class below.
    }
    if (!exists) {
      setConfirming(false);
      setView({ kind: 'home' });
      await reload();
      return;
    }
    const rec: SeatingRecord = {
      id: crypto.randomUUID(),
      classId: cls.id,
      createdAt: new Date().toISOString(),
      layout: cls.layout,
      assignment,
      studentNames: Object.fromEntries(cls.students.map((s) => [s.id, displayName(s, cls.students)])),
    };
    try {
      await addSeatingRecord(rec);
    } catch {
      setSaveError(true);
      setRevealDone(true);
      setConfirming(false);
      setView({ kind: 'reveal', id: crypto.randomUUID(), style, assignment });
      return;
    }
    setLast(rec);
    setConfirming(false);
    setView({ kind: 'chart' });
  };

  if (view.kind === 'reveal' && stage) {
    return (
      <main className="flex min-h-screen flex-col gap-6 bg-slate-50 p-6">
        {confirming && (
          <div className="fixed inset-0 z-50">
            <PinGate
              warnOnScreen
              allowForgot={false}
              onUnlock={() => void confirm(view.style, view.assignment)}
              onCancel={() => setConfirming(false)}
            />
          </div>
        )}
        <div className="flex-1">
          <RevealStage
            key={view.id}
            stage={stage}
            style={view.style}
            speed={2}
            size="tv"
            onDone={() => setRevealDone(true)}
          />
        </div>
        {saveError && (
          <p role="alert" className="text-center text-2xl text-amber-800">
            저장하지 못했어요. 다시 시도해 주세요
          </p>
        )}
        {revealDone && (
          <div className="flex justify-center gap-6">
            <button type="button" className={secondary} onClick={() => draw(view.style)}>
              다시 뽑기
            </button>
            <button
              type="button"
              className={primary}
              onClick={() => setConfirming(true)}
            >
              확정
            </button>
          </div>
        )}
      </main>
    );
  }

  if (view.kind === 'chart') {
    return (
      <main className="flex min-h-screen flex-col items-center gap-8 bg-slate-50 p-6">
        {last ? (
          <SeatingChart stage={recordToStageView(cls.name, last)} size="tv" />
        ) : (
          <p className="mt-24 text-4xl font-bold">아직 확정된 좌석표가 없어요</p>
        )}
        <button type="button" className={secondary} onClick={() => setView({ kind: 'home' })}>
          처음으로
        </button>
      </main>
    );
  }

  if (view.kind === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
        <p className="text-4xl font-bold">설정을 확인해 주세요</p>
        <button type="button" className={secondary} onClick={() => setView({ kind: 'home' })}>
          처음으로
        </button>
      </main>
    );
  }

  if (view.kind === 'pick') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
        <p className="text-4xl font-bold">어떤 방식으로 뽑을까요?</p>
        <div className="flex flex-wrap justify-center gap-6">
          {STYLES.map((s) => (
            <button key={s.style} type="button" className={primary} onClick={() => draw(s.style)}>
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" className={secondary} onClick={() => setView({ kind: 'home' })}>
          처음으로
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-12 p-8 text-center">
      <h1 className="text-7xl font-bold">{cls.name}</h1>
      <div className="flex flex-wrap justify-center gap-6">
        <button type="button" className={primary} onClick={() => setView({ kind: 'pick' })}>
          자리 뽑기
        </button>
        <button type="button" className={secondary} onClick={() => setView({ kind: 'chart' })}>
          좌석표 보기
        </button>
        <Link href={TEACHER_HREF} className={secondary}>
          교사 화면
        </Link>
      </div>
    </main>
  );
}
