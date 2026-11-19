'use client';

import { useSyncExternalStore } from 'react';
import { isDbBlocked, onDbBlockedChange } from '@/lib/db/db';

export const DB_BLOCKED_MESSAGE = '이 앱이 열린 다른 창이나 탭을 모두 닫아 주세요. 새 버전으로 바뀌는 중이에요.';

const subscribe = (cb: () => void) => onDbBlockedChange(() => cb());

/**
 * True while a database upgrade waits on another open window or tab (including a block that
 * started before mount); false again once the upgrade completes.
 */
export function useDbBlocked(): boolean {
  return useSyncExternalStore(subscribe, isDbBlocked, () => false);
}
