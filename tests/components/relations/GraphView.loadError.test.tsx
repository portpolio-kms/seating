import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GraphView } from '@/components/relations/GraphView';
import { analysisFixture } from '../../lib/survey/fixture';

// The graph library chunk fails to load (e.g. removed by a new deployment).
vi.mock('vis-network/standalone', () => {
  throw new Error('chunk load failed');
});

describe('GraphView when the graph library cannot load', () => {
  it('asks to reload the page', async () => {
    const { cls, result } = analysisFixture();
    render(<GraphView cls={cls} survey={result} openCard={vi.fn()} />);
    expect(await screen.findByText('그래프를 불러오지 못했어요. 페이지를 새로 고쳐 주세요')).toBeInTheDocument();
  });
});
