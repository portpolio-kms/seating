import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HistoryPanel } from '@/components/teacher/HistoryPanel';
import { addSeatingRecord, listSeatingRecords, wipeAll, type ClassRecord } from '@/lib/db/repo';

const cls: ClassRecord = {
  id: 'c1',
  name: '6학년 1반',
  // s2 (나래) was deleted from the roster after the record was confirmed.
  students: [{ id: 's1', number: 1, name: '가온', gender: null }],
  layout: { mode: 'pair', rows: 1, cols: 1, groupSize: 4, disabledSeats: [] },
  constraints: [],
  genderRule: false,
  lastRevealStyle: 'A',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const record = (id: string, createdAt: string) => ({
  id,
  classId: 'c1',
  createdAt,
  layout: cls.layout,
  assignment: { 'u0-0-s0': 's1', 'u0-0-s1': 's2' },
  studentNames: { s1: '가온', s2: '나래' },
});

beforeEach(async () => {
  await wipeAll();
});

describe('HistoryPanel', () => {
  it('lists newest first and shows deleted students as "(삭제된 학생)"', async () => {
    await addSeatingRecord(record('r1', '2026-03-02T09:00:00.000Z'));
    await addSeatingRecord(record('r2', '2026-04-06T09:00:00.000Z'));
    render(<HistoryPanel cls={cls} />);
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('4월');
    fireEvent.click(screen.getAllByRole('button', { name: '열기' })[0]);
    expect(screen.getAllByTestId('seat-u0-0-s0')[0]).toHaveTextContent('가온');
    expect(screen.getAllByTestId('seat-u0-0-s1')[0]).toHaveTextContent('(삭제된 학생)');
  });

  it('deletes a record after confirmation', async () => {
    await addSeatingRecord(record('r1', '2026-03-02T09:00:00.000Z'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<HistoryPanel cls={cls} />);
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
    await waitFor(async () => expect(await listSeatingRecords('c1')).toHaveLength(0));
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0));
  });

  it('prints with the chosen orientation', async () => {
    await addSeatingRecord(record('r1', '2026-03-02T09:00:00.000Z'));
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<HistoryPanel cls={cls} />);
    fireEvent.click(await screen.findByRole('button', { name: '열기' }));
    fireEvent.change(screen.getByLabelText('인쇄 방향'), { target: { value: 'teacher' } });
    fireEvent.click(screen.getByRole('button', { name: '인쇄' }));
    expect(print).toHaveBeenCalled();
  });
});
