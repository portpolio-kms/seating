import { describe, expect, it } from 'vitest';
import {
  analyzeSurvey,
  buildGraph,
  buildRadar,
  buildSuggestions,
  egoZones,
} from '@/lib/survey/analyze';
import { analysisFixture } from './fixture';

const setup = () => {
  const { cls, result } = analysisFixture();
  const m = analyzeSurvey(result, cls);
  return { cls, result, m };
};

describe('analyzeSurvey', () => {
  it('computes received stats including deleted respondents', () => {
    const { m } = setup();
    expect(Object.keys(m).sort()).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(m.s1.receivedAvg).toBeCloseTo(2.6);
    expect(m.s1.receivedCount).toBe(5);
    expect(m.s1.lowRatio).toBeCloseTo(0.6);
    expect(m.s2.receivedAvg).toBe(3);
    expect(m.s2.lowRatio).toBe(0.5);
    expect(m.s6.receivedCount).toBe(5);
    expect(m.s6.lowRatio).toBeCloseTo(0.4);
    expect(m.s6.responded).toBe(false);
  });
  it('computes mutual / one-sided / nominations / isolatedRef', () => {
    const { m } = setup();
    expect(m.s1.mutual).toEqual(['s2']);
    expect(m.s3.mutual).toEqual(['s5']);
    expect(m.s1.likesOneSided).toEqual(['s3']);
    expect(m.s3.likedByOneSided).toEqual(['s1']);
    expect(m.s1.nominated).toEqual(['s4']);
    expect(m.s1.nominatedBy).toEqual(['s4']); // deleted sx excluded
    expect(m.s4.nominatedBy).toEqual(['s1', 's2']);
    expect(m.s4.isolatedRef).toBe(true);
    expect(m.s2.isolatedRef).toBe(false);
    expect(m.s6.isolatedRef).toBe(false);
  });
});

describe('buildRadar', () => {
  it('flags and orders students with exact reasons', () => {
    const { cls, result, m } = setup();
    const { items, notResponded } = buildRadar(result, cls, m);
    expect(items.map((i) => [i.studentId, i.level])).toEqual([
      ['s2', 'high'],
      ['s4', 'high'],
      ['s1', 'medium'],
      ['s3', 'medium'],
      ['s6', 'medium'],
    ]);
    const by = Object.fromEntries(items.map((i) => [i.studentId, i]));
    expect(by.s2.reasons).toEqual(['자아 만족도 2점']);
    expect(by.s4.reasons).toEqual(['친구 2명이 함께 있기 힘들다고 적음']);
    expect(by.s3.reasons).toEqual(['학교생활 즐거움 2점']);
    expect(by.s6.reasons).toEqual(['받은 점수 중 낮은 점수 40%']);
    expect(by.s6.noResponse).toBe(true);
    expect(notResponded).toEqual(['s6']);
    // s2: 2 of 4 low but fewer than 5 received -> no ratio reason
    expect(by.s2.reasons.some((r) => r.includes('낮은 점수'))).toBe(false);
  });
  it('non-responder nominated by 2 is high with noResponse', () => {
    const { cls, result } = setup();
    result.responses.s3.hard = ['s6'];
    result.responses.s5.hard = ['s6'];
    const m = analyzeSurvey(result, cls);
    const item = buildRadar(result, cls, m).items.find((i) => i.studentId === 's6')!;
    expect(item.level).toBe('high');
    expect(item.noResponse).toBe(true);
  });
  it('empty survey: no items, everyone not responded, empty graph edges', () => {
    const { cls, result } = setup();
    result.responses = {};
    const m = analyzeSurvey(result, cls);
    const radar = buildRadar(result, cls, m);
    expect(radar.items).toEqual([]);
    expect(radar.notResponded).toHaveLength(6);
    for (const f of ['mutual', 'strong', 'hard'] as const) {
      const g = buildGraph(result, cls, m, radar.items, f);
      expect(g.edges).toEqual([]);
      expect(g.nodes).toHaveLength(6);
    }
  });
});

describe('buildSuggestions', () => {
  it('groups hard nominations by pair with mutual flag', () => {
    const { cls, result } = setup();
    expect(buildSuggestions(result, cls)).toEqual([
      { key: 's1|s4', a: 's1', b: 's4', mutual: true, status: 'new' },
      { key: 's2|s4', a: 's2', b: 's4', mutual: false, status: 'new' },
    ]);
  });
  it('marks exists and dismissed', () => {
    const { cls, result } = setup();
    cls.constraints = [{ id: 'k1', a: 's4', b: 's1', kind: 'avoid-pair' } as never];
    result.dismissed = ['s2|s4'];
    expect(buildSuggestions(result, cls).map((x) => x.status)).toEqual(['exists', 'dismissed']);
  });
});

describe('buildGraph', () => {
  it('builds nodes and edges per filter', () => {
    const { cls, result, m } = setup();
    const radar = buildRadar(result, cls, m).items;
    const mut = buildGraph(result, cls, m, radar, 'mutual');
    expect(mut.nodes).toHaveLength(6);
    expect(mut.edges).toEqual([
      { from: 's1', to: 's2', kind: 'mutual' },
      { from: 's3', to: 's5', kind: 'mutual' },
    ]);
    expect(mut.nodes.find((n) => n.id === 's1')!.size).toBeCloseTo(25.6);
    expect(mut.nodes.find((n) => n.id === 's4')!.flag).toBe('high');
    expect(mut.nodes.find((n) => n.id === 's5')!.flag).toBeNull();
    const strong = buildGraph(result, cls, m, radar, 'strong');
    expect(strong.edges).toEqual([
      { from: 's1', to: 's2', kind: 'mutual' },
      { from: 's1', to: 's3', kind: 'oneSided' },
      { from: 's3', to: 's5', kind: 'mutual' },
    ]);
    const hard = buildGraph(result, cls, m, radar, 'hard');
    expect(hard.edges).toEqual([
      { from: 's1', to: 's4', kind: 'hard' },
      { from: 's2', to: 's4', kind: 'hard' },
      { from: 's4', to: 's1', kind: 'hard' },
    ]);
  });
});

describe('egoZones', () => {
  it('splits others into four zones', () => {
    const { cls, result, m } = setup();
    expect(egoZones('s1', result, cls, m)).toEqual({
      right: ['s2'],
      bottom: ['s3'],
      top: ['s4'],
      left: ['s5', 's6'],
    });
    expect(egoZones('s3', result, cls, m)).toEqual({
      right: ['s5'],
      bottom: ['s1'],
      top: ['s2'],
      left: ['s4', 's6'],
    });
  });
});
