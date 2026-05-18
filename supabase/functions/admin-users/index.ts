import { corsHeaders } from "../_shared/cors.ts";
import {
  assertCallerIsAdmin,
  normalizeAdminBody,
  runAdminUserAction,
} from "../_shared/adminUserActions.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

  const gate = await assertCallerIsAdmin(authHeader, supabaseUrl, anonKey, serviceRole);
  if (!gate.ok) return json(gate.body, gate.status);

  const adminBody = normalizeAdminBody(action, payload, rawBody);
  const result = await runAdminUserAction(gate, adminBody);
  return json(result.body, result.status);
});
