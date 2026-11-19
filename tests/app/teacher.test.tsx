import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ToTeacher } from '@/lib/channel';
import {
  addSeatingRecord,
  getSettings,
  listClasses,
  listSeatingRecords,
  saveClass,
  saveSettings,
  wipeAll,
  type ClassRecord,
} from '@/lib/db/repo';
import { hashPin } from '@/lib/auth/pin';

const close = vi.fn();
vi.mock('@/lib/channel', async (orig) => ({
  ...(await orig<typeof import('@/lib/channel')>()),
  openTeacherChannel: (_cb: (m: ToTeacher) => void) => ({ send: vi.fn(), close }),
}));

import TeacherPage from '@/app/teacher/page';
import { openOldVersionConnection } from '../lib/db/oldVersion';

beforeEach(async () => {
  await wipeAll();
});

describe('/teacher', () => {
  it('first run: PIN setup, then create a class and land on the roster tab', async () => {
    const { unmount } = render(<TeacherPage />);
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.change(screen.getByLabelText('PIN 다시 입력'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    fireEvent.change(await screen.findByLabelText('새 학급 이름'), { target: { value: '6학년 1반' } });
    fireEvent.click(screen.getByRole('button', { name: '새 학급 만들기' }));

    expect(await screen.findByRole('tab', { name: '명단', selected: true })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      '뽑기', '명단', '배치', '쌍 조건', '교우관계', '기록', '백업/설정',
    ]);
    const classes = await listClasses();
    expect(classes.map((c) => c.name)).toEqual(['6학년 1반']);
    expect((await getSettings()).activeClassId).toBe(classes[0].id);

    unmount();
    expect(close).toHaveBeenCalled();
  });


  it('disables class switching and new class while a reveal runs', async () => {
    await saveSettings({ pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') });
    await saveClass({
      id: 'c1', name: '6학년 1반',
      students: ['가온', '나래'].map((name, i) => ({ id: `s${i}`, number: i + 1, name, gender: null })),
      layout: { mode: 'pair', rows: 1, cols: 1, groupSize: 4, disabledSeats: [] },
      constraints: [], genderRule: false, lastRevealStyle: 'A', createdAt: '2026-01-01T00:00:00.000Z',
    });
    render(<TeacherPage />);
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    fireEvent.click(await screen.findByRole('button', { name: '뽑기 시작' }));
    expect(screen.getByLabelText('학급 선택')).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ 새 학급' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '나머지 바로 공개' }));
    await screen.findByRole('button', { name: '이대로 확정' });
    expect(screen.getByLabelText('학급 선택')).toBeEnabled();
    expect(screen.getByRole('button', { name: '+ 새 학급' })).toBeEnabled();
  });
});

const mkClass = (id: string, name: string, createdAt: string): ClassRecord => ({
  id,
  name,
  students: ['가온', '나래'].map((n, i) => ({ id: `${id}-s${i}`, number: i + 1, name: n, gender: null })),
  layout: { mode: 'pair', rows: 1, cols: 1, groupSize: 4, disabledSeats: [] },
  constraints: [],
  genderRule: false,
  lastRevealStyle: 'A',
  createdAt,
});

async function unlockWith(classes: ClassRecord[]) {
  await saveSettings({ pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') });
  for (const c of classes) await saveClass(c);
  render(<TeacherPage />);
  fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '1234' } });
  fireEvent.click(screen.getByRole('button', { name: '확인' }));
  await screen.findByRole('tab', { name: '뽑기' });
}

describe('/teacher header', () => {
  it('links back to the classroom home', async () => {
    await unlockWith([mkClass('c1', '6학년 1반', '2026-01-01')]);
    expect(screen.getByRole('link', { name: '교실 화면으로' })).toHaveAttribute('href', '/');
  });
});

describe('/teacher relations tab', () => {
  it('opens the 교우관계 tab with the survey sub-views', async () => {
    await unlockWith([mkClass('c1', '6학년 1반', '2026-01-01')]);
    fireEvent.click(screen.getByRole('tab', { name: '교우관계' }));
    expect(await screen.findByRole('button', { name: '설문 만들기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '결과 올리기' })).toBeInTheDocument();
  });

});

describe('/teacher blocked database upgrade', () => {
  it('shows the banner before any PIN interaction and clears it once the old window closes', async () => {
    const old = await openOldVersionConnection();
    render(<TeacherPage />);
    const msg = '이 앱이 열린 다른 창이나 탭을 모두 닫아 주세요. 새 버전으로 바뀌는 중이에요.';
    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(screen.queryByLabelText('PIN')).toBeNull();

    old.close();
    await waitFor(() => expect(screen.queryByText(msg)).toBeNull());
    // The upgrade completed: the PIN gate can now read settings.
    expect(await screen.findByLabelText('PIN')).toBeInTheDocument();
  });
});

describe('/teacher forgot PIN', () => {
  it('wiping from the lock screen clears the loaded classes from memory', async () => {
    await unlockWith([mkClass('c1', '6학년 1반', '2026-01-01')]);
    fireEvent.click(screen.getByRole('button', { name: '잠그기' }));
    // Still mounted (hidden) while locked.
    expect(document.body.textContent).toContain('6학년 1반');
    fireEvent.click(await screen.findByRole('button', { name: 'PIN을 잊었어요' }));
    const wipeBtn = screen.getByRole('button', { name: '모든 데이터를 지우고 새로 시작' });
    expect(wipeBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('확인 문구'), { target: { value: '모두 지우기' } });
    fireEvent.click(wipeBtn);
    await screen.findByText('PIN 정하기');
    expect(document.body.textContent).not.toContain('가온');
    expect(document.body.textContent).not.toContain('6학년 1반');
    expect(await listClasses()).toEqual([]);
  });
});

describe('/teacher class management', () => {
  it('tells that the backup also contains survey responses', async () => {
    await unlockWith([mkClass('c1', '6학년 1반', '2026-01-01')]);
    fireEvent.click(screen.getByRole('tab', { name: '백업/설정' }));
    expect(await screen.findByText(/설문 응답도 들어 있어요\./)).toBeInTheDocument();
  });

  it('renames the current class', async () => {
    await unlockWith([mkClass('c1', '6학년 1반', '2026-01-01')]);
    fireEvent.click(screen.getByRole('tab', { name: '백업/설정' }));
    const input = await screen.findByLabelText('학급 이름');
    fireEvent.change(input, { target: { value: '  6학년 2반 ' } });
    fireEvent.click(screen.getByRole('button', { name: '이름 바꾸기' }));
    await waitFor(async () => expect((await listClasses())[0].name).toBe('6학년 2반'));
    expect(screen.getByRole('option', { name: '6학년 2반' })).toBeInTheDocument();
  });

  it('deletes the current class and its records after confirming, then switches to another class', async () => {
    await unlockWith([mkClass('c1', '6학년 1반', '2026-01-01'), mkClass('c2', '6학년 2반', '2026-01-02')]);
    await addSeatingRecord({
      id: 'r1', classId: 'c1', createdAt: '2026-01-03', layout: mkClass('c1', '', '').layout,
      assignment: {}, studentNames: {},
    });
    fireEvent.click(screen.getByRole('tab', { name: '백업/설정' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(await screen.findByRole('button', { name: '이 학급 지우기' }));
    expect(confirm.mock.calls[0][0]).toContain("'6학년 1반'");
    expect(confirm.mock.calls[0][0]).toContain('좌석표 기록도 함께 지워지고 되돌릴 수 없어요');
    expect(await listClasses()).toHaveLength(2);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: '이 학급 지우기' }));
    await waitFor(async () => expect((await listClasses()).map((c) => c.id)).toEqual(['c2']));
    expect(await listSeatingRecords('c1')).toEqual([]);
    await waitFor(() => expect(screen.getByLabelText('학급 선택')).toHaveValue('c2'));
    expect(screen.queryByRole('option', { name: '6학년 1반' })).toBeNull();
    await waitFor(async () => expect((await getSettings()).activeClassId).toBe('c2'));
    confirm.mockRestore();
  });

  it('deleting the last class shows the first-run view', async () => {
    await unlockWith([mkClass('c1', '6학년 1반', '2026-01-01')]);
    fireEvent.click(screen.getByRole('tab', { name: '백업/설정' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: '이 학급 지우기' }));
    expect(await screen.findByText('처음이시군요. 새 학급을 만들어 시작해요.')).toBeInTheDocument();
    expect(await listClasses()).toEqual([]);
    confirm.mockRestore();
  });
});
