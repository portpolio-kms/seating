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
const setBlur = (el: HTMLElement, v: string) => {
  fireEvent.change(el, { target: { value: v } });
  fireEvent.blur(el);
};

describe('LayoutEditor', () => {
  it('shows shortage and no save button', () => {
    render(<LayoutEditor cls={make(names)} onChange={() => {}} />);
    expect(screen.getByText(/자리가 1개 부족해요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });
  it('never calls onChange for an invalid draft; saves only on 저장', () => {
    const onChange = vi.fn();
    render(<LayoutEditor cls={make(names.slice(0, 3))} onChange={onChange} />);
    setBlur(screen.getByLabelText('줄'), '1');
    setBlur(screen.getByLabelText('분단'), '1');
    expect(screen.getByText(/자리가 1개 부족해요/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    setBlur(screen.getByLabelText('분단'), '2');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].layout).toMatchObject({ rows: 1, cols: 2 });
    expect(screen.getByText('저장됨')).toBeInTheDocument();
  });
  it('toggles disabled seat and saves it', () => {
    const onChange = vi.fn();
    render(<LayoutEditor cls={make(names.slice(0, 3))} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('seat-u0-0-s0'));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onChange.mock.calls[0][0].layout.disabledSeats).toEqual(['u0-0-s0']);
  });
  it('drops disabled seats that no longer exist when shrinking', () => {
    const onChange = vi.fn();
    render(<LayoutEditor cls={make([], { disabledSeats: ['u1-1-s0', 'u0-0-s1'] })} onChange={onChange} />);
    setBlur(screen.getByLabelText('줄'), '1');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onChange.mock.calls[0][0].layout.disabledSeats).toEqual(['u0-0-s1']);
  });
  it('lets a number be cleared and retyped', () => {
    const onChange = vi.fn();
    render(<LayoutEditor cls={make([])} onChange={onChange} />);
    const rows = screen.getByLabelText('줄') as HTMLInputElement;
    fireEvent.change(rows, { target: { value: '' } });
    expect(rows.value).toBe('');
    fireEvent.change(rows, { target: { value: '5' } });
    expect(rows.value).toBe('5');
    fireEvent.blur(rows);
    expect(rows.value).toBe('5');
  });
});

describe('RosterEditor', () => {
  it('warns about duplicate names but not empty names', () => {
    const { unmount } = render(<RosterEditor cls={make(['가온', '가온', '나래'])} onChange={() => {}} />);
    expect(screen.getByText(/같은 이름의 학생이 있어요/)).toBeInTheDocument();
    unmount();
    render(<RosterEditor cls={make(['', '', '나래'])} onChange={() => {}} />);
    expect(screen.queryByText(/같은 이름의 학생이 있어요/)).toBeNull();
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
  it('adds nothing when the paste has errors and keeps the text', () => {
    const onChange = vi.fn();
    render(<RosterEditor cls={make(['가온'])} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기로 추가' }));
    fireEvent.change(screen.getByLabelText('붙여넣기'), { target: { value: '2\t나래\nx\t다온' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText('붙여넣기') as HTMLTextAreaElement).value).toBe('2\t나래\nx\t다온');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('keeps inner spaces while typing and trims on blur', () => {
    const onChange = vi.fn();
    render(<RosterEditor cls={make(['가온'])} onChange={onChange} />);
    const input = screen.getByLabelText('1번 이름') as HTMLInputElement;
    fireEvent.change(input, { target: { value: ' Kim Ana ' } });
    expect(input.value).toBe(' Kim Ana ');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange.mock.calls[0][0].students[0].name).toBe('Kim Ana');
  });
  it('lets the number be cleared and retyped', () => {
    const onChange = vi.fn();
    render(<RosterEditor cls={make(['가온'])} onChange={onChange} />);
    const input = screen.getByLabelText('1번 번호') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(onChange.mock.calls[0][0].students[0].number).toBe(5);
  });
  it('deletes locally with their constraints, keeping others', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChange = vi.fn();
    const cls = make(['가온', '나래', '다온']);
    cls.constraints = [
      { id: 'k1', a: 's0', b: 's1', kind: 'avoid-pair' },
      { id: 'k2', a: 's1', b: 's2', kind: 'avoid-pair' },
      { id: 'k3', a: 's2', b: 's0', kind: 'must-pair' },
    ];
    render(<RosterEditor cls={cls} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    const out = onChange.mock.calls[0][0] as ClassRecord;
    expect(out.students.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(out.constraints.map((c) => c.id)).toEqual(['k2']);
  });
});
