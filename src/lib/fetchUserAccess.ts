import { supabase } from '@/integrations/supabase/client';
import { runTimedQuery } from '@/lib/supabaseTimedQuery';

const API_TIMEOUT_MS = 4_000;
const SUPABASE_ACCESS_TIMEOUT_MS = 8_000;

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
  }, SUPABASE_ACCESS_TIMEOUT_MS);
}

async function fetchUserAccessViaApi(accessToken: string): Promise<UserAccessResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch('/api/my-access', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`my-access ${res.status}`);
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
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function firstFulfilled<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let failures = 0;
    for (const p of promises) {
      p.then(resolve).catch(() => {
        if (++failures === promises.length) reject(new Error('all_sources_failed'));
      });
    }
  });
}

/** API e Supabase em paralelo — usa o que responder primeiro (menos espera no login). */
export async function fetchUserAccess(
  accessToken: string,
  userId: string,
): Promise<UserAccessResult> {
  try {
    return await firstFulfilled([
      fetchUserAccessViaApi(accessToken),
      fetchUserAccessFromSupabase(userId),
    ]);
  } catch {
    return DEFAULT_USER_ACCESS;
  }
}
