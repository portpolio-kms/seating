'use client';

import { useRef, useState } from 'react';
import type { ClassRecord } from '@/lib/db/repo';
import { saveSurvey } from '@/lib/db/surveys';
import { importSurveyCsv, type ImportPreview } from '@/lib/survey/importCsv';
import type { SurveyResult } from '@/lib/survey/types';

function defaultName(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 설문`;
}

export function SurveyUpload({ cls, onSaved }: { cls: ClassRecord; onSaved: (s: SurveyResult) => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const requestRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const labelOf = (id: string) => preview?.result?.labels[id] ?? id;

  const onFile = async (file: File | undefined) => {
    const request = ++requestRef.current;
    setSaved(false);
    setError(null);
    setPreview(null);
    if (!file) return;
    let result: ImportPreview;
    try {
      result = importSurveyCsv(await file.text(), cls);
    } catch {
      if (request !== requestRef.current) return;
      setError('파일을 읽을 수 없어요');
      resetInput();
      return;
    }
    if (request !== requestRef.current) return; // a newer file was picked meanwhile
    setPreview(result);
  };

  const save = async () => {
    if (!preview?.ok || !preview.result || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const survey: SurveyResult = {
      ...preview.result,
      id: crypto.randomUUID(),
      name: name.trim() || defaultName(),
      importedAt: new Date().toISOString(),
    };
    try {
      await saveSurvey(survey);
    } catch {
      setError('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
      savingRef.current = false;
      setSaving(false);
      return;
    }
    savingRef.current = false;
    setSaving(false);
    setPreview(null);
    setSaved(true);
    resetInput();
    onSaved(survey);
  };

  return (
    <section className="space-y-3">
      <h3 className="font-bold">결과 올리기</h3>
      <label className="flex flex-col gap-1 text-sm">
        설문 결과 CSV 파일
        <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>

      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-red-800">{error}</p>}

      {preview && !preview.ok && (
        <div role="alert" className="space-y-1 rounded bg-red-50 px-3 py-2 text-red-800">
          <p>{preview.error}</p>
          {preview.missing && preview.missing.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {preview.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {preview?.ok && (
        <div className="space-y-2">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>응답 {preview.responded.length}명</li>
            <li>
              응답하지 않은 학생 {preview.notResponded.length}명
              {preview.notResponded.length > 0 && `: ${preview.notResponded.map(labelOf).join(', ')}`}
            </li>
            {preview.unmatched.length > 0 && <li>명단에 없는 응답: {preview.unmatched.join(', ')}</li>}
            {preview.duplicates.length > 0 && (
              <li>중복 응답(마지막 응답만 사용): {preview.duplicates.map(labelOf).join(', ')}</li>
            )}
          </ul>
          <label className="flex flex-col gap-1 text-sm">
            설문 이름
            <input
              className="rounded border border-slate-300 px-2 py-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button type="button" className="rounded bg-blue-600 px-4 py-2 font-semibold text-white" disabled={saving} onClick={() => void save()}>
            저장
          </button>
        </div>
      )}

      {saved && (
        <p role="status" className="rounded bg-amber-50 px-3 py-2 text-amber-900">
          내려받은 CSV 파일에는 학생 응답이 들어 있어요. 업로드했으면 지워 주세요.
        </p>
      )}
    </section>
  );
}
