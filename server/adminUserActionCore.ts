import { createClient } from "@supabase/supabase-js";
import { isAuthUserNotFoundError, purgeUserData } from "../api/lib/purgeUserData.js";

export type AdminBody = {
  action?: string;
  target_user_id?: string;
  new_password?: string;
};

export type AdminConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRole: string;
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

  const userClient = createClient(config.supabaseUrl, config.anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jwt = authHeader.slice(7).trim();
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(jwt);
  if (authErr || !caller?.id) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const admin = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerRoles, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  if (roleErr) {
    return { status: 500, body: { error: "server_error", message: roleErr.message } };
  }

  const isCallerAdmin = (callerRoles ?? []).some((r) => r.role === "admin");
  if (!isCallerAdmin) {
    return { status: 403, body: { error: "forbidden" } };
  }

  if (action === "delete_user") {
    if (targetId === caller.id) {
      return { status: 400, body: { error: "cannot_delete_self" } };
    }

    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId);

    if ((targetRoles ?? []).some((r) => r.role === "admin")) {
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

    const purge = await purgeUserData(admin, targetId);
    if (purge.error) {
      return { status: 500, body: { error: "delete_failed", message: purge.error } };
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr && !isAuthUserNotFoundError(delErr.message)) {
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

/** Lê credenciais do process.env (ficheiro .env na raiz). */
export function adminConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AdminConfig | { error: string } {
  const supabaseUrl =
    env.VITE_SUPABASE_URL?.trim() || env.SUPABASE_URL?.trim() || "";
  const anonKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.SUPABASE_ANON_KEY?.trim() ||
    "";
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!supabaseUrl || !anonKey || !serviceRole) {
    const ref = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1] ?? "ittmglvkympbyeowgucl";
    return {
      error:
        `Defina SUPABASE_SERVICE_ROLE_KEY no .env (service_role do mesmo projeto que VITE_SUPABASE_URL: ${ref}).`,
    };
  }

  const urlRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/i)?.[1];
  try {
    const part = serviceRole.split(".")[1];
    const roleRef = part
      ? (JSON.parse(
          Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
        ) as { ref?: string }).ref
      : null;
    if (urlRef && roleRef && urlRef !== roleRef) {
      return {
        error: `SUPABASE_SERVICE_ROLE_KEY é do projeto "${roleRef}" mas VITE_SUPABASE_URL é "${urlRef}". Use chaves do mesmo projeto Supabase (Settings → API).`,
      };
    }
  } catch {
    /* ignore parse errors */
  }

  return { supabaseUrl, anonKey, serviceRole };
}
