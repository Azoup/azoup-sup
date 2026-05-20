import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSupabaseRestFetch } from '@/lib/supabaseRestFetch';

function mockProxyResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? 'No Content' : 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => body,
  } as Response;
}

describe('createSupabaseRestFetch', () => {
  const nativeFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', nativeFetch);
    window.localStorage.clear();
    window.localStorage.setItem(
      'sb-testproject-auth-token',
      JSON.stringify({ access_token: 'test-jwt-token-value' }),
    );
    vi.stubEnv('VITE_SUPABASE_URL', 'https://testproject.supabase.co');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns 204 Response without body (avoids TypeError on PATCH/DELETE)', async () => {
    nativeFetch.mockResolvedValueOnce(mockProxyResponse(204, ''));

    const proxyFetch = createSupabaseRestFetch();
    const res = await proxyFetch('https://testproject.supabase.co/rest/v1/kanban_cards?id=eq.1', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('normalizes empty 200 body to [] for Supabase client', async () => {
    nativeFetch.mockResolvedValueOnce(mockProxyResponse(200, ''));

    const proxyFetch = createSupabaseRestFetch();
    const res = await proxyFetch('https://testproject.supabase.co/rest/v1/kanban_card_files?select=*', {
      method: 'GET',
      headers: { Authorization: 'Bearer test' },
    });

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe('[]');
  });
});
