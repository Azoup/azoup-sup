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

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function projectRefFromUrl(url: string): string | null {
  const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/i);
  return m?.[1] ?? null;
}

function projectRefFromJwt(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as { ref?: string; project_ref?: string };
    return payload.ref ?? payload.project_ref ?? null;
  } catch {
    return null;
  }
}

function resolveConfig():
  | { supabaseUrl: string; anonKey: string; serviceRole: string }
  | { error: string } {
  const supabaseUrl = env("VITE_SUPABASE_URL") ?? env("SUPABASE_URL");
  const anonKey =
    env("VITE_SUPABASE_PUBLISHABLE_KEY") ?? env("SUPABASE_ANON_KEY") ?? env("SUPABASE_PUBLISHABLE_KEY");
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRole) {
    return {
      error:
        "Defina SUPABASE_SERVICE_ROLE_KEY no .env (service_role do projeto ffvgrvrkuiypjzfdcfyw, não ittmglvk).",
    };
  }

  const urlRef = projectRefFromUrl(supabaseUrl);
  const roleRef = projectRefFromJwt(serviceRole);
  if (urlRef && roleRef && urlRef !== roleRef) {
    return {
      error: `SUPABASE_SERVICE_ROLE_KEY é do projeto "${roleRef}" mas VITE_SUPABASE_URL é "${urlRef}". Use a service_role de ffvgrvrkuiypjzfdcfyw.`,
    };
  }

  return { supabaseUrl, anonKey, serviceRole };
}

async function runAction(
  authHeader: string,
  body: AdminBody,
  config: { supabaseUrl: string; anonKey: string; serviceRole: string },
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

  const { data: roleRow, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (roleErr || roleRow?.role !== "admin") {
    return { status: 403, body: { error: "forbidden" } };
  }

  const admin = createClient(config.supabaseUrl, config.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const config = resolveConfig();
  if ("error" in config) {
    return res.status(500).json({ error: "server_misconfigured", message: config.error });
  }

  const authHeader = req.headers.authorization?.trim();
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const result = await runAction(authHeader, (req.body ?? {}) as AdminBody, config);
  return res.status(result.status).json(result.body);
}
