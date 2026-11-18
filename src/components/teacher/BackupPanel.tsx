'use client';

import { useState } from 'react';
import { hashPin, isValidPin, newSalt, verifyPin } from '@/lib/auth/pin';
import { exportBackup, importBackup, parseBackup, type BackupFile } from '@/lib/db/backup';
import { getSettings, saveSettings, wipeAll, type AppSettings, type ClassRecord } from '@/lib/db/repo';

const IDLE_CHOICES = [1, 3, 5, 10, 15, 30];
const button = 'rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold hover:bg-slate-50';
const field = 'rounded border border-slate-300 px-2 py-1';
const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4';

function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function download(data: BackupFile) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `자리배치-백업-${localDate()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function BackupPanel({
  cls,
  classes,
  idleMinutes,
  onIdleMinutesChange,
  onImported,
  onWiped,
}: {
  /** Current class, or null on first run (import only). */
  cls: ClassRecord | null;
  classes: ClassRecord[];
  idleMinutes: number;
  onIdleMinutesChange: (minutes: number) => void;
  onImported: () => void;
  onWiped: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [pins, setPins] = useState({ current: '', next: '', again: '' });
  const [pinMessage, setPinMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const report = (ok: boolean, text: string) => {
    setMessage(ok ? text : null);
    setError(ok ? null : text);
  };

  const exportData = async (ids?: string[]) => {
    try {
      download(await exportBackup(ids));
      report(true, '백업 파일을 저장했어요');
    } catch {
      report(false, '백업 파일을 만들지 못했어요');
    }
  };

  const runImport = async (data: BackupFile, mode: 'overwrite' | 'add-new') => {
    setPending(null);
    try {
      await importBackup(data, mode);
    } catch {
      return report(false, '가져오지 못했어요. 파일을 확인해 주세요');
    }
    report(true, `학급 ${data.classes.length}개를 가져왔어요`);
    onImported();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPending(null);
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) return report(false, parsed.error);
    const existing = new Set(classes.map((c) => c.id));
    if (parsed.data.classes.some((c) => existing.has(c.id))) {
      setMessage(null);
      setError(null);
      setPending(parsed.data);
    } else {
      await runImport(parsed.data, 'overwrite');
    }
  };

  const changePin = async () => {
    const fail = (text: string) => setPinMessage({ ok: false, text });
    if (!(await verifyPin(pins.current, await getSettings()))) return fail('지금 PIN이 맞지 않아요');
    if (!isValidPin(pins.next)) return fail('새 PIN은 숫자 4자리로 입력해 주세요');
    if (pins.next !== pins.again) return fail('새 PIN 두 개가 달라요');
    const salt = newSalt();
    await saveSettings({ pinSalt: salt, pinHash: await hashPin(pins.next, salt) });
    setPins({ current: '', next: '', again: '' });
    setPinMessage({ ok: true, text: 'PIN을 바꿨어요' });
  };

  const changeIdle = async (minutes: number) => {
    await saveSettings({ idleMinutes: minutes });
    onIdleMinutesChange(minutes);
  };

  const wipe = async () => {
    if (!window.confirm('모든 학급, 명단, 기록, PIN을 지울까요? 되돌릴 수 없어요.')) return;
    if (!window.confirm('정말 지울까요? 백업 파일이 없으면 다시 찾을 수 없어요.')) return;
    await wipeAll();
    onWiped();
  };

  const pinInput = (key: keyof typeof pins, label: string) => (
    <input
      aria-label={label}
      placeholder={label}
      type="password"
      inputMode="numeric"
      maxLength={4}
      autoComplete="off"
      className={`${field} w-28 text-center`}
      value={pins[key]}
      onChange={(e) => {
        setPins((p) => ({ ...p, [key]: e.target.value }));
        setPinMessage(null);
      }}
    />
  );

  return (
    <div className="space-y-5">
      {(message || error) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`rounded px-3 py-2 ${error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
        >
          {error ?? message}
        </p>
      )}

      <section className={card}>
        <h2 className="text-lg font-bold">백업 내보내기</h2>
        <p className="text-amber-800">학생 정보가 들어 있으니 안전하게 보관하세요.</p>
        <div className="flex flex-wrap gap-3">
          {cls && (
            <button type="button" className={button} onClick={() => void exportData([cls.id])}>
              현재 학급 내보내기
            </button>
          )}
          <button type="button" className={button} onClick={() => void exportData()}>
            전체 내보내기
          </button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">백업 가져오기</h2>
        <input
          aria-label="백업 파일"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {pending && (
          <div className="space-y-2 rounded bg-amber-50 p-3">
            <p>이미 있는 학급이 들어 있어요. 어떻게 할까요?</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={button} onClick={() => void runImport(pending, 'overwrite')}>
                덮어쓰기
              </button>
              <button type="button" className={button} onClick={() => void runImport(pending, 'add-new')}>
                새 학급으로 추가
              </button>
              <button type="button" className={button} onClick={() => setPending(null)}>
                취소
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">PIN 바꾸기</h2>
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void changePin();
          }}
        >
          {pinInput('current', '지금 PIN')}
          {pinInput('next', '새 PIN')}
          {pinInput('again', '새 PIN 다시')}
          <button type="submit" className={button}>
            바꾸기
          </button>
        </form>
        {pinMessage && (
          <p role={pinMessage.ok ? 'status' : 'alert'} className={pinMessage.ok ? 'text-emerald-700' : 'text-red-700'}>
            {pinMessage.text}
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">자동 잠금</h2>
        <label className="flex items-center gap-2">
          아무 조작이 없으면
          <select
            aria-label="자동 잠금 시간"
            className={field}
            value={idleMinutes}
            onChange={(e) => void changeIdle(Number(e.target.value))}
          >
            {[...new Set([...IDLE_CHOICES, idleMinutes])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {m}분
                </option>
              ))}
          </select>
          뒤에 잠가요
        </label>
      </section>

      <section className={`${card} border-red-200`}>
        <h2 className="text-lg font-bold text-red-800">모든 데이터 지우기</h2>
        <p className="text-sm text-slate-600">학급, 명단, 기록, PIN이 모두 지워져요. 먼저 백업해 두세요.</p>
        <button
          type="button"
          className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
          onClick={() => void wipe()}
        >
          모든 데이터 지우기
        </button>
      </section>
    </div>
  );
}
