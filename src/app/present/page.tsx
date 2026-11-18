'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { openPresenterChannel } from '@/lib/channel';
import type { IdleView, StageView, ToPresenter } from '@/lib/channel';
import type { RevealStyle } from '@/lib/db/repo';
import { SeatingChart } from '@/components/SeatingChart';
import { RevealStage } from '@/components/reveal/RevealStage';
import type { RevealControl } from '@/components/reveal/RevealStage';

type Screen =
  | { kind: 'waiting' }
  | { kind: 'idle'; view: IdleView }
  | { kind: 'reveal'; revealId: string; style: RevealStyle; stage: StageView; speed: 1 | 2 | 3 };

export default function PresentPage() {
  const [screen, setScreen] = useState<Screen>({ kind: 'waiting' });
  const [fullscreen, setFullscreen] = useState(false);
  const sendRef = useRef<(m: Parameters<ReturnType<typeof openPresenterChannel>['send']>[0]) => void>(() => {});
  const controlRef = useRef<RevealControl>(null);
  const revealIdRef = useRef<string | null>(null);

  useEffect(() => {
    const ch = openPresenterChannel((m: ToPresenter) => {
      if (m.type === 'idle') {
        revealIdRef.current = null;
        setScreen({ kind: 'idle', view: m.view });
      } else if (m.type === 'reveal') {
        revealIdRef.current = m.revealId;
        setScreen({ kind: 'reveal', revealId: m.revealId, style: m.style, stage: m.stage, speed: m.speed });
      } else if (m.type === 'speed') {
        if (m.revealId !== revealIdRef.current) return;
        setScreen((s) => (s.kind === 'reveal' ? { ...s, speed: m.speed } : s));
      } else if (m.type === 'control') {
        if (m.revealId !== revealIdRef.current) return;
        if (m.action === 'skip-all') controlRef.current?.skipAll();
        else if (m.seatId) controlRef.current?.flip(m.seatId);
      }
    });
    sendRef.current = ch.send;
    ch.send({ type: 'hello' });
    return () => ch.close();
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement != null);
    const onClick = () => {
      if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
      try {
        document.documentElement.requestFullscreen().catch(() => {});
      } catch {
        /* fullscreen is optional */
      }
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('click', onClick);
    };
  }, []);

  const revealId = screen.kind === 'reveal' ? screen.revealId : null;
  const onDone = useCallback(() => {
    if (revealId) sendRef.current({ type: 'done', revealId });
  }, [revealId]);
  const onFlip = useCallback((seatId: string) => {
    if (revealId) sendRef.current({ type: 'flipped', revealId, seatId });
  }, [revealId]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 text-slate-900">
      {screen.kind === 'waiting' && <p className="text-3xl text-slate-400">잠시만 기다려 주세요</p>}
      {screen.kind === 'idle' && screen.view.kind === 'title' && (
        <div className="text-center">
          <h1 className="text-8xl font-extrabold">{screen.view.className}</h1>
          <p className="mt-8 text-5xl text-slate-600">{screen.view.date}</p>
        </div>
      )}
      {screen.kind === 'idle' && screen.view.kind === 'chart' && (
        <SeatingChart stage={screen.view.stage} size="tv" />
      )}
      {screen.kind === 'reveal' && (
        <RevealStage
          key={screen.revealId}
          stage={screen.stage}
          style={screen.style}
          speed={screen.speed}
          size="tv"
          onDone={onDone}
          onFlip={onFlip}
          controlRef={controlRef}
        />
      )}
      {!fullscreen && (
        <span className="fixed bottom-2 right-3 text-sm text-slate-400">클릭하면 전체 화면</span>
      )}
    </main>
  );
}
