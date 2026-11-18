'use client';

import { useState } from 'react';
import type { ClassRecord } from '@/lib/db/repo';
import { displayName } from '@/lib/roster';
import { canAddConstraint, validateConstraints } from '@/lib/seating/constraints';
import type { ConstraintKind } from '@/lib/seating/types';

const field = 'rounded border border-slate-300 px-2 py-1';

const KINDS: { kind: ConstraintKind; label: string }[] = [
  { kind: 'avoid-pair', label: '🚫 짝 금지' },
  { kind: 'avoid-group', label: '🚫 모둠 금지' },
  { kind: 'must-pair', label: '🤝 반드시 짝' },
  { kind: 'must-group', label: '🤝 반드시 같은 모둠' },
];

const HELP: { label: string; pair: string; group: string }[] = [
  { label: '짝 금지', pair: '같은 책상 불가', group: '제한 없음' },
  { label: '모둠 금지', pair: '같은 책상 불가', group: '같은 모둠 불가' },
  { label: '반드시 짝', pair: '같은 책상', group: '같은 모둠' },
  { label: '반드시 같은 모둠', pair: '같은 책상', group: '같은 모둠' },
];

export function ConstraintEditor({ cls, onChange }: { cls: ClassRecord; onChange: (c: ClassRecord) => void }) {
  const sorted = [...cls.students].sort((x, y) => x.number - y.number);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [kind, setKind] = useState<ConstraintKind>('avoid-pair');
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => {
    const s = cls.students.find((x) => x.id === id);
    return s ? displayName(s, cls.students) : id;
  };

  const add = () => {
    const msg = a === '' || b === '' ? '두 학생을 모두 골라 주세요' : canAddConstraint(cls.constraints, { a, b, kind });
    setError(msg);
    if (msg) return;
    onChange({ ...cls, constraints: [...cls.constraints, { id: crypto.randomUUID(), a, b, kind }] });
    setA('');
    setB('');
  };

  const remove = (id: string) => onChange({ ...cls, constraints: cls.constraints.filter((c) => c.id !== id) });

  const problems = validateConstraints(cls.students, cls.constraints, cls.layout);

  const studentSelect = (label: string, value: string, set: (v: string) => void) => (
    <select aria-label={label} className={field} value={value} onChange={(e) => set(e.target.value)}>
      <option value="">{label}</option>
      {sorted.map((s) => (
        <option key={s.id} value={s.id}>
          {displayName(s, cls.students)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {studentSelect('학생 1', a, setA)}
        {studentSelect('학생 2', b, setB)}
        <select aria-label="종류" className={field} value={kind} onChange={(e) => setKind(e.target.value as ConstraintKind)}>
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <button type="button" className="rounded bg-blue-600 px-3 py-1 text-white" onClick={add}>
          추가
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {KINDS.map((k) => {
        const items = cls.constraints.filter((c) => c.kind === k.kind);
        if (items.length === 0) return null;
        return (
          <section key={k.kind}>
            <h3 className="font-semibold">{k.label}</h3>
            <ul className="space-y-1">
              {items.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span>
                    {nameOf(c.a)} - {nameOf(c.b)}
                  </span>
                  <button type="button" className="text-red-600 underline" onClick={() => remove(c.id)}>
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div>
        {problems.length === 0 ? (
          <p className="rounded bg-green-100 px-3 py-2 text-green-900">현재 설정으로 배치할 수 있어요</p>
        ) : (
          <div className="rounded bg-amber-100 px-3 py-2 text-amber-900">
            {problems.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
      </div>

      <table className="w-full text-left text-sm">
        <caption className="text-left font-semibold">조건이 적용되는 방식</caption>
        <thead>
          <tr>
            <th />
            <th>짝 모드</th>
            <th>모둠 모드</th>
          </tr>
        </thead>
        <tbody>
          {HELP.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.pair}</td>
              <td>{r.group}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
