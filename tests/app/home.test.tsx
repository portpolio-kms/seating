import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { openOldVersionConnection } from '../lib/db/oldVersion';
import { hashPin } from '@/lib/auth/pin';
import { deleteClass, listSeatingRecords, saveClass, saveSettings, wipeAll, type ClassRecord } from '@/lib/db/repo';
import Home from '@/app/page';

const names = ['가온', '나래', '다온', '라희'];
const mkClass = (over: Partial<ClassRecord> = {}): ClassRecord => ({
  id: 'c1',
  name: '6학년 1반',
  students: names.map((name, i) => ({ id: `s${i}`, number: i + 1, name, gender: null })),
  layout: { mode: 'pair', rows: 1, cols: 2, groupSize: 4, disabledSeats: [] },
  constraints: [],
  genderRule: false,
  lastRevealStyle: 'A',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const forbidden = () => {
  const t = document.body.textContent ?? '';
  for (const w of ['금지', '반드시', '조건 위반']) expect(t).not.toContain(w);
};

beforeEach(async () => {
  await wipeAll();
});

describe('classroom home while the database upgrade is blocked', () => {
  it('shows the close-other-windows message instead of a blank page, then loads', async () => {
    const old = await openOldVersionConnection();
    render(<Home />);
    const msg = '이 앱이 열린 다른 창이나 탭을 모두 닫아 주세요. 새 버전으로 바뀌는 중이에요.';
    expect(await screen.findByText(msg)).toBeInTheDocument();

    old.close();
    expect(await screen.findByText('교사 화면에서 학급을 먼저 만들어 주세요')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(msg)).toBeNull());
  });
});

describe('classroom home', () => {
  it('without a class shows only the setup hint and the teacher button', async () => {
    render(<Home />);
    expect(await screen.findByText('교사 화면에서 학급을 먼저 만들어 주세요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '교사 화면' })).toHaveAttribute('href', expect.stringMatching(/^\/teacher\/?\?from=classroom$/));
    expect(screen.queryByRole('button', { name: '자리 뽑기' })).toBeNull();
    forbidden();
  });

  it('infeasible settings show only the generic message', async () => {
    await saveClass(
      mkClass({
        constraints: [
          { id: 'k1', a: 's0', b: 's1', kind: 'must-pair' },
          { id: 'k2', a: 's0', b: 's1', kind: 'avoid-pair' },
        ],
      }),
    );
    render(<Home />);
    expect(await screen.findByText('6학년 1반')).toBeInTheDocument();
    forbidden();
    fireEvent.click(screen.getByRole('button', { name: '자리 뽑기' }));
    fireEvent.click(screen.getByRole('button', { name: /A 한 번에/ }));
    expect(await screen.findByText('설정을 확인해 주세요')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    for (const n of names) expect(text).not.toContain(n);
    forbidden();
  });

  it('shows the empty message when nothing is confirmed', async () => {
    await saveClass(mkClass());
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: '좌석표 보기' }));
    expect(await screen.findByText('아직 확정된 좌석표가 없어요')).toBeInTheDocument();
  });

  it('draw, confirm behind the PIN gate, then shows the saved chart', async () => {
    await saveSettings({ pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') });
    await saveClass(mkClass());
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: '자리 뽑기' }));
    fireEvent.click(screen.getByRole('button', { name: /A 한 번에/ }));
    const confirmBtn = await screen.findByRole('button', { name: '확정' }, { timeout: 10000 });
    expect(screen.getByRole('button', { name: '다시 뽑기' })).toBeInTheDocument();
    forbidden();
    fireEvent.click(confirmBtn);
    expect(await screen.findByText(/TV에 보일 수 있어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '계속' }));
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('button', { name: '처음으로' })).toBeInTheDocument();
    expect(await listSeatingRecords('c1')).toHaveLength(1);
    const text = document.body.textContent ?? '';
    for (const n of names) expect(text).toContain(n);
    forbidden();
  }, 20000);
});

describe('classroom home: cancel confirm', () => {
  it('돌아가기 returns to the same revealed result without saving', async () => {
    await saveSettings({ pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') });
    await saveClass(mkClass());
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: '자리 뽑기' }));
    fireEvent.click(screen.getByRole('button', { name: /A 한 번에/ }));
    const confirmBtn = await screen.findByRole('button', { name: '확정' }, { timeout: 10000 });
    const before = document.querySelector('main')?.textContent;
    fireEvent.click(confirmBtn);
    fireEvent.click(await screen.findByRole('button', { name: '돌아가기' }));
    expect(screen.queryByText(/TV에 보일 수 있어요/)).toBeNull();
    expect(screen.getByRole('button', { name: '확정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 뽑기' })).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    for (const n of names) expect(text).toContain(n);
    expect(document.querySelector('main')?.textContent).toBe(before);
    expect(await listSeatingRecords('c1')).toHaveLength(0);
  }, 20000);
});

describe('classroom home: confirm gate safety', () => {
  async function reachPinStep() {
    await saveSettings({ pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') });
    await saveClass(mkClass());
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: '자리 뽑기' }));
    fireEvent.click(screen.getByRole('button', { name: /A 한 번에/ }));
    fireEvent.click(await screen.findByRole('button', { name: '확정' }, { timeout: 10000 }));
    fireEvent.click(await screen.findByRole('button', { name: '계속' }));
    return screen.findByLabelText('PIN');
  }

  it('the confirm PIN gate offers no forgot/wipe path', async () => {
    await reachPinStep();
    expect(screen.queryByRole('button', { name: 'PIN을 잊었어요' })).toBeNull();
    expect(screen.queryByText(/모든 데이터/)).toBeNull();
  }, 20000);

  it('does not write a record when the class was deleted meanwhile', async () => {
    const pin = await reachPinStep();
    await deleteClass('c1');
    fireEvent.change(pin, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByText('교사 화면에서 학급을 먼저 만들어 주세요')).toBeInTheDocument();
    expect(await listSeatingRecords('c1')).toHaveLength(0);
  }, 20000);
});
