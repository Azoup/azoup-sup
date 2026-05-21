import { getConfiguredSupabaseProjectRef } from '@/lib/supabaseProject';

/**
 * Proxy REST/Storage do Supabase via /api/rest-proxy.
 * Contorna falha ES256 no PostgREST (usuário cai em anon e RLS retorna vazio).
 */
function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const ref = getConfiguredSupabaseProjectRef();
  if (!ref) return null;

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.includes(ref) || !key.includes('auth-token')) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as {
        access_token?: string;
        currentSession?: { access_token?: string };
      };
      const token = data.access_token ?? data.currentSession?.access_token;
      if (token) return token;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function resolveAuthHeader(init?: RequestInit): string {
  const headers = new Headers(init?.headers);
  const fromHeaders = headers.get('Authorization')?.trim();
  if (fromHeaders?.startsWith('Bearer ') && fromHeaders.length > 20) {
    return fromHeaders;
  }
  const token = getStoredAccessToken();
  return token ? `Bearer ${token}` : '';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function isStorageObjectWrite(path: string, method: string): boolean {
  return (
    path.startsWith('/storage/v1/object/') &&
    (method === 'POST' || method === 'PUT')
  );
}

function extractSupabasePath(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/rest/v1/') || parsed.pathname.startsWith('/storage/v1/')) {
      return parsed.pathname + parsed.search;
    }
    const restIdx = url.indexOf('/rest/v1/');
    const storageIdx = url.indexOf('/storage/v1/');
    const idx = restIdx >= 0 ? restIdx : storageIdx;
    if (idx < 0) return null;
    const pathAndQuery = url.slice(idx);
    const q = pathAndQuery.indexOf('?');
    return q >= 0 ? pathAndQuery : pathAndQuery;
  } catch {
    return null;
  }
}

export function createSupabaseRestFetch(): typeof fetch {
  const nativeFetch = globalThis.fetch.bind(globalThis);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const path = extractSupabasePath(url);
    if (!path || typeof window === 'undefined') {
      return nativeFetch(input, init);
    }

    const auth = resolveAuthHeader(init);
    if (!auth) {
      console.warn('[supabase] Sem token de sessão — aguardando login');
      return new Response(JSON.stringify({ message: 'not_authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers = new Headers(init?.headers);
    const method = (init?.method || 'GET').toUpperCase();
    let bodyText: string | null = null;
    let bodyBase64: string | null = null;

    if (init?.body != null) {
      if (isStorageObjectWrite(path, method)) {
        const buffer =
          init.body instanceof ArrayBuffer
            ? init.body
            : await new Response(init.body).arrayBuffer();
        bodyBase64 = arrayBufferToBase64(buffer);
      } else {
        bodyText =
          typeof init.body === 'string'
            ? init.body
            : await new Response(init.body).text();
      }
    }

    const proxyRes = await nativeFetch('/api/rest-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        path,
        method,
        body: bodyText,
        body_base64: bodyBase64,
        headers: {
          ...(headers.get('Prefer') ? { Prefer: headers.get('Prefer')! } : {}),
          ...(headers.get('Accept') ? { Accept: headers.get('Accept')! } : {}),
          ...(headers.get('Content-Type') ? { 'Content-Type': headers.get('Content-Type')! } : {}),
          ...(headers.get('Content-Range') ? { 'Content-Range': headers.get('Content-Range')! } : {}),
          ...(headers.get('Range') ? { Range: headers.get('Range')! } : {}),
          ...(headers.get('X-Upsert') ? { 'X-Upsert': headers.get('X-Upsert')! } : {}),
        },
      }),
    });

    const responseHeaders = new Headers();
    proxyRes.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        responseHeaders.set(key, value);
      }
    });

    if (!proxyRes.ok) {
      const errText = await proxyRes.text();
      console.error('[supabase] rest-proxy erro', proxyRes.status, path, errText.slice(0, 200));
      return new Response(errText, {
        status: proxyRes.status,
        statusText: proxyRes.statusText,
        headers: responseHeaders,
      });
    }

    const status = proxyRes.status;
    const body = await proxyRes.text();

    // 204/205/304 não podem ter corpo (senão o browser lança TypeError no Response).
    if (status === 204 || status === 205 || status === 304) {
      return new Response(null, {
        status,
        statusText: proxyRes.statusText,
        headers: responseHeaders,
      });
    }

    // PATCH/DELETE com 200 e corpo vazio — Supabase client espera JSON.
    const normalizedBody = !body.trim() && proxyRes.ok ? '[]' : body;

    return new Response(normalizedBody, {
      status,
      statusText: proxyRes.statusText,
      headers: responseHeaders,
    });
  };
}
