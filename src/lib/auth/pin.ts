import type { AppSettings } from '@/lib/db/repo';

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + pin);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

export function newSalt(): string {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export async function verifyPin(pin: string, settings: AppSettings): Promise<boolean> {
  if (!settings.pinHash || !settings.pinSalt) return false;
  return (await hashPin(pin, settings.pinSalt)) === settings.pinHash;
}
