import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type AdminUserActionBody =
  | { action: 'delete_user'; target_user_id: string }
  | { action: 'set_user_password'; target_user_id: string; new_password: string };

export type AdminUserActionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'weak_password'
  | 'cannot_delete_self'
  | 'cannot_delete_last_admin'
  | 'user_not_found'
  | 'delete_failed'
  | 'update_failed'
  | 'unknown_action'
  | 'server_misconfigured'
  | 'server_error';

const KNOWN_CODES = new Set<AdminUserActionErrorCode>([
  'unauthorized',
  'forbidden',
  'weak_password',
  'cannot_delete_self',
  'cannot_delete_last_admin',
  'user_not_found',
  'delete_failed',
  'update_failed',
  'unknown_action',
  'server_misconfigured',
]);

export type AdminUserActionResult =
  | { ok: true }
  | { ok: false; code: AdminUserActionErrorCode; message?: string };

async function getAccessToken(): Promise<string | null> {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data: ref } = await supabase.auth.refreshSession();
    session = ref.session ?? null;
  }
  return session?.access_token ?? null;
}

function mapResponseToResult(status: number, payload: unknown): AdminUserActionResult {
  const row =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  if (status >= 200 && status < 300 && row.ok === true) {
    return { ok: true };
  }

  const errKey = typeof row.error === 'string' ? row.error.trim() : '';
  if (KNOWN_CODES.has(errKey as AdminUserActionErrorCode)) {
    return {
      ok: false,
      code: errKey as AdminUserActionErrorCode,
      message: typeof row.message === 'string' ? row.message : undefined,
    };
  }

  if (status === 401) return { ok: false, code: 'unauthorized' };
  if (status === 403) return { ok: false, code: 'forbidden' };
  if (status === 500 && errKey === 'server_misconfigured') {
    return { ok: false, code: 'server_misconfigured', message: String(row.message ?? '') };
  }

  return {
    ok: false,
    code: 'server_error',
    message: typeof row.message === 'string' ? row.message : `HTTP ${status}`,
  };
}

async function invokeLocalOrVercelApi(
  token: string,
  body: AdminUserActionBody,
): Promise<AdminUserActionResult | null> {
  try {
    const response = await fetch('/api/admin-user-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      return null;
    }

    const result = mapResponseToResult(response.status, payload);
    if (!result.ok && result.code === 'server_misconfigured') {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

let adminUsersEdgeAvailable: boolean | null = null;

async function isAdminUsersEdgeAvailable(): Promise<boolean> {
  if (adminUsersEdgeAvailable !== null) return adminUsersEdgeAvailable;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    adminUsersEdgeAvailable = false;
    return false;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'OPTIONS',
      headers: { apikey: SUPABASE_ANON_KEY, Origin: window.location.origin },
    });
    adminUsersEdgeAvailable = res.ok;
  } catch {
    adminUsersEdgeAvailable = false;
  }
  return adminUsersEdgeAvailable;
}

async function invokeAdminUsersEdge(
  token: string,
  body: AdminUserActionBody,
): Promise<AdminUserActionResult | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: body.action,
        target_user_id: body.target_user_id,
        ...(body.action === 'set_user_password' ? { new_password: body.new_password } : {}),
      }),
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;

    return mapResponseToResult(response.status, await response.json());
  } catch {
    return null;
  }
}

