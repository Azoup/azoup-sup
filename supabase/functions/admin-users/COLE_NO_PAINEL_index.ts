/**
 * Cole TODO este ficheiro no editor da Edge Function "admin-users"
 * Projeto: ittmglvkympbyeowgucl
 * URL final: https://ittmglvkympbyeowgucl.supabase.co/functions/v1/admin-users
 *
 * Passos: Supabase → Edge Functions → Deploy a new function → nome: admin-users
 * → apagar código default → colar ESTE ficheiro inteiro → Deploy
 * → JWT verification: ON
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, prefer, accept-profile, x-supabase-api-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type AdminBody = {
  action?: string;
  target_user_id?: string;
  new_password?: string;
};

async function assertCallerIsAdmin(
  authHeader: string,
  supabaseUrl: string,
  anonKey: string,
  serviceRole: string,
) {
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jwt = authHeader.slice(7).trim();
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(jwt);
  if (authErr || !caller?.id) {
    return { ok: false as const, status: 401, body: { error: "unauthorized" } };
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerRoles, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  if (roleErr) {
    return { ok: false as const, status: 500, body: { error: "server_error", message: roleErr.message } };
  }

  const isCallerAdmin = (callerRoles ?? []).some((r) => r.role === "admin");
  if (!isCallerAdmin) {
    return { ok: false as const, status: 403, body: { error: "forbidden" } };
  }

  return { ok: true as const, callerId: caller.id, admin };
}

async function runAdminAction(
  gate: { callerId: string; admin: ReturnType<typeof createClient> },
  body: AdminBody,
) {
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const targetId = typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";

  if (!targetId) {
    return { ok: false as const, status: 400, body: { error: "missing_target_user_id" } };
  }

  const { callerId, admin } = gate;

  if (action === "delete_user") {
    if (targetId === callerId) {
      return { ok: false as const, status: 400, body: { error: "cannot_delete_self" } };
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
        return { ok: false as const, status: 500, body: { error: "server_error" } };
      }
      if ((count ?? 0) <= 1) {
        return { ok: false as const, status: 400, body: { error: "cannot_delete_last_admin" } };
      }
    }

    const purgeResults = await Promise.all([
      admin.from("user_permissions").delete().eq("user_id", targetId),
      admin.from("user_roles").delete().eq("user_id", targetId),
      admin.from("profiles").delete().eq("id", targetId),
    ]);
    const purgeFail = purgeResults.find((r) => r.error);
    if (purgeFail?.error) {
      return { ok: false as const, status: 500, body: { error: "delete_failed", message: purgeFail.error.message } };
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    const notFound =
      delErr &&
      /not found|not_found|does not exist/i.test(delErr.message);
    if (delErr && !notFound) {
      return { ok: false as const, status: 400, body: { error: "delete_failed", message: delErr.message } };
    }

    return { ok: true as const, status: 200, body: { ok: true } };
  }

  if (action === "set_user_password") {
    const pw = typeof body.new_password === "string" ? body.new_password : "";
    if (pw.length < 6) {
      return { ok: false as const, status: 400, body: { error: "weak_password" } };
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password: pw });
    if (updErr) {
      return { ok: false as const, status: 400, body: { error: "update_failed", message: updErr.message } };
    }

    return { ok: true as const, status: 200, body: { ok: true } };
  }

  return { ok: false as const, status: 400, body: { error: "unknown_action" } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization")?.trim();
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !anonKey || !serviceRole) {
    return json({ error: "server_misconfigured" }, 500);
  }

  let rawBody: Record<string, unknown> = {};
  try {
    rawBody = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = typeof rawBody.action === "string" ? rawBody.action : "";
  const payload =
    rawBody.payload && typeof rawBody.payload === "object"
      ? (rawBody.payload as Record<string, unknown>)
      : {};

  const adminBody: AdminBody = {
    action: action || (typeof rawBody.action === "string" ? rawBody.action : undefined),
    target_user_id:
      (typeof payload.target_user_id === "string" ? payload.target_user_id : undefined) ??
      (typeof rawBody.target_user_id === "string" ? rawBody.target_user_id : undefined),
    new_password:
      (typeof payload.new_password === "string" ? payload.new_password : undefined) ??
      (typeof rawBody.new_password === "string" ? rawBody.new_password : undefined),
  };

  const gate = await assertCallerIsAdmin(authHeader, supabaseUrl, anonKey, serviceRole);
  if (!gate.ok) return json(gate.body, gate.status);

  const result = await runAdminAction(gate, adminBody);
  return json(result.body, result.status);
});
