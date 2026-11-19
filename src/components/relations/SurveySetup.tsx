'use client';

import { useMemo, useState } from 'react';
import type { ClassRecord } from '@/lib/db/repo';
import { buildAppsScript } from '@/lib/survey/appsScript';

const STEPS = [
  '새 구글 시트를 만듭니다.',
  '확장 프로그램 → Apps Script를 엽니다.',
  '기존 코드를 지우고, 위 코드를 붙여 넣습니다.',
  '▶ 실행 버튼을 누르고, 권한 허용 창이 뜨면 허용합니다.',
  '화면에 나오는 설문 링크를 학생들에게 공유합니다.',
  "응답이 모이면 아래쪽 '설문지 응답 시트1' 탭을 연 상태에서 파일 → 다운로드 → 쉼표로 구분된 값(.csv)을 고릅니다.",
  '"교우관계" 탭에서 CSV 파일을 올립니다.',
];

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function SurveySetup({ cls }: { cls: ClassRecord }) {
  const [defaultTitle] = useState(() => `${cls.name} 교우관계 설문 ${today()}`);
  const [title, setTitle] = useState(defaultTitle);
  const [msg, setMsg] = useState<string | null>(null);
  // A blank title would create an untitled form: fall back to the default title.
  const formTitle = title.trim() || defaultTitle;
  const code = useMemo(() => buildAppsScript(cls, formTitle), [cls, formTitle]);

  if (cls.students.length === 0) {
    return <p className="text-slate-600">명단을 먼저 입력해 주세요</p>;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setMsg('복사했어요');
    } catch {
      setMsg('직접 선택해서 복사해 주세요');
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="font-bold">설문 만들기</h3>
      <label className="flex flex-col gap-1 text-sm">
        설문 제목
        <input
          className="rounded border border-slate-300 px-2 py-1"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setMsg(null);
          }}
        />
      </label>
      <textarea
        readOnly
        aria-label="Apps Script 코드"
        className="h-48 w-full rounded border border-slate-300 p-2 font-mono text-xs"
        value={code}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex items-center gap-3">
        <button type="button" className="rounded bg-slate-800 px-3 py-1 text-white" onClick={copy}>
          복사
        </button>
        {msg && <span role="status" className="text-sm text-slate-600">{msg}</span>}
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </section>
  );
}
