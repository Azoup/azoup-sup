import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type AdminBody = {
  action?: string;
  target_user_id?: string;
  new_password?: string;
};

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
}

function env(name: string, fallback?: string): string | undefined {
  return process.env[name]?.trim() || fallback?.trim() || undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const supabaseUrl = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY") ?? env("VITE_SUPABASE_PUBLISHABLE_KEY");
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRole) {
    return res.status(500).json({
      error: "server_misconfigured",
      message: "Defina SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL e SUPABASE_ANON_KEY na Vercel.",
    });
  }

  const authHeader = req.headers.authorization?.trim();
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const body = (req.body ?? {}) as AdminBody;
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const targetId = typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";

  if (!targetId) {
    return res.status(400).json({ error: "missing_target_user_id" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jwt = authHeader.slice(7).trim();
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(jwt);
  if (authErr || !caller?.id) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { data: roleRow, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (roleErr || roleRow?.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (action === "delete_user") {
    if (targetId === caller.id) {
      return res.status(400).json({ error: "cannot_delete_self" });
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
        return res.status(500).json({ error: "server_error" });
      }
      if ((count ?? 0) <= 1) {
        return res.status(400).json({ error: "cannot_delete_last_admin" });
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      return res.status(400).json({ error: "delete_failed", message: delErr.message });
    }

    return res.status(200).json({ ok: true });
  }

  if (action === "set_user_password") {
    const pw = typeof body.new_password === "string" ? body.new_password : "";
    if (pw.length < 6) {
      return res.status(400).json({ error: "weak_password" });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password: pw });
    if (updErr) {
      return res.status(400).json({ error: "update_failed", message: updErr.message });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "unknown_action" });
}
