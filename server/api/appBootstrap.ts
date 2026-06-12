import { createClient } from "@supabase/supabase-js";
import type { AdminConfig } from "./supabaseConfig.js";
import { fetchKanbanBoardWithAdmin } from "./kanbanBoard.js";

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

/** Login: permissões + Kanban num único pedido (1 ida à Vercel em vez de 7+). */
export async function fetchAppBootstrapCore(
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

  const [roleRes, permsRes, board] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", user.id),
    admin.from("user_permissions").select("permission_key, allowed").eq("user_id", user.id),
    fetchKanbanBoardWithAdmin(admin),
  ]);

  if (roleRes.error) {
    return { status: 500, body: { error: "role_fetch_failed", message: roleRes.error.message } };
  }
  if (permsRes.error) {
    return {
      status: 500,
      body: { error: "permissions_fetch_failed", message: permsRes.error.message },
    };
  }
  if ("error" in board) {
    return { status: 500, body: { error: "kanban_fetch_failed", message: board.error } };
  }

  const roles = (roleRes.data ?? []).map((r) => r.role as string);

  return {
    status: 200,
    body: {
      userId: user.id,
      role: resolveRoleFromRows(roles),
      permissions: buildPermissionsMap(permsRes.data),
      kanban: board,
    },
  };
}
