import { supabase } from '@/integrations/supabase/client';
import { runTimedQuery } from '@/lib/supabaseTimedQuery';

const ACCESS_FETCH_TIMEOUT_MS = 12_000;

export type UserAccessResult = {
  role: string;
  permissions: Record<string, boolean> | null;
};

export const DEFAULT_USER_ACCESS: UserAccessResult = {
  role: 'user',
  permissions: null,
};

export function isPermissionAllowed(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

export function buildPermissionsMap(
  rows: { permission_key: string; allowed: unknown }[] | null | undefined,
): Record<string, boolean> | null {
  if (!rows || rows.length === 0) return null;
  return Object.fromEntries(
    rows.map((p) => [p.permission_key, isPermissionAllowed(p.allowed)]),
  );
}

export function resolveRoleFromRows(roles: string[] | undefined): string {
  if (!roles?.length) return 'user';
  if (roles.includes('admin')) return 'admin';
  return roles[0] || 'user';
}

export async function fetchUserAccessFromSupabase(userId: string): Promise<UserAccessResult> {
  return runTimedQuery(async () => {
    const [roleRes, permsRes] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('user_permissions').select('permission_key, allowed').eq('user_id', userId),
    ]);

    if (roleRes.error) throw roleRes.error;
    if (permsRes.error) throw permsRes.error;

    const roles = (roleRes.data ?? []).map((r) => r.role as string);
    return {
      role: resolveRoleFromRows(roles),
      permissions: buildPermissionsMap(permsRes.data),
    };
  });
}

export async function fetchUserAccess(
  accessToken: string,
  userId: string,
): Promise<UserAccessResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ACCESS_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch('/api/my-access', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (res.ok) {
      const data = (await res.json()) as UserAccessResult;
      const permissions = data.permissions
        ? Object.fromEntries(
            Object.entries(data.permissions).map(([k, v]) => [k, isPermissionAllowed(v)]),
          )
        : null;
      return {
        role: data.role || 'user',
        permissions,
      };
    }

    console.warn('[access] /api/my-access falhou:', res.status, '— usando Supabase direto');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[access] Erro na API, usando Supabase direto:', message);
  } finally {
    window.clearTimeout(timeoutId);
  }

  try {
    return await fetchUserAccessFromSupabase(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[access] Erro ao carregar permissões pelo Supabase:', message);
    return DEFAULT_USER_ACCESS;
  }
}
