import { createClient } from "@supabase/supabase-js";
import type { AdminConfig } from "./supabaseConfig.js";

export type AdminBody = {
  action?: string;
  target_user_id?: string;
  new_password?: string;
};

export async function runAdminUserActionCore(
  authHeader: string,
  body: AdminBody,
  config: AdminConfig,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const targetId = typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";

  if (!targetId) {
    return { status: 400, body: { error: "missing_target_user_id" } };
  }

  const jwt = authHeader.slice(7).trim();
  const userClient = createClient(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: caller },
    error: authErr,
  } = await userClient.auth.getUser(jwt);
  if (authErr || !caller?.id) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const admin = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (roleErr || roleRow?.role !== "admin") {
    return { status: 403, body: { error: "forbidden" } };
  }

  if (action === "delete_user") {
    if (targetId === caller.id) {
      return { status: 400, body: { error: "cannot_delete_self" } };
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
        return { status: 500, body: { error: "server_error" } };
      }
      if ((count ?? 0) <= 1) {
        return { status: 400, body: { error: "cannot_delete_last_admin" } };
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      return { status: 400, body: { error: "delete_failed", message: delErr.message } };
    }

    return { status: 200, body: { ok: true } };
  }

  if (action === "set_user_password") {
    const pw = typeof body.new_password === "string" ? body.new_password : "";
    if (pw.length < 6) {
      return { status: 400, body: { error: "weak_password" } };
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password: pw });
    if (updErr) {
      return { status: 400, body: { error: "update_failed", message: updErr.message } };
    }

    return { status: 200, body: { ok: true } };
  }

  return { status: 400, body: { error: "unknown_action" } };
}
