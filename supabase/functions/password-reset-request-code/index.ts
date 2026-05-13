import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { corsHeaders } from "../_shared/cors.ts";
import { sendEmailJs } from "../_shared/emailjs.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_15_MIN = 5;

function generateSixDigitCode(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const n = (Number(buf[0]) * 0x100000000 + Number(buf[1])) % 1_000_000;
  return String(n).padStart(6, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "invalid_email" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const pepper = (Deno.env.get("PASSWORD_RESET_CODE_PEPPER") ?? "").trim();
  if (!supabaseUrl || !serviceRole || !pepper) {
    console.error("password-reset-request-code: missing SUPABASE_* or PASSWORD_RESET_CODE_PEPPER");
    return json({ error: "server_misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userId, error: rpcErr } = await admin.rpc("lookup_auth_user_id_by_email", { p_email: email });
  if (rpcErr) {
    console.warn("password-reset-request-code: rpc", rpcErr.message);
    return json({ ok: true });
  }
  if (!userId) {
    return json({ ok: true });
  }

  const since = new Date(Date.now() - CODE_TTL_MS).toISOString();
  const { count, error: countErr } = await admin
    .from("password_reset_codes")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);

  if (countErr) {
    console.error("password-reset-request-code: count", countErr.message);
    return json({ error: "server_error" }, 500);
  }
  if ((count ?? 0) >= MAX_REQUESTS_PER_15_MIN) {
    return json({ ok: true });
  }

  const code = generateSixDigitCode();
  const codeHash = await sha256Hex(`${pepper}|${email}|${code}`);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  await admin.from("password_reset_codes").delete().eq("email", email).is("used_at", null);

  const { error: insErr } = await admin.from("password_reset_codes").insert({
    email,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  if (insErr) {
    console.error("password-reset-request-code: insert", insErr.message);
    return json({ error: "server_error" }, 500);
  }

  const send = await sendEmailJs({
    email,
    user_email: email,
    code,
  });

  if (!send.ok) {
    console.error("password-reset-request-code: EmailJS", send.status, send.body.slice(0, 400));
    await admin.from("password_reset_codes").delete().eq("email", email).eq("code_hash", codeHash).is("used_at", null);
    return json({ error: "email_send_failed" }, 502);
  }

  return json({ ok: true });
});
