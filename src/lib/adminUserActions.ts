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

/**
 * Ações de admin via API na Vercel (service role no servidor).
 * Não depende de Edge Function nem RPC no Supabase.
 */
export async function runAdminUserAction(body: AdminUserActionBody): Promise<AdminUserActionResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, code: 'unauthorized' };
  }

  const response = await fetch('/api/admin-user-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return mapResponseToResult(response.status, payload);
}

export function formatAdminActionErrorMessage(
  code: AdminUserActionErrorCode,
  detail?: string,
): string {
  if (code === 'server_misconfigured') {
    return (
      'Servidor sem SUPABASE_SERVICE_ROLE_KEY. Na Vercel → Settings → Environment Variables, ' +
      'adicione SUPABASE_SERVICE_ROLE_KEY (chave service_role do projeto ffvgrvrkuiypjzfdcfyw) e faça redeploy.'
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
