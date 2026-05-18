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
  | 'edge_not_deployed'
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
    const code = extractKnownCode(row.error);
    if (code) return { ok: false, code, message: row.error };
    return { ok: false, code: 'server_error', message: row.error };
  }
  if (row.error === true && typeof row.message === 'string') {
    if (row.code === 'UNAUTHORIZED') return { ok: false, code: 'unauthorized', message: row.message };
    if (row.code === 'FORBIDDEN') return { ok: false, code: 'forbidden', message: row.message };
    const known = extractKnownCode(row.message);
    if (known) return { ok: false, code: known, message: row.message };
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

function rpcPayload(body: AdminUserActionBody): Record<string, string> {
  if (body.action === 'delete_user') {
    return { target_user_id: body.target_user_id };
  }
  return { target_user_id: body.target_user_id, new_password: body.new_password };
}

async function invokeAdminViaJsonRpc(body: AdminUserActionBody): Promise<AdminUserActionResult> {
  const rpcName = body.action === 'delete_user' ? 'rpc_admin_delete_user' : 'rpc_admin_set_password';
  const { data, error } = await supabase.rpc(rpcName, { params: rpcPayload(body) });
  if (error) {
    return { ok: false, code: mapPostgrestToCode(error), message: error.message };
  }
  if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === true) {
    return { ok: true };
  }
  return { ok: true };
}

async function invokeAdminViaEdge(
  functionName: 'admin-users' | 'digisac-dashboard',
  body: AdminUserActionBody,
): Promise<AdminUserActionResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, code: 'unauthorized' };
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    if (error instanceof FunctionsFetchError) {
      if (functionName === 'admin-users') {
        return { ok: false, code: 'edge_not_deployed', message: error.message };
      }
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
  // 1) Edge Function dedicada (recomendado após deploy no painel Supabase)
  const edgeAdmin = await invokeAdminViaEdge('admin-users', body);
  if (edgeAdmin.ok) return edgeAdmin;
  if (edgeAdmin.code !== 'edge_not_deployed') return edgeAdmin;

  // 2) RPC jsonb (execute APLICAR_EM_ffvgrvrkuiypjzfdcfyw.sql)
  const rpcResult = await invokeAdminViaJsonRpc(body);
  if (rpcResult.ok || rpcResult.code !== 'rpc_not_deployed') {
    return rpcResult;
  }

  // 3) Edge digisac-dashboard (se tiver versão com ações admin)
  const edgeDigisac = await invokeAdminViaEdge('digisac-dashboard', body);
  if (edgeDigisac.ok) return edgeDigisac;

  return rpcResult;
}

export function formatAdminActionErrorMessage(
  code: AdminUserActionErrorCode,
  detail?: string,
): string {
  const projectRef = getConfiguredSupabaseProjectRef() ?? EXPECTED_PROJECT_REF;

  if (code === 'rpc_not_deployed') {
    return (
      `A API ainda não expõe as funções no projeto ${projectRef}. ` +
      `Execute de novo (query nova, só isto) no SQL Editor: NOTIFY pgrst, 'reload schema'; ` +
      `e confirme que rodou o script atualizado supabase/scripts/APLICAR_EM_ffvgrvrkuiypjzfdcfyw.sql ` +
      `(funções rpc_admin_set_password e rpc_admin_delete_user).`
    );
  }

  if (code === 'edge_not_deployed') {
    return (
      `Publique a Edge Function "admin-users" no Supabase (projeto ${projectRef}): ` +
      `Edge Functions → Create → nome admin-users → cole o código de supabase/functions/admin-users/index.ts → Deploy. ` +
      `Enquanto isso, execute o SQL atualizado acima.`
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
    edge_not_deployed: '',
    server_error: 'Não foi possível concluir a operação.',
  };

  const msg = base[code] ?? base.server_error;
  if ((code === 'server_error' || code === 'delete_failed' || code === 'update_failed') && detail?.trim()) {
    const short = detail.length > 160 ? `${detail.slice(0, 160)}…` : detail;
    return `${msg} (${short})`;
  }
  return msg;
}
