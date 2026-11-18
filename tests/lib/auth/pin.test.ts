import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, newSalt, verifyPin } from '@/lib/auth/pin';

describe('pin', () => {
  it('validates 4 digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('12345')).toBe(false);
  });
  it('hashes deterministically per salt', async () => {
    expect(await hashPin('1234', 's1')).toBe(await hashPin('1234', 's1'));
    expect(await hashPin('1234', 's1')).not.toBe(await hashPin('1234', 's2'));
    expect(await hashPin('1234', 's1')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('verifies against settings', async () => {
    const salt = newSalt();
    const settings = { pinHash: await hashPin('1234', salt), pinSalt: salt, activeClassId: null, idleMinutes: 5 };
    expect(await verifyPin('1234', settings)).toBe(true);
    expect(await verifyPin('4321', settings)).toBe(false);
    expect(await verifyPin('1234', { ...settings, pinHash: null })).toBe(false);
  });
});
