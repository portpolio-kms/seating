'use client';

import { useEffect, useRef } from 'react';

const EVENTS = ['mousemove', 'keydown', 'pointerdown'] as const;

export function useIdleLock(opts: { minutes: number; enabled: boolean; onLock: () => void }): void {
  const { minutes, enabled } = opts;
  const onLockRef = useRef(opts.onLock);
  useEffect(() => {
    onLockRef.current = opts.onLock;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onLockRef.current(), minutes * 60_000);
    };
    arm();
    EVENTS.forEach((e) => window.addEventListener(e, arm));
    return () => {
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [minutes, enabled]);
}
