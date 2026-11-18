import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConstraintEditor } from '@/components/teacher/ConstraintEditor';
import type { ClassRecord } from '@/lib/db/repo';

const make = (layout?: Partial<ClassRecord['layout']>): ClassRecord => ({
  id: 'c1', name: '테스트반',
  students: ['가온', '나래', '다온', '라희'].map((name, i) => ({ id: `s${i}`, number: i + 1, name, gender: null })),
  layout: { mode: 'pair', rows: 2, cols: 2, groupSize: 4, disabledSeats: [], ...layout },
  constraints: [], genderRule: false, lastRevealStyle: 'A', createdAt: '2026-01-01',
});

function Harness({ initial, spy }: { initial: ClassRecord; spy?: (c: ClassRecord) => void }) {
  const [cls, setCls] = useState(initial);
  return <ConstraintEditor cls={cls} onChange={(c) => { spy?.(c); setCls(c); }} />;
}

const add = (a: string, b: string, kind: string) => {
  fireEvent.change(screen.getByLabelText('학생 1'), { target: { value: a } });
  fireEvent.change(screen.getByLabelText('학생 2'), { target: { value: b } });
  fireEvent.change(screen.getByLabelText('종류'), { target: { value: kind } });
  fireEvent.click(screen.getByRole('button', { name: '추가' }));
};

describe('ConstraintEditor', () => {
  it('rejects a second must-pair for the same student with a message', () => {
    const spy = vi.fn();
    render(<Harness initial={make()} spy={spy} />);
    add('s0', 's1', 'must-pair');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    add('s0', 's2', 'must-pair');
    expect(screen.getByRole('alert')).toHaveTextContent('이미 반드시 짝인 친구가 있는 학생이에요');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('shows conflict messages at the bottom', () => {
    const cls = make({ mode: 'group' });
    cls.constraints = [
      { id: 'k1', a: 's0', b: 's1', kind: 'must-group' },
      { id: 'k2', a: 's1', b: 's2', kind: 'must-group' },
      { id: 'k3', a: 's0', b: 's2', kind: 'avoid-group' },
    ];
    render(<ConstraintEditor cls={cls} onChange={() => {}} />);
    expect(screen.getByText(/떨어져야 하는 조건도 있어요/)).toBeInTheDocument();
    expect(screen.queryByText('현재 설정으로 배치할 수 있어요')).toBeNull();
  });
  it('shows the ok message when fine, and the help table', () => {
    render(<ConstraintEditor cls={make()} onChange={() => {}} />);
    expect(screen.getByText('현재 설정으로 배치할 수 있어요')).toBeInTheDocument();
    expect(screen.getAllByText('같은 책상 불가').length).toBeGreaterThan(0);
  });
  it('deletes a constraint', () => {
    const cls = make();
    cls.constraints = [{ id: 'k1', a: 's0', b: 's1', kind: 'avoid-pair' }];
    const onChange = vi.fn();
    render(<ConstraintEditor cls={cls} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onChange.mock.calls[0][0].constraints).toEqual([]);
  });
});
