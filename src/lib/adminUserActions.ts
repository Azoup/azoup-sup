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

    return mapResponseToResult(response.status, payload);
  } catch {
    return null;
  }
}

async function invokeEdgeFunction(
  functionName: string,
  token: string,
  body: AdminUserActionBody,
): Promise<AdminUserActionResult | null> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: {
      action: body.action,
      target_user_id: body.target_user_id,
      ...(body.action === 'set_user_password' ? { new_password: body.new_password } : {}),
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    const msg = error.message ?? '';
    if (/not found|404|failed to fetch|non-2xx|function not found/i.test(msg)) {
      return null;
    }
    if (/jwt|unauthorized|401/i.test(msg)) {
      return { ok: false, code: 'unauthorized' };
    }
    if (/forbidden|403/i.test(msg)) {
      return { ok: false, code: 'forbidden' };
    }
    return { ok: false, code: 'server_error', message: msg };
  }

  const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
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

  if (row.error === true) {
    const msg = typeof row.message === 'string' ? row.message : '';
    if (/CONFIG_MISSING|Digisac/i.test(msg)) {
      return null;
    }
    return { ok: false, code: 'server_error', message: msg || undefined };
  }

  return null;
}

/**
 * Ordem: API (.env / Vercel) → Edge admin-users → digisac-dashboard.
 * Não usa RPC (evita erro PGRST202 / NOTIFY).
 */
export async function runAdminUserAction(body: AdminUserActionBody): Promise<AdminUserActionResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, code: 'unauthorized' };
  }

  const viaApi = await invokeLocalOrVercelApi(token, body);
  if (viaApi?.ok) {
    return viaApi;
  }
  if (viaApi && !viaApi.ok && viaApi.code !== 'server_misconfigured') {
    return viaApi;
  }

  const viaAdminUsers = await invokeEdgeFunction('admin-users', token, body);
  if (viaAdminUsers) {
    return viaAdminUsers;
  }

  const viaDigisac = await invokeEdgeFunction('digisac-dashboard', token, body);
  if (viaDigisac) {
    return viaDigisac;
  }

  if (viaApi && !viaApi.ok) {
    return viaApi;
  }

  return { ok: false, code: 'server_misconfigured' };
}

export function formatAdminActionErrorMessage(
  code: AdminUserActionErrorCode,
  detail?: string,
): string {
  if (code === 'server_misconfigured') {
    if (detail?.includes('ittmglvk') || detail?.includes('ffvgrvrk')) {
      return detail;
    }
    return (
      'Não foi possível alterar a senha. No .env, use SUPABASE_SERVICE_ROLE_KEY do projeto ffvgrvrkuiypjzfdcfyw ' +
      '(Supabase → Settings → API → service_role). Ou crie a Edge Function admin-users no Supabase ' +
      '(ficheiro COLE_NO_PAINEL_index.ts).'
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