/** Edge digisac-dashboard (fallback se admin-users não estiver publicada). */
async function invokeDigisacAdmin(
  token: string,
  body: AdminUserActionBody,
): Promise<AdminUserActionResult | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/digisac-dashboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: body.action,
        target_user_id: body.target_user_id,
        ...(body.action === 'set_user_password' ? { new_password: body.new_password } : {}),
      }),
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;

    if (payload.ok === true) {
      return { ok: true };
    }

    const errKey = typeof payload.error === 'string' ? payload.error.trim() : '';
    if (KNOWN_CODES.has(errKey as AdminUserActionErrorCode)) {
      return {
        ok: false,
        code: errKey as AdminUserActionErrorCode,
        message: typeof payload.message === 'string' ? payload.message : undefined,
      };
    }

    if (payload.error === true || payload.code === 'CONFIG_MISSING') {
      const msg = typeof payload.message === 'string' ? payload.message : '';
      if (/CONFIG_MISSING|Digisac|configuração do Digisac/i.test(msg)) {
        return {
          ok: false,
          code: 'server_misconfigured',
          message: 'digisac_sem_admin',
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 1) digisac-dashboard (Edge já no ar, CORS ok)
 * 2) /api/admin-user-action (.env local ou mesma variável na Vercel)
 * Não chama admin-users (404 → erro CORS no browser).
 */
export async function runAdminUserAction(body: AdminUserActionBody): Promise<AdminUserActionResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, code: 'unauthorized' };
  }

  if (await isAdminUsersEdgeAvailable()) {
    const viaAdminUsers = await invokeAdminUsersEdge(token, body);
    if (viaAdminUsers) {
      return viaAdminUsers;
    }
  }

  const viaDigisac = await invokeDigisacAdmin(token, body);
  if (viaDigisac?.ok) {
    return viaDigisac;
  }
  if (viaDigisac && !viaDigisac.ok && viaDigisac.code !== 'server_misconfigured') {
    return viaDigisac;
  }

  const viaApi = await invokeLocalOrVercelApi(token, body);
  if (viaApi) {
    return viaApi;
  }

  if (viaDigisac?.code === 'server_misconfigured') {
    return viaDigisac;
  }

  return { ok: false, code: 'server_misconfigured' };
}

function supabaseProjectRef(): string {
  const fromEnv = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim();
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const m = url?.match(/https?:\/\/([^.]+)\.supabase\.co/i);
  return m?.[1] ?? 'ittmglvkympbyeowgucl';
}

export function formatAdminActionErrorMessage(
  code: AdminUserActionErrorCode,
  detail?: string,
): string {
  if (code === 'server_misconfigured') {
    const ref = supabaseProjectRef();
    if (detail === 'digisac_sem_admin' || detail?.includes('digisac_sem_admin')) {
      return (
        'A função digisac-dashboard não expõe ações de admin. ' +
        `Publique a Edge Function admin-users no projeto ${ref}: ` +
        `https://supabase.com/dashboard/project/${ref}/functions → Deploy → admin-users → ` +
        'cole supabase/functions/admin-users/index.ts (ou COLE_NO_PAINEL_index.ts).'
      );
    }
    if (detail?.trim()) {
      return detail;
    }
    const isProd = typeof window !== 'undefined' && !window.location.hostname.includes('localhost');
    if (isProd) {
      return (
        'Em produção (Vercel): em Settings → Environment Variables, adicione SUPABASE_SERVICE_ROLE_KEY ' +
        `(service_role do projeto ${ref}, o mesmo de VITE_SUPABASE_URL) e faça Redeploy. ` +
        `Alternativa: publicar a Edge Function admin-users no Supabase (${ref}).`
      );
    }
    return (
      `No .env local, defina SUPABASE_SERVICE_ROLE_KEY com a service_role do projeto ${ref} ` +
      '(o mesmo de VITE_SUPABASE_URL) e reinicie npm run dev.'
    );
  }

  const base: Record<AdminUserActionErrorCode, string> = {
    unauthorized: 'Sessão inválida. Faça login novamente.',
    forbidden: 'Sem permissão de administrador.',
    weak_password: 'A nova senha deve ter pelo menos 6 caracteres.',
    cannot_delete_self: 'Não é possível excluir a própria conta.',
    cannot_delete_last_admin: 'Não é possível excluir o último administrador.',
    user_not_found: 'Utilizador não encontrado.',
    delete_failed: 'Não foi possível excluir o cadastro.',
    update_failed: 'Não foi possível definir a senha.',
    unknown_action: 'Operação inválida.',
    server_misconfigured: '',
    server_error: 'Não foi possível concluir a operação.',
  };

  const msg = base[code] ?? base.server_error;
  if ((code === 'server_error' || code === 'delete_failed' || code === 'update_failed') && detail?.trim()) {
    const short = detail.length > 140 ? `${detail.slice(0, 140)}…` : detail;
    return `${msg} (${short})`;
  }
  return msg;
}
