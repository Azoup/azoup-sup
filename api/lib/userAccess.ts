import { createClient } from "@supabase/supabase-js";
import type { AdminConfig } from "./supabaseConfig";

function isPermissionAllowed(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function buildPermissionsMap(
  rows: { permission_key: string; allowed: unknown }[] | null | undefined,
): Record<string, boolean> | null {
  if (!rows?.length) return null;
  return Object.fromEntries(
    rows.map((p) => [p.permission_key, isPermissionAllowed(p.allowed)]),
  );
}

function resolveRoleFromRows(roles: string[]): string {
  if (!roles.length) return "user";
  if (roles.includes("admin")) return "admin";
  return roles[0] || "user";
}

export async function fetchUserAccessCore(
  authHeader: string,
  config: AdminConfig,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const jwt = authHeader.slice(7).trim();

  const userClient = createClient(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser(jwt);
  if (authErr || !user?.id) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const admin = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (roleErr) {
    return { status: 500, body: { error: "role_fetch_failed", message: roleErr.message } };
  }

  const { data: perms, error: permsErr } = await admin
    .from("user_permissions")
    .select("permission_key, allowed")
    .eq("user_id", user.id);
  if (permsErr) {
    return { status: 500, body: { error: "permissions_fetch_failed", message: permsErr.message } };
  }

  const roles = (roleRows ?? []).map((r) => r.role as string);

  return {
    status: 200,
    body: {
      role: resolveRoleFromRows(roles),
      permissions: buildPermissionsMap(perms),
    },
  };
}
