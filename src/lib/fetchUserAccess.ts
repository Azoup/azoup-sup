const ACCESS_FETCH_TIMEOUT_MS = 12_000;

export type UserAccessResult = {
  role: string;
  permissions: Record<string, boolean> | null;
};

export const DEFAULT_USER_ACCESS: UserAccessResult = {
  role: 'user',
  permissions: null,
};

export async function fetchUserAccess(accessToken: string): Promise<UserAccessResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ACCESS_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch('/api/my-access', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn('[access] /api/my-access falhou:', res.status);
      return DEFAULT_USER_ACCESS;
    }

    const data = (await res.json()) as UserAccessResult;
    return {
      role: data.role || 'user',
      permissions: data.permissions ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[access] Erro ao carregar permissões:', message);
    return DEFAULT_USER_ACCESS;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
