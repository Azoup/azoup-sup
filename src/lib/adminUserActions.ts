import { supabase } from '@/integrations/supabase/client';
import { FunctionsFetchError, FunctionsHttpError, type PostgrestError } from '@supabase/supabase-js';
import { getConfiguredSupabaseProjectRef } from '@/lib/supabaseProject';

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
  | 'rpc_not_deployed'
  | 'server_error';

const KNOWN_CODES: AdminUserActionErrorCode[] = [
  'unauthorized',
  'forbidden',
  'weak_password',
  'cannot_delete_self',
  'cannot_delete_last_admin',
  'user_not_found',
  'delete_failed',
  'update_failed',
];

const EXPECTED_PROJECT_REF = 'ffvgrvrkuiypjzfdcfyw';

function isRpcMissing(error: PostgrestError): boolean {
  return error.code === 'PGRST202';
}

function extractKnownCode(text: string): AdminUserActionErrorCode | null {
  const lower = text.toLowerCase();
  for (const code of KNOWN_CODES) {
    if (lower.includes(code)) return code;
  }
  return null;
}

function mapPostgrestToCode(error: PostgrestError): AdminUserActionErrorCode {
  if (isRpcMissing(error)) return 'rpc_not_deployed';
  const parts = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  return extractKnownCode(parts) ?? 'server_error';
}

function parseEdgePayload(data: unknown): AdminUserActionResult | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (row.ok === true) return { ok: true };
  if (typeof row.error === 'string') {
    const code = extractKnownCode(row.error) ?? (row.error as AdminUserActionErrorCode);
    return {
      ok: false,
      code: KNOWN_CODES.includes(code as AdminUserActionErrorCode) ? (code as AdminUserActionErrorCode) : 'server_error',
      message: typeof row.message === 'string' ? row.message : row.error,
    };
  }
  if (row.error === true && typeof row.message === 'string') {
    if (row.code === 'UNAUTHORIZED') return { ok: false, code: 'unauthorized', message: row.message };
    if (row.code === 'FORBIDDEN') return { ok: false, code: 'forbidden', message: row.message };
    const known = extractKnownCode(row.message);
    if (known) return { ok: false, code: known, message: row.message };
    if (String(row.message).toLowerCase().includes('ação inválida')) {
      return { ok: false, code: 'rpc_not_deployed', message: row.message };
    }
    return { ok: false, code: 'server_error', message: row.message };
  }
  return null;
}

async function getAccessToken(): Promise<string | null> {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data: ref } = await supabase.auth.refreshSession();
    session = ref.session ?? null;
  }
  return session?.access_token ?? null;
}

async function invokeAdminViaRpc(body: AdminUserActionBody): Promise<AdminUserActionResult> {
  if (body.action === 'delete_user') {
    const { data, error } = await supabase.rpc('admin_delete_auth_user', {
      target_user_id: body.target_user_id,
    });
    if (error) {
      return { ok: false, code: mapPostgrestToCode(error), message: error.message };
    }
    if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === true) {
      return { ok: true };
    }
    return { ok: true };
  }

  const { data, error } = await supabase.rpc('admin_set_user_password', {
    target_user_id: body.target_user_id,
    new_password: body.new_password,
  });
  if (error) {
    return { ok: false, code: mapPostgrestToCode(error), message: error.message };
  }
  if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === true) {
    return { ok: true };
  }
  return { ok: true };
}

/** Reserva: digisac-dashboard no mesmo projeto (requer deploy recente da função). */
async function invokeAdminViaEdge(body: AdminUserActionBody): Promise<AdminUserActionResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, code: 'unauthorized' };
  }

  const { data, error } = await supabase.functions.invoke('digisac-dashboard', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    if (error instanceof FunctionsFetchError) {
      return { ok: false, code: 'server_error', message: error.message };
    }
    if (error instanceof FunctionsHttpError) {
      return { ok: false, code: 'server_error', message: error.message };
    }
    return { ok: false, code: 'server_error', message: error.message };
  }

  const parsed = parseEdgePayload(data);
  if (parsed) return parsed;

  return { ok: false, code: 'server_error', message: 'Resposta inesperada do servidor.' };
}

export type AdminUserActionResult =
  | { ok: true }
  | { ok: false; code: AdminUserActionErrorCode; message?: string };

export async function runAdminUserAction(body: AdminUserActionBody): Promise<AdminUserActionResult> {
  const rpcResult = await invokeAdminViaRpc(body);
  if (rpcResult.ok || rpcResult.code !== 'rpc_not_deployed') {
    return rpcResult;
  }

  const edgeResult = await invokeAdminViaEdge(body);
  if (edgeResult.ok || edgeResult.code !== 'rpc_not_deployed') {
    return edgeResult;
  }

  return rpcResult;
}

export function formatAdminActionErrorMessage(
  code: AdminUserActionErrorCode,
  detail?: string,
): string {
  const projectRef = getConfiguredSupabaseProjectRef() ?? EXPECTED_PROJECT_REF;

  if (code === 'rpc_not_deployed') {
    return (
      `As funções de administração não existem no projeto ${projectRef} (onde o app está ligado). ` +
      `É muito provável que o SQL tenha sido executado no projeto errado (ex.: ittmglvkympbyeowgucl). ` +
      `Abra https://supabase.com/dashboard/project/${EXPECTED_PROJECT_REF}/sql/new , ` +
      `cole e execute o ficheiro supabase/scripts/APLICAR_EM_ffvgrvrkuiypjzfdcfyw.sql e aguarde 1 minuto.`
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
    rpc_not_deployed: '',
    server_error: 'Não foi possível concluir a operação.',
  };

  const msg = base[code] ?? base.server_error;
  if ((code === 'server_error' || code === 'delete_failed' || code === 'update_failed') && detail?.trim()) {
    const short = detail.length > 160 ? `${detail.slice(0, 160)}…` : detail;
    return `${msg} (${short})`;
  }
  return msg;
}
