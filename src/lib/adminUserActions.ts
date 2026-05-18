import { supabase } from '@/integrations/supabase/client';
import type { PostgrestError } from '@supabase/supabase-js';

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

const KNOWN_CODES = new Set<string>([
  'unauthorized',
  'forbidden',
  'weak_password',
  'cannot_delete_self',
  'cannot_delete_last_admin',
  'user_not_found',
  'delete_failed',
  'update_failed',
]);

function isRpcMissing(error: PostgrestError): boolean {
  const msg = (error.message ?? '').toLowerCase();
  const details = (error.details ?? '').toLowerCase();
  return (
    error.code === 'PGRST202' ||
    msg.includes('could not find the function') ||
    msg.includes('admin_delete_auth_user') ||
    msg.includes('admin_set_user_password') ||
    details.includes('admin_delete_auth_user') ||
    details.includes('admin_set_user_password')
  );
}

function mapPostgrestToCode(error: PostgrestError): AdminUserActionErrorCode {
  if (isRpcMissing(error)) return 'rpc_not_deployed';
  const key = (error.message ?? '').trim();
  if (KNOWN_CODES.has(key)) return key as AdminUserActionErrorCode;
  return 'server_error';
}

export type AdminUserActionResult =
  | { ok: true }
  | { ok: false; code: AdminUserActionErrorCode; message?: string };

/** Define senha ou exclui utilizador via RPC Postgres (sem Edge Function). */
export async function runAdminUserAction(body: AdminUserActionBody): Promise<AdminUserActionResult> {
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

  if (body.action === 'set_user_password') {
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

  return { ok: false, code: 'unknown_action' };
}

export const ADMIN_ACTION_ERROR_MESSAGES: Record<AdminUserActionErrorCode, string> = {
  unauthorized: 'Sessão inválida. Faça login novamente.',
  forbidden: 'Sem permissão de administrador.',
  weak_password: 'A nova senha deve ter pelo menos 6 caracteres.',
  cannot_delete_self: 'Não é possível excluir a própria conta.',
  cannot_delete_last_admin: 'Não é possível excluir o último administrador.',
  user_not_found: 'Utilizador não encontrado.',
  delete_failed: 'Não foi possível excluir o cadastro.',
  update_failed: 'Não foi possível definir a senha.',
  unknown_action: 'Operação inválida.',
  rpc_not_deployed:
    'As funções de administração ainda não foram criadas na base de dados. No Supabase (projeto ffvgrvrkuiypjzfdcfyw), abra SQL Editor e execute o ficheiro supabase/migrations/20260515120000_admin_user_management_rpc.sql',
  server_error: 'Não foi possível concluir a operação. Tente novamente.',
};
