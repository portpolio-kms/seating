'use client';

import { useEffect, useState } from 'react';
import { SeatingChart } from '@/components/SeatingChart';
import type { StageView } from '@/lib/channel';
import { deleteSeatingRecord, listSeatingRecords, type ClassRecord, type SeatingRecord } from '@/lib/db/repo';
import { buildUnits } from '@/lib/seating/layout';

const DELETED = '(삭제된 학생)';
const button = 'rounded border border-slate-300 bg-white px-3 py-1 font-semibold hover:bg-slate-50';

/** Teacher-only chart of a past record: snapshot names, students no longer on the roster shown as deleted. */
function recordStage(cls: ClassRecord, rec: SeatingRecord): StageView {
  const current = new Set(cls.students.map((s) => s.id));
  return {
    className: cls.name,
    mode: rec.layout.mode,
    rows: rec.layout.rows,
    cols: rec.layout.cols,
    units: buildUnits(rec.layout).map((u) => ({
      id: u.id,
      row: u.row,
      col: u.col,
      seats: u.seats.map((seatId) => {
        const sid = rec.assignment[seatId];
        if (!sid) return { seatId, name: null };
        return { seatId, name: current.has(sid) ? (rec.studentNames[sid] ?? DELETED) : DELETED };
      }),
    })),
  };
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function HistoryPanel({ cls }: { cls: ClassRecord }) {
  const [records, setRecords] = useState<SeatingRecord[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'front' | 'teacher'>('front');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSeatingRecords(cls.id)
      .then((rs) => !cancelled && setRecords(rs))
      .catch(() => !cancelled && setError('기록을 불러오지 못했어요'));
    return () => {
      cancelled = true;
    };
  }, [cls.id]);

  const remove = async (rec: SeatingRecord) => {
    if (!window.confirm(`${dateLabel(rec.createdAt)} 기록을 지울까요?`)) return;
    try {
      await deleteSeatingRecord(rec.id);
    } catch {
      setError('기록을 지우지 못했어요');
      return;
    }
    setRecords((rs) => rs?.filter((r) => r.id !== rec.id) ?? null);
    if (openId === rec.id) setOpenId(null);
  };

  const open = records?.find((r) => r.id === openId) ?? null;
  const stage = open ? recordStage(cls, open) : null;

  if (records === null) return error ? <p role="alert">{error}</p> : null;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-red-800">
          {error}
        </p>
      )}
      {records.length === 0 && <p className="text-slate-500">아직 확정한 자리 배치가 없어요.</p>}
      <ul className="space-y-2">
        {records.map((r) => (
          <li
            key={r.id}
            className={`flex items-center gap-3 rounded border px-3 py-2 ${r.id === openId ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
          >
            <span className="flex-1">{dateLabel(r.createdAt)}</span>
            <button type="button" className={button} onClick={() => setOpenId(r.id)}>
              열기
            </button>
            <button type="button" className={button} onClick={() => void remove(r)}>
              삭제
            </button>
          </li>
        ))}
      </ul>

      {open && stage && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold">{dateLabel(open.createdAt)}</h2>
            <label className="flex items-center gap-2">
              인쇄 방향
              <select
                aria-label="인쇄 방향"
                className="rounded border border-slate-300 px-2 py-1"
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as 'front' | 'teacher')}
              >
                <option value="front">칠판 쪽에서 보기</option>
                <option value="teacher">교사 쪽에서 보기</option>
              </select>
            </label>
            <button type="button" className={button} onClick={() => window.print()}>
              인쇄
            </button>
          </div>
          <SeatingChart stage={stage} size="small" orientation={orientation} />
          {/* Only this block is printed (see @media print in globals.css). */}
          <div className="print-area hidden print:block">
            <h1 className="mb-4 text-center text-xl font-bold">
              {cls.name} 자리 배치 ({dateLabel(open.createdAt)})
            </h1>
            <SeatingChart stage={stage} size="print" orientation={orientation} />
          </div>
        </section>
      )}
    </div>
  );
}
