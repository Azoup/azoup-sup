import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: { email?: string; code?: string; new_password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = normalizeCode(typeof body.code === "string" ? body.code : "");
  const newPassword = typeof body.new_password === "string" ? body.new_password : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "invalid_email" }, 400);
  }
  if (code.length !== 6) {
    return json({ error: "invalid_code" }, 400);
  }
  if (newPassword.length < 6) {
    return json({ error: "weak_password" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const pepper = (Deno.env.get("PASSWORD_RESET_CODE_PEPPER") ?? "").trim();
  if (!supabaseUrl || !serviceRole || !pepper) {
    console.error("password-reset-confirm-code: missing env");
    return json({ error: "server_misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const codeHash = await sha256Hex(`${pepper}|${email}|${code}`);
  const now = new Date().toISOString();

  const { data: row, error: selErr } = await admin
    .from("password_reset_codes")
    .select("id")
    .eq("email", email)
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    console.error("password-reset-confirm-code: select", selErr.message);
    return json({ error: "server_error" }, 500);
  }
  if (!row?.id) {
    return json({ error: "invalid_code" }, 400);
  }

  const { data: userId, error: rpcErr } = await admin.rpc("lookup_auth_user_id_by_email", { p_email: email });
  if (rpcErr || !userId) {
    return json({ error: "invalid_code" }, 400);
  }

  const { error: updUserErr } = await admin.auth.admin.updateUserById(userId as string, {
    password: newPassword,
  });

  if (updUserErr) {
    console.error("password-reset-confirm-code: updateUser", updUserErr.message);
    return json({ error: "update_failed" }, 500);
  }

  await admin.from("password_reset_codes").update({ used_at: now }).eq("id", row.id);

  return json({ ok: true });
});
