'use client';

import { useEffect, useRef, useState } from 'react';
import { getSettings, saveSettings, wipeAll, type AppSettings } from '@/lib/db/repo';
import { hashPin, isValidPin, newSalt, verifyPin } from '@/lib/auth/pin';

type Step = 'loading' | 'storage-error' | 'warn' | 'setup' | 'unlock' | 'forgot';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-2xl tracking-widest focus:border-blue-500 focus:outline-none';
const primaryButton =
  'w-full rounded-lg bg-blue-600 px-4 py-3 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-40';

const STORAGE_ERROR = '저장소를 열 수 없어요. 브라우저 설정(사생활 보호 모드 등)을 확인해 주세요';
/** The forgot-PIN wipe only runs after the teacher types this exactly. */
export const WIPE_PHRASE = '모두 지우기';

const stepFor = (s: AppSettings): Step => (s.pinHash && s.pinSalt ? 'unlock' : 'setup');

export function PinGate({
  onUnlock,
  warnOnScreen = false,
  onCancel,
  allowForgot = true,
  onWiped,
}: {
  onUnlock: () => void;
  warnOnScreen?: boolean;
  /** When given, the warn and unlock steps offer a way back (used by the classroom home). */
  onCancel?: () => void;
  /** Offers "PIN을 잊었어요" (wipe everything). The classroom home turns it off: students can reach that gate. */
  allowForgot?: boolean;
  /** Called after the forgot-PIN flow wiped all data. */
  onWiped?: () => void;
}) {
  const [step, setStep] = useState<Step>('loading');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then(
      (s) => {
        if (cancelled) return;
        setSettings(s);
        setStep(warnOnScreen ? 'warn' : stepFor(s));
      },
      () => !cancelled && setStep('storage-error'),
    );
    return () => {
      cancelled = true;
    };
  }, [warnOnScreen]);

  const reset = () => {
    setPin('');
    setPin2('');
    setPhrase('');
    setError('');
  };

  /** Runs one submit at a time; a storage failure shows a message instead of throwing. */
  const guarded = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch {
      setError(STORAGE_ERROR);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submitSetup = async () => {
    if (!isValidPin(pin)) return setError('숫자 4자리를 입력해 주세요');
    if (pin !== pin2) return setError('두 PIN이 달라요');
    const salt = newSalt();
    await saveSettings({ pinSalt: salt, pinHash: await hashPin(pin, salt) });
    onUnlock();
  };

  const submitUnlock = async () => {
    if (settings && (await verifyPin(pin, settings))) return onUnlock();
    setError('PIN이 맞지 않아요');
  };

  const confirmWipe = async () => {
    if (phrase !== WIPE_PHRASE) return;
    await wipeAll();
    onWiped?.();
    setSettings(await getSettings());
    reset();
    setStep('setup');
  };

  if (step === 'loading') return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-lg">
        {step === 'storage-error' && (
          <>
            <p role="alert" className="text-center text-lg text-red-700">
              {STORAGE_ERROR}
            </p>
            {onCancel && (
              <button type="button" className="w-full text-sm text-slate-500 underline" onClick={onCancel}>
                돌아가기
              </button>
            )}
          </>
        )}

        {step === 'warn' && (
          <>
            <p className="text-center text-lg">지금 화면이 TV에 보일 수 있어요. 계속할까요?</p>
            <button type="button" className={primaryButton} onClick={() => settings && setStep(stepFor(settings))}>
              계속
            </button>
            {onCancel && (
              <button type="button" className="w-full text-sm text-slate-500 underline" onClick={onCancel}>
                돌아가기
              </button>
            )}
          </>
        )}

        {(step === 'setup' || step === 'unlock') && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void guarded(step === 'setup' ? submitSetup : submitUnlock);
            }}
          >
            <h1 className="text-center text-xl font-bold">{step === 'setup' ? 'PIN 정하기' : '선생님 PIN을 입력하세요'}</h1>
            <input
              aria-label="PIN"
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              autoComplete="off"
              className={inputClass}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            {step === 'setup' && (
              <input
                aria-label="PIN 다시 입력"
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                className={inputClass}
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
              />
            )}
            {error && (
              <p role="alert" className="text-center text-sm text-red-600">
                {error}
              </p>
            )}
            <button type="submit" className={primaryButton} disabled={busy}>
              확인
            </button>
            <p className="text-center text-sm text-slate-500">이 잠금은 학생이 지나가다 보는 것을 막는 용도예요.</p>
            {onCancel && (
              <button type="button" className="w-full text-sm text-slate-500 underline" onClick={onCancel}>
                돌아가기
              </button>
            )}
            {step === 'unlock' && allowForgot && (
              <button
                type="button"
                className="w-full text-sm text-slate-500 underline"
                onClick={() => {
                  reset();
                  setStep('forgot');
                }}
              >
                PIN을 잊었어요
              </button>
            )}
          </form>
        )}

        {step === 'forgot' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void guarded(confirmWipe);
            }}
          >
            <p className="text-center text-lg">모든 데이터를 지우고 새로 시작할까요? 되돌릴 수 없어요.</p>
            <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
              지우기 전에 백업 파일이 있는지 확인하세요. 새로 시작한 뒤 백업 가져오기로 복원할 수 있어요.
            </p>
            <label className="block space-y-1 text-sm">
              <span>
                계속하려면 <strong>{WIPE_PHRASE}</strong>라고 입력하세요
              </span>
              <input
                aria-label="확인 문구"
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-center text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-red-600 px-4 py-3 text-lg font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              disabled={busy || phrase !== WIPE_PHRASE}
            >
              모든 데이터를 지우고 새로 시작
            </button>
            <button
              type="button"
              className="w-full text-sm text-slate-500 underline"
              onClick={() => {
                reset();
                setStep('unlock');
              }}
            >
              취소
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
