import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function assertCallerIsAdmin(req: Request): Promise<
  | { ok: true; callerId: string; admin: ReturnType<typeof createClient> }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get("Authorization")?.trim();
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: json({ error: "unauthorized" }, 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !anonKey || !serviceRole) {
    console.error("admin-user-actions: missing Supabase env");
    return { ok: false, response: json({ error: "server_misconfigured" }, 500) };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !caller?.id) {
    return { ok: false, response: json({ error: "unauthorized" }, 401) };
  }

  const { data: roleRow, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (roleErr || roleRow?.role !== "admin") {
    return { ok: false, response: json({ error: "forbidden" }, 403) };
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { ok: true, callerId: caller.id, admin };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const gate = await assertCallerIsAdmin(req);
  if (!gate.ok) return gate.response;

  const { callerId, admin } = gate;

  let body: { action?: string; target_user_id?: string; new_password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const targetId = typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";

  if (!targetId) {
    return json({ error: "missing_target_user_id" }, 400);
  }

  if (action === "delete_user") {
    if (targetId === callerId) {
      return json({ error: "cannot_delete_self" }, 400);
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
        return json({ error: "server_error" }, 500);
      }
      if ((count ?? 0) <= 1) {
        return json({ error: "cannot_delete_last_admin" }, 400);
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      console.error("admin-user-actions: deleteUser", delErr.message);
      return json({ error: "delete_failed", message: delErr.message }, 400);
    }

    return json({ ok: true });
  }

  if (action === "set_user_password") {
    const pw = typeof body.new_password === "string" ? body.new_password : "";
    if (pw.length < 6) {
      return json({ error: "weak_password" }, 400);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password: pw });
    if (updErr) {
      console.error("admin-user-actions: updateUser", updErr.message);
      return json({ error: "update_failed", message: updErr.message }, 400);
    }

    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
