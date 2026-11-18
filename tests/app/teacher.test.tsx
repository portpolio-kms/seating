import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ToTeacher } from '@/lib/channel';
import { getSettings, listClasses, wipeAll } from '@/lib/db/repo';

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
});
