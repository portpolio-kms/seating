import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ToTeacher } from '@/lib/channel';
import { getSettings, listClasses, saveClass, saveSettings, wipeAll } from '@/lib/db/repo';
import { hashPin } from '@/lib/auth/pin';

const close = vi.fn();
vi.mock('@/lib/channel', async (orig) => ({
  ...(await orig<typeof import('@/lib/channel')>()),
  openTeacherChannel: (_cb: (m: ToTeacher) => void) => ({ send: vi.fn(), close }),
}));

import TeacherPage from '@/app/teacher/page';

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
      '뽑기', '명단', '배치', '쌍 조건', '기록', '백업/설정',
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
