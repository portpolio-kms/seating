import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LayoutEditor } from '@/components/teacher/LayoutEditor';
import { RosterEditor } from '@/components/teacher/RosterEditor';
import type { ClassRecord } from '@/lib/db/repo';

const names = ['가온', '나래', '다온', '라희', '마루', '바다', '사랑', '아라', '자람'];
const make = (ns: string[], layout?: Partial<ClassRecord['layout']>): ClassRecord => ({
  id: 'c1', name: '테스트반',
  students: ns.map((name, i) => ({ id: `s${i}`, number: i + 1, name, gender: null })),
  layout: { mode: 'pair', rows: 2, cols: 2, groupSize: 4, disabledSeats: [], ...layout },
  constraints: [], genderRule: false, lastRevealStyle: 'A', createdAt: '2026-01-01',
});

describe('LayoutEditor', () => {
  it('shows shortage and no save button', () => {
    render(<LayoutEditor cls={make(names)} onChange={() => {}} />);
    expect(screen.getByText(/자리가 1개 부족해요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });
  it('saves when valid and toggles disabled seat on click', () => {
    const onChange = vi.fn();
    render(<LayoutEditor cls={make(names.slice(0, 3))} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('seat-u0-0-s0'));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onChange.mock.calls[0][0].layout.disabledSeats).toEqual(['u0-0-s0']);
  });
  it('drops disabled seats that no longer exist when shrinking', () => {
    const onChange = vi.fn();
    render(<LayoutEditor cls={make([], { disabledSeats: ['u1-1-s0', 'u0-0-s1'] })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('줄'), { target: { value: '1' } });
    expect(onChange.mock.calls[0][0].layout.disabledSeats).toEqual(['u0-0-s1']);
  });
});

describe('RosterEditor', () => {
  it('warns about duplicate names', () => {
    render(<RosterEditor cls={make(['가온', '가온', '나래'])} onChange={() => {}} />);
    expect(screen.getByText(/같은 이름의 학생이 있어요/)).toBeInTheDocument();
  });
  it('appends pasted rows', () => {
    const onChange = vi.fn();
    render(<RosterEditor cls={make(['가온'])} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기로 추가' }));
    fireEvent.change(screen.getByLabelText('붙여넣기'), { target: { value: '나래\n다온' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    const students = onChange.mock.calls[0][0].students;
    expect(students.map((s: { name: string; number: number }) => [s.number, s.name])).toEqual([[1, '가온'], [2, '나래'], [3, '다온']]);
  });
});
