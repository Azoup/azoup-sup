import { describe, expect, it } from 'vitest';

/** Espelha a política do useAuth: só limpa sessão em SIGNED_OUT explícito. */
export function shouldClearSessionOnAuthEvent(event: string, hasToken: boolean): boolean {
  if (event === 'SIGNED_OUT') return true;
  if (!hasToken) return false;
  return false;
}

describe('shouldClearSessionOnAuthEvent', () => {
  it('clears only on SIGNED_OUT', () => {
    expect(shouldClearSessionOnAuthEvent('SIGNED_OUT', false)).toBe(true);
    expect(shouldClearSessionOnAuthEvent('TOKEN_REFRESHED', false)).toBe(false);
    expect(shouldClearSessionOnAuthEvent('INITIAL_SESSION', false)).toBe(false);
  });
});
