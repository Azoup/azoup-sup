import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LOGOUT_FLAG_KEY,
  hasLogoutFlag,
  consumeLogoutFlag,
  setLogoutFlag,
  performLogout,
  clearLocalSession,
} from '@/lib/signOutLocal';
import { clearAllSupabaseAuthStorage } from '@/lib/supabaseProject';
import { buildAuthPath } from '@/lib/authPaths';

describe('signOutLocal', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setLogoutFlag and consumeLogoutFlag', () => {
    expect(hasLogoutFlag()).toBe(false);
    setLogoutFlag();
    expect(hasLogoutFlag()).toBe(true);
    expect(consumeLogoutFlag()).toBe(true);
    expect(hasLogoutFlag()).toBe(false);
    expect(consumeLogoutFlag()).toBe(false);
  });

  it('clearLocalSession removes all sb- auth keys', () => {
    localStorage.setItem('sb-test-auth-token', 'x');
    localStorage.setItem('other', 'keep');
    clearLocalSession();
    expect(localStorage.getItem('sb-test-auth-token')).toBeNull();
    expect(localStorage.getItem('other')).toBe('keep');
  });

  it('clearAllSupabaseAuthStorage removes active project session keys', () => {
    localStorage.setItem('sb-abc-project-auth-token', 'token');
    clearAllSupabaseAuthStorage();
    expect(localStorage.getItem('sb-abc-project-auth-token')).toBeNull();
  });

  it('index.html purges auth storage before React boots', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('azoup-signed-out');
    expect(html).toContain('logout=1');
    expect(html).toContain("key.indexOf('sb-') === 0");
  });

  it('performLogout sets flag and navigates to /auth?logout=1 immediately', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign } as Location);
    performLogout();
    expect(sessionStorage.getItem(LOGOUT_FLAG_KEY)).toBe('1');
    expect(assign).toHaveBeenCalledWith(buildAuthPath('logout=1'));
  });
});
