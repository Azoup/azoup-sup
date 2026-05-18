import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

export type AdminUserActionBody = {
  action?: string;
  target_user_id?: string;
  new_password?: string;
};

export type AdminUserActionResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function assertCallerIsAdmin(
  authHeader: string,
  supabaseUrl: string,
  anonKey: string,
  serviceRole: string,
): Promise<
  | { ok: true; callerId: string; admin: SupabaseClient }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jwt = authHeader.slice(7).trim();
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(jwt);
  if (authErr || !caller?.id) {
    return { ok: false, status: 401, body: { error: "unauthorized" } };
  }

  const { data: roleRow, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (roleErr || roleRow?.role !== "admin") {
    return { ok: false, status: 403, body: { error: "forbidden" } };
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { ok: true, callerId: caller.id, admin };
}

export async function runAdminUserAction(
  gate: { callerId: string; admin: SupabaseClient },
  body: AdminUserActionBody,
): Promise<AdminUserActionResult> {
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const targetId = typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";

  if (!targetId) {
    return { ok: false, status: 400, body: { error: "missing_target_user_id" } };
  }

  const { callerId, admin } = gate;

  if (action === "delete_user") {
    if (targetId === callerId) {
      return { ok: false, status: 400, body: { error: "cannot_delete_self" } };
    }

    const { data: targetRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId)
      .maybeSingle();

    if (targetRole?.role === "admin") {
      const { count, error: cErr } = await admin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (cErr) {
        console.error("admin-user-actions: count admins", cErr.message);
        return { ok: false, status: 500, body: { error: "server_error" } };
      }
      if ((count ?? 0) <= 1) {
        return { ok: false, status: 400, body: { error: "cannot_delete_last_admin" } };
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      console.error("admin-user-actions: deleteUser", delErr.message);
      return { ok: false, status: 400, body: { error: "delete_failed", message: delErr.message } };
    }

    return { ok: true, status: 200, body: { ok: true } };
  }

  if (action === "set_user_password") {
    const pw = typeof body.new_password === "string" ? body.new_password : "";
    if (pw.length < 6) {
      return { ok: false, status: 400, body: { error: "weak_password" } };
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password: pw });
    if (updErr) {
      console.error("admin-user-actions: updateUser", updErr.message);
      return { ok: false, status: 400, body: { error: "update_failed", message: updErr.message } };
    }

    return { ok: true, status: 200, body: { ok: true } };
  }

  return { ok: false, status: 400, body: { error: "unknown_action" } };
}

/** Nomes de action aceites na função digisac-dashboard (proxy admin). */
export const ADMIN_USER_ACTIONS = new Set(["delete_user", "set_user_password"]);

export function normalizeAdminBody(
  action: string | undefined,
  payload: Record<string, unknown>,
  rawBody: Record<string, unknown>,
): AdminUserActionBody {
  const fromPayload = payload && typeof payload === "object" ? payload : {};
  return {
    action: action ?? (typeof rawBody.action === "string" ? rawBody.action : undefined),
    target_user_id:
      (typeof fromPayload.target_user_id === "string" ? fromPayload.target_user_id : undefined) ??
      (typeof rawBody.target_user_id === "string" ? rawBody.target_user_id : undefined),
    new_password:
      (typeof fromPayload.new_password === "string" ? fromPayload.new_password : undefined) ??
      (typeof rawBody.new_password === "string" ? rawBody.new_password : undefined),
  };
}
