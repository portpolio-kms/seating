'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PinGate } from '@/components/PinGate';
import { BackupPanel } from '@/components/teacher/BackupPanel';
import { ConstraintEditor } from '@/components/teacher/ConstraintEditor';
import { DrawPanel, type TeacherChannel } from '@/components/teacher/DrawPanel';
import { HistoryPanel } from '@/components/teacher/HistoryPanel';
import { LayoutEditor } from '@/components/teacher/LayoutEditor';
import { RosterEditor } from '@/components/teacher/RosterEditor';
import { useIdleLock } from '@/hooks/useIdleLock';
import { openTeacherChannel, type ToPresenter, type ToTeacher } from '@/lib/channel';
import { deleteClass, getSettings, listClasses, saveClass, saveSettings, type ClassRecord } from '@/lib/db/repo';

const TABS = [
  { id: 'draw', label: '뽑기' },
  { id: 'roster', label: '명단' },
  { id: 'layout', label: '배치' },
  { id: 'constraints', label: '쌍 조건' },
  { id: 'history', label: '기록' },
  { id: 'settings', label: '백업/설정' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const field = 'rounded border border-slate-300 px-3 py-2';
const button =
  'rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-40';

/**
 * Stable channel object for the panels. The BroadcastChannel is opened only inside an effect
 * (static export prerenders this page) and stays open while the teacher window is locked,
 * so the presenter still gets answers to `hello`.
 */
function useTeacherChannel(): TeacherChannel {
  const sendRef = useRef<(m: ToPresenter) => void>(() => {});
  const listeners = useRef(new Set<(m: ToTeacher) => void>());
  useEffect(() => {
    const ch = openTeacherChannel((m) => listeners.current.forEach((fn) => fn(m)));
    sendRef.current = ch.send;
    return () => {
      sendRef.current = () => {};
      ch.close();
    };
  }, []);
  return useMemo(
    () => ({
      send: (m) => sendRef.current(m),
      subscribe: (fn) => {
        listeners.current.add(fn);
        return () => {
          listeners.current.delete(fn);
        };
      },
    }),
    [],
  );
}

function newClass(name: string): ClassRecord {
  return {
    id: crypto.randomUUID(),
    name,
    students: [],
    layout: { mode: 'pair', rows: 4, cols: 3, groupSize: 4, disabledSeats: [] },
    constraints: [],
    genderRule: false,
    lastRevealStyle: 'A',
    createdAt: new Date().toISOString(),
  };
}

function NewClassForm({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
    >
      <input
        aria-label="새 학급 이름"
        placeholder="예: 6학년 1반"
        className={field}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className={button} disabled={!name.trim()}>
        새 학급 만들기
      </button>
      {onCancel && (
        <button type="button" className="text-sm text-slate-500 underline" onClick={onCancel}>
          취소
        </button>
      )}
    </form>
  );
}

interface Loaded { classes: ClassRecord[]; idleMinutes: number }

function TeacherApp({ warnOnScreen }: { warnOnScreen: boolean }) {
  const channel = useTeacherChannel();
  const [unlocked, setUnlocked] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('draw');
  const [creating, setCreating] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Two-screen mode: the teacher window must stay usable during a reveal, so it does not lock then.
  useIdleLock({ minutes: data?.idleMinutes ?? 5, enabled: unlocked && !revealing, onLock: () => setUnlocked(false) });

  const load = useCallback(async () => {
    const [classes, settings] = await Promise.all([listClasses(), getSettings()]);
    classes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    setData({ classes, idleMinutes: settings.idleMinutes });
    const exists = (id: string | null): id is string => id !== null && classes.some((c) => c.id === id);
    setActiveId((cur) => (exists(cur) ? cur : exists(settings.activeClassId) ? settings.activeClassId : (classes[0]?.id ?? null)));
  }, []);

  const persist = useCallback((c: ClassRecord) => {
    setData((d) => d && { ...d, classes: d.classes.map((x) => (x.id === c.id ? c : x)) });
    saveClass(c).then(
      () => setSaveError(false),
      () => setSaveError(true),
    );
  }, []);

  const selectClass = (id: string) => {
    setActiveId(id);
    void saveSettings({ activeClassId: id });
  };

  const createClass = async (name: string) => {
    const c = newClass(name);
    try {
      await saveClass(c);
    } catch {
      setSaveError(true);
      return;
    }
    setData((d) => d && { ...d, classes: [...d.classes, c] });
    selectClass(c.id);
    setCreating(false);
    setTab('roster');
  };

  const onWiped = () => {
    setData(null);
    setActiveId(null);
    setTab('draw');
    setCreating(false);
    setUnlocked(false);
  };

  const deleteActive = async (c: ClassRecord) => {
    try {
      await deleteClass(c.id);
    } catch {
      setSaveError(true);
      return;
    }
    const rest = (data?.classes ?? []).filter((x) => x.id !== c.id);
    setData((d) => d && { ...d, classes: d.classes.filter((x) => x.id !== c.id) });
    setTab('draw');
    setCreating(false);
    const next = rest[0]?.id ?? null;
    setActiveId(next);
    void saveSettings({ activeClassId: next });
  };

  const active = data?.classes.find((c) => c.id === activeId) ?? null;

  return (
    <>
      {!unlocked && (
        <PinGate
          warnOnScreen={warnOnScreen}
          onUnlock={() => {
            setUnlocked(true);
            void load();
          }}
          onWiped={onWiped}
        />
      )}
      {/* Kept mounted while locked so a running draw and the presenter channel survive the lock.
          Do not add a display utility (flex, grid, block...) to this wrapper: it would override the
          `hidden` attribute and show student data and pair constraints on screen while locked. */}
      {data && (
        <div hidden={!unlocked} className="min-h-screen bg-slate-50 text-slate-900">
          <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
            <h1 className="text-xl font-bold">자리배치 · 교사 화면</h1>
            {data.classes.length > 0 && (
              <select
                aria-label="학급 선택"
                className={field}
                value={activeId ?? ''}
                disabled={revealing}
                onChange={(e) => selectClass(e.target.value)}
              >
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {data.classes.length > 0 &&
              (creating ? (
                <NewClassForm onCreate={(n) => void createClass(n)} onCancel={() => setCreating(false)} />
              ) : (
                <button type="button" className={button} disabled={revealing} onClick={() => setCreating(true)}>
                  + 새 학급
                </button>
              ))}
            <Link href="/" className={`${button} ml-auto`}>
              교실 화면으로
            </Link>
            <button type="button" className={button} onClick={() => setUnlocked(false)}>
              잠그기
            </button>
          </header>

          {saveError && (
            <p role="alert" className="mx-6 mt-3 rounded bg-red-50 px-3 py-2 text-red-800">
              저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.
            </p>
          )}

          {!active ? (
            <main className="mx-auto max-w-2xl space-y-6 p-6">
              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-bold">처음이시군요. 새 학급을 만들어 시작해요.</h2>
                <NewClassForm onCreate={(n) => void createClass(n)} />
              </section>
              <BackupPanel
                cls={null}
                classes={data.classes}
                idleMinutes={data.idleMinutes}
                onIdleMinutesChange={(m) => setData((d) => d && { ...d, idleMinutes: m })}
                onImported={() => void load()}
                onWiped={onWiped}
              />
            </main>
          ) : (
            <main className="space-y-4 p-6">
              <nav role="tablist" className="flex flex-wrap gap-2">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`rounded-lg px-4 py-2 font-semibold ${
                      tab === t.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
              {/* The draw panel stays mounted across tabs: it owns the presenter's current state. */}
              <div hidden={tab !== 'draw'}>
                <DrawPanel
                  key={`${active.id}|${JSON.stringify(active.layout)}`}
                  cls={active}
                  channel={channel}
                  onChange={persist}
                  onRevealingChange={setRevealing}
                />
              </div>
              {tab === 'roster' && <RosterEditor cls={active} onChange={persist} />}
              {tab === 'layout' && <LayoutEditor key={active.id} cls={active} onChange={persist} />}
              {tab === 'constraints' && <ConstraintEditor cls={active} onChange={persist} />}
              {tab === 'history' && <HistoryPanel cls={active} />}
              {tab === 'settings' && (
                <BackupPanel
                  cls={active}
                  classLocked={revealing}
                  onRename={(name) => persist({ ...active, name })}
                  onDelete={() => void deleteActive(active)}
                  classes={data.classes}
                  idleMinutes={data.idleMinutes}
                  onIdleMinutesChange={(m) => setData((d) => d && { ...d, idleMinutes: m })}
                  onImported={() => void load()}
                  onWiped={onWiped}
                />
              )}
            </main>
          )}
        </div>
      )}
    </>
  );
}

/** Reads `?from=classroom` (set by the classroom home) so the PIN gate warns first that the TV may show this screen. */
function TeacherEntry() {
  const fromClassroom = useSearchParams()?.get('from') === 'classroom';
  return <TeacherApp warnOnScreen={fromClassroom} />;
}

export default function TeacherPage() {
  // Suspense boundary: useSearchParams needs it for static export.
  return (
    <Suspense fallback={null}>
      <TeacherEntry />
    </Suspense>
  );
}
