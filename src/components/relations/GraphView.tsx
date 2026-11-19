'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Network } from 'vis-network/standalone';
import type { ClassRecord } from '@/lib/db/repo';
import {
  analyzeSurvey,
  buildGraph,
  buildRadar,
  egoZones,
  type EdgeFilter,
  type EgoZones,
  type GraphData,
} from '@/lib/survey/analyze';
import type { SurveyResult } from '@/lib/survey/types';

const FILTERS: { id: EdgeFilter; label: string }[] = [
  { id: 'mutual', label: '서로 친함' },
  { id: 'strong', label: '4점 이상 전부' },
  { id: 'hard', label: '함께 있기 힘듦' },
];

const LEGEND = '보라 실선: 서로 친함 · 점선: 한쪽만 좋아함 · 빨강 점선: 함께 있기 힘듦';

const NODE_COLOR = { base: '#8b5cf6', high: '#ef4444', medium: '#f97316' } as const;
const EDGE_COLOR = { mutual: '#7c3aed', oneSided: '#a78bfa', hard: '#dc2626' } as const;

const RADIUS = 260;
// Direction (radians, screen coordinates: y grows downward) each zone faces.
const ZONE_ANGLE: Record<keyof EgoZones, number> = { right: 0, bottom: Math.PI / 2, left: Math.PI, top: -Math.PI / 2 };

function toVisData(g: GraphData) {
  return {
    nodes: g.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      size: n.size,
      color: NODE_COLOR[n.flag ?? 'base'],
      font: { size: 14, color: '#1e293b' },
    })),
    edges: g.edges.map((e, i) => ({
      id: `${e.kind}:${e.from}:${e.to}:${i}`,
      from: e.from,
      to: e.to,
      color: { color: EDGE_COLOR[e.kind] },
      width: e.kind === 'mutual' ? 4 : 2,
      dashes: e.kind !== 'mutual',
      arrows: e.kind === 'oneSided' || e.kind === 'hard' ? 'to' : undefined,
    })),
  };
}

/** Positions on a half circle facing `ZONE_ANGLE[zone]`, evenly spaced. */
function zonePositions(zones: EgoZones): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const zone of Object.keys(zones) as (keyof EgoZones)[]) {
    const ids = zones[zone];
    ids.forEach((id, i) => {
      const theta = ZONE_ANGLE[zone] - Math.PI / 2 + (Math.PI * (i + 1)) / (ids.length + 1);
      out[id] = { x: Math.round(RADIUS * Math.cos(theta)), y: Math.round(RADIUS * Math.sin(theta)) };
    });
  }
  return out;
}

export function GraphView({
  cls,
  survey,
  openCard,
}: {
  cls: ClassRecord;
  survey: SurveyResult;
  openCard: (studentId: string) => void;
}) {
  const [filter, setFilter] = useState<EdgeFilter>('mutual');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const appliedFilter = useRef<EdgeFilter>('mutual');
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const metrics = useMemo(() => analyzeSurvey(survey, cls), [survey, cls]);
  const radar = useMemo(() => buildRadar(survey, cls, metrics).items, [survey, cls, metrics]);
  const graphFor = (f: EdgeFilter) => buildGraph(survey, cls, metrics, radar, f);

  // Latest closures for the long-lived network callbacks.
  const onNodeClick = useRef<(id: string) => void>(() => {});
  onNodeClick.current = (id: string) => {
    const net = networkRef.current;
    if (!net) return;
    setSelectedId(id);
    // Ego layout: show this student's 4+ and hard links, then place the others by zone.
    const strong = graphFor('strong').edges;
    const hard = graphFor('hard').edges;
    const base = graphFor('strong');
    const edges = [...strong, ...hard].filter((e) => e.from === id || e.to === id);
    net.setOptions({ physics: false });
    net.setData(toVisData({ nodes: base.nodes, edges }));
    net.moveNode(id, 0, 0);
    const pos = zonePositions(egoZones(id, survey, cls, metrics));
    for (const [other, p] of Object.entries(pos)) net.moveNode(other, p.x, p.y);
    net.fit();
  };

  useEffect(() => {
    let disposed = false;
    let created: Network | null = null;
    (async () => {
      const vis = await import('vis-network/standalone');
      if (disposed || !containerRef.current) return;
      created = new vis.Network(containerRef.current, toVisData(graphFor(filterRef.current)), {
        nodes: { shape: 'dot' },
        edges: { smooth: false },
        interaction: { dragNodes: true },
        physics: { stabilization: { iterations: 150 } },
      });
      networkRef.current = created;
      appliedFilter.current = filterRef.current;
      created.on('click', (params: { nodes?: (string | number)[] }) => {
        const id = params.nodes?.[0];
        if (id != null) onNodeClick.current(String(id));
      });
    })();
    return () => {
      disposed = true;
      created?.destroy();
      networkRef.current = null;
    };
    // graphFor is derived from survey/cls/metrics/radar, all covered below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey, cls, metrics, radar]);

  const showAll = (f: EdgeFilter) => {
    setSelectedId(null);
    const net = networkRef.current;
    if (!net) return;
    net.setOptions({ physics: true });
    net.setData(toVisData(graphFor(f)));
    appliedFilter.current = f;
  };

  // Filter changes re-draw the full view (the first run is handled by creation).
  useEffect(() => {
    if (networkRef.current && appliedFilter.current !== filter) showAll(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const selected = selectedId ? cls.students.find((s) => s.id === selectedId) : null;
  const sm = selectedId ? metrics[selectedId] : null;
  const selectedLabel = selected ? graphFor('mutual').nodes.find((n) => n.id === selected.id)?.label ?? selected.name : '';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold">
          선 보기{' '}
          <select
            aria-label="선 필터"
            className="rounded border border-slate-300 px-2 py-1 font-normal"
            value={filter}
            onChange={(e) => setFilter(e.target.value as EdgeFilter)}
          >
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-600">{LEGEND}</p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <div
          ref={containerRef}
          role="img"
          aria-label="학생 관계망 그래프"
          className="h-[520px] min-w-0 flex-1 rounded-lg border border-slate-300 bg-white"
        />
        {selected && sm && (
          <aside aria-label="선택한 학생" className="w-full space-y-2 rounded-lg border border-slate-300 bg-white p-3 md:w-64">
            <h3 className="font-bold">{selectedLabel}</h3>
            <ul className="space-y-1 text-sm">
              <li>받은 평균 {sm.receivedAvg == null ? '-' : sm.receivedAvg.toFixed(1)}점</li>
              <li>서로 친함 {sm.mutual.length}명</li>
              <li>지목받음 {sm.nominatedBy.length}명</li>
              {!sm.responded && <li className="text-slate-500">설문 미응답</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white"
                onClick={() => openCard(selected.id)}
              >
                상담 카드 열기
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold"
                onClick={() => showAll(filter)}
              >
                전체 보기
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
