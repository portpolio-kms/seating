'use client';

import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & {
  value: string;
  /** Called on blur with the raw edited text. */
  onCommit: (raw: string) => void;
};

/** Text input that keeps the raw text while editing (IME-safe, can be cleared) and commits on blur. */
export function DraftInput({ value, onCommit, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(draft);
        setDraft(null);
      }}
    />
  );
}
