import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { wipeAll } from '@/lib/db/repo';
import { listSurveys } from '@/lib/db/surveys';
import { SurveyUpload } from '@/components/relations/SurveyUpload';
import { buildCsv, fakeClass } from '../../lib/survey/fixture';

beforeEach(async () => {
  await wipeAll();
});

const upload = (text: string) => {
  const file = new File([text], 'result.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText(/CSV 파일/), { target: { files: [file] } });
};

describe('SurveyUpload', () => {
  it('previews counts, saves the survey and shows the delete-the-CSV notice', async () => {
    const cls = fakeClass(4);
    const onSaved = vi.fn();
    render(<SurveyUpload cls={cls} onSaved={onSaved} />);
    upload(
      buildCsv(
        [
          { name: '1. 가온', best: ['2. 나래'] },
          { name: '2. 나래' },
          { name: '2. 나래' },
          { name: '9. 허수아비' },
        ],
        cls,
      ),
    );
    expect(await screen.findByText('응답 2명')).toBeInTheDocument();
    expect(screen.getByText(/응답하지 않은 학생 2명: 3\. 다온, 4\. 라희/)).toBeInTheDocument();
    expect(screen.getByText(/명단에 없는 응답: 9\. 허수아비/)).toBeInTheDocument();
    expect(screen.getByText(/중복 응답.*2\. 나래/)).toBeInTheDocument();
    expect(screen.getByLabelText('설문 이름')).toHaveValue(
      `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 설문`,
    );

    fireEvent.change(screen.getByLabelText('설문 이름'), { target: { value: '11월 설문' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(
      await screen.findByText('내려받은 CSV 파일에는 학생 응답이 들어 있어요. 업로드했으면 지워 주세요.'),
    ).toBeInTheDocument();
    const saved = await listSurveys(cls.id);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('11월 설문');
    expect(Object.keys(saved[0].responses).sort()).toEqual(['s1', 's2']);
    expect(onSaved).toHaveBeenCalledWith(saved[0]);
  });

  it('shows the error and missing questions for a wrong CSV, with no save button', async () => {
    render(<SurveyUpload cls={fakeClass(4)} onSaved={vi.fn()} />);
    upload('a,b\r\n1,2');
    expect(await screen.findByText('이 앱에서 만든 설문의 CSV가 아니에요')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
    expect(await listSurveys('c1')).toEqual([]);
  });

  it('asks for the original Google Sheets CSV when the file is not UTF-8', async () => {
    render(<SurveyUpload cls={fakeClass(4)} onSaved={vi.fn()} />);
    // CP949 bytes ("타임스탬프,내 이름") decode to U+FFFD replacement characters as UTF-8.
    const bytes = new Uint8Array([0xc5, 0xb8, 0xc0, 0xd3, 0xbd, 0xba, 0xc5, 0xc6, 0xc7, 0xc1, 0x2c, 0x61, 0x0d, 0x0a, 0x31, 0x2c, 0x32]);
    fireEvent.change(screen.getByLabelText(/CSV 파일/), {
      target: { files: [new File([bytes], 'excel.csv', { type: 'text/csv' })] },
    });
    expect(
      await screen.findByText('구글 시트에서 바로 내려받은 CSV 파일을 올려 주세요 (엑셀로 저장한 파일은 읽을 수 없어요)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('이 앱에서 만든 설문의 CSV가 아니에요')).toBeNull();
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('shows a generic message when the file cannot be read', async () => {
    render(<SurveyUpload cls={fakeClass(4)} onSaved={vi.fn()} />);
    const file = new File(['x'], 'r.csv');
    Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('boom')) });
    fireEvent.change(screen.getByLabelText(/CSV 파일/), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('파일을 읽을 수 없어요'));
  });

  it('saves only once when 저장 is clicked twice quickly', async () => {
    const cls = fakeClass(4);
    render(<SurveyUpload cls={cls} onSaved={vi.fn()} />);
    upload(buildCsv([{ name: '1. 가온' }], cls));
    const btn = await screen.findByRole('button', { name: '저장' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByText(/업로드했으면 지워 주세요/);
    expect(await listSurveys(cls.id)).toHaveLength(1);
  });

  it('ignores a slow first file when a second file was picked meanwhile', async () => {
    const cls = fakeClass(4);
    render(<SurveyUpload cls={cls} onSaved={vi.fn()} />);
    const slow = new File([''], 'a.csv');
    let release: (t: string) => void = () => {};
    Object.defineProperty(slow, 'text', { value: () => new Promise<string>((r) => (release = r)) });
    const input = screen.getByLabelText(/CSV 파일/);
    fireEvent.change(input, { target: { files: [slow] } });
    upload(buildCsv([{ name: '1. 가온' }, { name: '2. 나래' }], cls));
    expect(await screen.findByText('응답 2명')).toBeInTheDocument();
    release(buildCsv([{ name: '1. 가온' }], cls));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText('응답 2명')).toBeInTheDocument();
  });

  it('shows the generic message when the CSV text makes the import throw', async () => {
    render(<SurveyUpload cls={fakeClass(4)} onSaved={vi.fn()} />);
    const file = new File(['x'], 'r.csv');
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(null as unknown as string) });
    fireEvent.change(screen.getByLabelText(/CSV 파일/), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('파일을 읽을 수 없어요'));
  });
});
