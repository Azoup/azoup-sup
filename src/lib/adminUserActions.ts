import { supabase } from '@/integrations/supabase/client';

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

function mapPayload(payload: unknown): AdminUserActionResult | null {
  const row = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  if (row.ok === true) {
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

  if (row.error === true || row.code === 'CONFIG_MISSING') {
    const msg = typeof row.message === 'string' ? row.message : '';
    if (/CONFIG_MISSING|configuração do Digisac/i.test(msg)) {
      return { ok: false, code: 'server_misconfigured', message: 'digisac_sem_admin' };
    }
  }

  return null;
}

/** Edge digisac-dashboard — única função publicada no projeto (nunca chama admin-users). */
async function invokeDigisacAdmin(
  token: string,
  body: AdminUserActionBody,
): Promise<AdminUserActionResult | null> {
  const { data, error } = await supabase.functions.invoke('digisac-dashboard', {
    body: {
      action: body.action,
      target_user_id: body.target_user_id,
      ...(body.action === 'set_user_password' ? { new_password: body.new_password } : {}),
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    const msg = error.message ?? '';
    if (/failed to fetch|network|CORS/i.test(msg)) {
      return { ok: false, code: 'server_error', message: msg };
    }
    if (/jwt|unauthorized|401/i.test(msg)) {
      return { ok: false, code: 'unauthorized' };
    }
    if (/forbidden|403/i.test(msg)) {
      return { ok: false, code: 'forbidden' };
    }
    return { ok: false, code: 'server_error', message: msg };
  }

  return mapPayload(data);
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

    const payload = await response.json();
    const row = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

    if (response.ok && row.ok === true) {
      return { ok: true };
    }

    const errKey = typeof row.error === 'string' ? row.error.trim() : '';
    if (errKey === 'server_misconfigured') {
      return {
        ok: false,
        code: 'server_misconfigured',
        message: typeof row.message === 'string' ? row.message : undefined,
      };
    }

    if (KNOWN_CODES.has(errKey as AdminUserActionErrorCode)) {
      return {
        ok: false,
        code: errKey as AdminUserActionErrorCode,
        message: typeof row.message === 'string' ? row.message : undefined,
      };
    }

    if (response.status === 401) return { ok: false, code: 'unauthorized' };
    if (response.status === 403) return { ok: false, code: 'forbidden' };

    return null;
  } catch {
    return null;
  }
}

/**
 * 1) digisac-dashboard (Edge no Supabase, service_role automático)
 * 2) /api/admin-user-action (requer SUPABASE_SERVICE_ROLE_KEY no .env ou na Vercel)
 */
export async function runAdminUserAction(body: AdminUserActionBody): Promise<AdminUserActionResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, code: 'unauthorized' };
  }

  const viaDigisac = await invokeDigisacAdmin(token, body);
  if (viaDigisac?.ok) {
    return viaDigisac;
  }
  if (viaDigisac && viaDigisac.code !== 'server_misconfigured') {
    return viaDigisac;
  }

  const viaApi = await invokeLocalOrVercelApi(token, body);
  if (viaApi?.ok) {
    return viaApi;
  }
  if (viaApi && viaApi.code !== 'server_misconfigured') {
    return viaApi;
  }

  if (viaApi?.code === 'server_misconfigured') {
    return viaApi;
  }
  if (viaDigisac?.code === 'server_misconfigured') {
    return viaDigisac;
  }

  return { ok: false, code: 'server_misconfigured' };
}

export function formatAdminActionErrorMessage(
  code: AdminUserActionErrorCode,
  detail?: string,
): string {
  if (code === 'server_misconfigured') {
    if (detail === 'digisac_sem_admin' || detail?.includes('digisac_sem_admin')) {
      return (
        'Atualize a Edge Function no Supabase: crie admin-users em ' +
        'https://supabase.com/dashboard/project/ffvgrvrkuiypjzfdcfyw/functions ' +
        '(Deploy new function → nome admin-users → cole COLE_NO_PAINEL_index.ts → Deploy).'
      );
    }
    if (detail?.includes('ittmglvk') || detail?.includes('ffvgrvrk')) {
      return detail;
    }
    if (detail?.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return detail;
    }
    const isProd =
      typeof window !== 'undefined' && !/localhost|127\.0\.0\.1/.test(window.location.hostname);
    if (isProd) {
      return (
        'Configure SUPABASE_SERVICE_ROLE_KEY na Vercel (mesmo valor do .env, projeto ffvgrvrkuiypjzfdcfyw) ' +
        'e faça Redeploy — ou publique a Edge Function admin-users no Supabase.'
      );
    }
    return (
      'No .env: VITE_SUPABASE_URL=https://ffvgrvrkuiypjzfdcfyw.supabase.co e ' +
      'SUPABASE_SERVICE_ROLE_KEY com a service_role desse mesmo projeto (não ittmglvk). Reinicie npm run dev.'
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
