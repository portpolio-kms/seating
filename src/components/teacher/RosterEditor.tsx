'use client';

import { useState } from 'react';
import type { ClassRecord } from '@/lib/db/repo';
import { DraftInput } from './DraftInput';
import { parseRosterText } from '@/lib/roster';
import type { Gender, Student } from '@/lib/seating/types';

const field = 'rounded border border-slate-300 px-2 py-1';

export function RosterEditor({ cls, onChange }: { cls: ClassRecord; onChange: (c: ClassRecord) => void }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const setStudents = (students: Student[]) => onChange({ ...cls, students });
  const edit = (id: string, patch: Partial<Student>) =>
    setStudents(cls.students.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const names = cls.students.map((s) => s.name).filter((n) => n !== '');
  const hasDup = new Set(names).size !== names.length;

  const addRow = () => {
    const next = Math.max(0, ...cls.students.map((s) => s.number)) + 1;
    setStudents([...cls.students, { id: crypto.randomUUID(), number: next, name: '', gender: null }]);
  };

  const remove = (s: Student) => {
    if (!window.confirm(`${s.name || `${s.number}번`} 학생을 삭제할까요? 이 학생이 들어간 쌍 조건도 함께 지워져요.`)) return;
    onChange({
      ...cls,
      students: cls.students.filter((x) => x.id !== s.id),
      constraints: cls.constraints.filter((c) => c.a !== s.id && c.b !== s.id),
    });
  };

  const addPasted = () => {
    const { rows, errors: errs } = parseRosterText(text);
    setErrors(errs);
    if (errs.length > 0 || rows.length === 0) return;
    const used = new Set(cls.students.map((s) => s.number));
    const added: Student[] = rows.map((r) => {
      let n = r.number;
      while (used.has(n)) n++;
      used.add(n);
      return { id: crypto.randomUUID(), number: n, name: r.name, gender: r.gender };
    });
    setStudents([...cls.students, ...added]);
    setText('');
    setPasting(false);
  };

  return (
    <div className="space-y-3">
      {hasDup && (
        <p role="alert" className="rounded bg-amber-100 px-3 py-2 text-amber-900">
          같은 이름의 학생이 있어요. 화면에는 이름 뒤에 번호가 함께 표시돼요.
        </p>
      )}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-20">번호</th>
            <th>이름</th>
            <th className="w-28">성별</th>
            <th className="w-20" />
          </tr>
        </thead>
        <tbody>
          {cls.students.map((s) => (
            <tr key={s.id}>
              <td>
                <DraftInput
                  aria-label={`${s.number}번 번호`}
                  type="number"
                  min={1}
                  className={`${field} w-16`}
                  value={String(s.number)}
                  onCommit={(raw) => {
                    const n = Math.round(Number(raw));
                    if (raw.trim() !== '' && n >= 1) edit(s.id, { number: n });
                  }}
                />
              </td>
              <td>
                <DraftInput
                  aria-label={`${s.number}번 이름`}
                  className={`${field} w-full`}
                  value={s.name}
                  onCommit={(raw) => edit(s.id, { name: raw.trim() })}
                />
              </td>
              <td>
                <select
                  aria-label={`${s.number}번 성별`}
                  className={field}
                  value={s.gender ?? ''}
                  onChange={(e) => edit(s.id, { gender: (e.target.value || null) as Gender })}
                >
                  <option value="">-</option>
                  <option value="M">남</option>
                  <option value="F">여</option>
                </select>
              </td>
              <td>
                <button type="button" className="text-red-600 underline" onClick={() => remove(s)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-3">
        <button type="button" className="rounded border border-slate-300 px-3 py-1" onClick={addRow}>
          학생 추가
        </button>
        <button type="button" className="rounded border border-slate-300 px-3 py-1" onClick={() => setPasting((v) => !v)}>
          붙여넣기로 추가
        </button>
      </div>
      {pasting && (
        <div className="space-y-2">
          <textarea
            aria-label="붙여넣기"
            rows={6}
            className={`${field} w-full`}
            value={text}
            placeholder="번호, 이름, 성별 (탭 또는 쉼표). 이름만 붙여넣어도 돼요."
            onChange={(e) => setText(e.target.value)}
          />
          {errors.map((e) => (
            <p key={e} role="alert" className="text-sm text-red-600">
              {e}
            </p>
          ))}
          <button type="button" className="rounded bg-blue-600 px-3 py-1 text-white" onClick={addPasted}>
            추가
          </button>
        </div>
      )}
    </div>
  );
}
