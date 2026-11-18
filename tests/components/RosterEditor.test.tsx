import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RosterEditor } from '@/components/teacher/RosterEditor';
import type { ClassRecord } from '@/lib/db/repo';

const cls: ClassRecord = {
  id: 'c1',
  name: '6학년 1반',
  students: [
    { id: 's1', number: 1, name: '가온', gender: null },
    { id: 's2', number: 2, name: '나래', gender: null },
  ],
  layout: { mode: 'pair', rows: 1, cols: 1, groupSize: 4, disabledSeats: [] },
  constraints: [{ id: 'k1', a: 's1', b: 's2', kind: 'avoid-pair' }],
  genderRule: false,
  lastRevealStyle: 'A',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('RosterEditor delete', () => {
  it("warns that the student's pair conditions go too, and removes them on confirm", () => {
    const onChange = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RosterEditor cls={cls} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    expect(confirm).toHaveBeenCalledWith('가온 학생을 삭제할까요? 이 학생이 들어간 쌍 조건도 함께 지워져요.');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ students: [cls.students[1]], constraints: [] }),
    );
    confirm.mockRestore();
  });
});
