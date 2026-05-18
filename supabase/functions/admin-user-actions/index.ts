import { corsHeaders } from "../_shared/cors.ts";
import { assertCallerIsAdmin, runAdminUserAction, type AdminUserActionBody } from "../_shared/adminUserActions.ts";

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
    console.error("admin-user-actions: missing Supabase env");
    return json({ error: "server_misconfigured" }, 500);
  }

  const gate = await assertCallerIsAdmin(authHeader, supabaseUrl, anonKey, serviceRole);
  if (!gate.ok) return json(gate.body, gate.status);

  let body: AdminUserActionBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const result = await runAdminUserAction(gate, body);
  return json(result.body, result.status);
});
