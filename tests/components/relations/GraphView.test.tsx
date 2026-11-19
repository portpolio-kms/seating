import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GraphView } from '@/components/relations/GraphView';
import { analyzeSurvey, buildGraph, buildRadar } from '@/lib/survey/analyze';
import { analysisFixture } from '../../lib/survey/fixture';

type VisData = { nodes: { id: string }[]; edges: { from: string; to: string; dashes: boolean; arrows?: string }[] };
const h = vi.hoisted(() => ({
  ctorData: [] as unknown[],
  setData: vi.fn(),
  moveNode: vi.fn(),
  destroy: vi.fn(),
  handlers: {} as Record<string, (p: unknown) => void>,
}));

vi.mock('vis-network/standalone', () => ({
  Network: class {
    constructor(_el: unknown, data: unknown) {
      h.ctorData.push(data);
    }
    on(ev: string, fn: (p: unknown) => void) {
      h.handlers[ev] = fn;
    }
    setData = h.setData;
    setOptions = vi.fn();
    moveNode = h.moveNode;
    fit = vi.fn();
    destroy = h.destroy;
  },
}));

beforeEach(() => {
  h.ctorData.length = 0;
  h.setData.mockClear();
  h.moveNode.mockClear();
  h.destroy.mockClear();
  for (const k of Object.keys(h.handlers)) delete h.handlers[k];
});

const mounted = async (ui: React.ReactElement) => {
  const view = render(ui);
  await waitFor(() => expect(h.ctorData.length).toBe(1));
  return view;
};

describe('GraphView', () => {
  it('creates a network with every student and the mutual pairs', async () => {
    const { cls, result } = analysisFixture();
    await mounted(<GraphView cls={cls} survey={result} openCard={vi.fn()} />);
    const data = h.ctorData[0] as VisData;
    const m = analyzeSurvey(result, cls);
    const expected = buildGraph(result, cls, m, buildRadar(result, cls, m).items, 'mutual').edges.length;
    expect(data.nodes).toHaveLength(cls.students.length);
    expect(expected).toBeGreaterThan(0);
    expect(data.edges).toHaveLength(expected);
    expect(screen.getByText('보라 실선: 서로 친함 · 점선: 한쪽만 좋아함 · 빨강 점선: 함께 있기 힘듦')).toBeInTheDocument();
  });

  it('redraws with only hard edges when the filter changes', async () => {
    const { cls, result } = analysisFixture();
    await mounted(<GraphView cls={cls} survey={result} openCard={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('선 필터'), { target: { value: 'hard' } });
    expect(h.setData).toHaveBeenCalledTimes(1);
    const data = h.setData.mock.calls[0][0] as VisData;
    expect(data.edges).toHaveLength(3); // s1->s4, s2->s4, s4->s1 (deleted sx ignored)
    expect(data.edges.every((e) => e.dashes && e.arrows === 'to')).toBe(true);
  });

  it('shows the student panel on node click and opens the card', async () => {
    const { cls, result } = analysisFixture();
    const openCard = vi.fn();
    await mounted(<GraphView cls={cls} survey={result} openCard={openCard} />);
    act(() => h.handlers.click({ nodes: ['s1'] }));
    expect(screen.getByRole('heading', { name: '가온' })).toBeInTheDocument();
    expect(screen.getByText('서로 친함 1명')).toBeInTheDocument();
    expect(screen.getByText('지목받음 1명')).toBeInTheDocument();
    expect(h.moveNode).toHaveBeenCalledWith('s1', 0, 0);
    expect(h.moveNode).toHaveBeenCalledWith('s2', expect.any(Number), expect.any(Number));
    fireEvent.click(screen.getByRole('button', { name: '상담 카드 열기' }));
    expect(openCard).toHaveBeenCalledWith('s1');
    fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
    expect(screen.queryByRole('button', { name: '상담 카드 열기' })).toBeNull();
  });

  it('draws no edges for a survey without responses', async () => {
    const { cls, result } = analysisFixture();
    await mounted(<GraphView cls={cls} survey={{ ...result, responses: {} }} openCard={vi.fn()} />);
    const data = h.ctorData[0] as VisData;
    expect(data.nodes).toHaveLength(cls.students.length);
    expect(data.edges).toHaveLength(0);
  });

  it('destroys the network on unmount', async () => {
    const { cls, result } = analysisFixture();
    const view = await mounted(<GraphView cls={cls} survey={result} openCard={vi.fn()} />);
    view.unmount();
    expect(h.destroy).toHaveBeenCalled();
  });
});
