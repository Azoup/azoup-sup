import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAILJS_SEND = "https://api.emailjs.com/api/v1.0/email/send";

function normalizeActionLink(actionLink: string, supabaseUrl: string): string {
  const trimmed = actionLink.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = supabaseUrl.replace(/\/$/, "");
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID")?.trim();
  const templateId = Deno.env.get("EMAILJS_TEMPLATE_ID")?.trim();
  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY")?.trim();
  /** Só obrigatório se no EmailJS (Account → Security) estiver ativo "Use Private Key". */
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY")?.trim();

  if (!serviceId || !templateId || !publicKey) {
    console.error("password-reset-email: missing EmailJS secrets (service/template/public key)");
    return json({ error: "server_misconfigured" }, 500);
  }

  let body: { email?: string; redirect_to?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to.trim() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "invalid_email" }, 400);
  }
  if (!redirectTo || !/^https?:\/\//i.test(redirectTo)) {
    return json({ error: "invalid_redirect" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRole) {
    console.error("password-reset-email: missing Supabase env");
    return json({ error: "server_misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    // Não revelar se o e-mail existe (alinhado ao comportamento típico de "esqueci a senha").
    console.warn("password-reset-email: generateLink skipped or failed", error?.message ?? "no action_link");
    return json({ ok: true });
  }

  const resetLink = normalizeActionLink(data.properties.action_link, supabaseUrl);

  const emailjsPayload: Record<string, unknown> = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: {
      // Nomes usados pela Edge Function / docs anteriores
      user_email: email,
      reset_link: resetLink,
      // Nomes comuns em modelos EmailJS (ex.: Para = {{email}}, corpo = {{link}})
      email,
      link: resetLink,
    },
  };
  if (privateKey) emailjsPayload.accessToken = privateKey;

  const emailjsRes = await fetch(EMAILJS_SEND, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(emailjsPayload),
  });

  if (!emailjsRes.ok) {
    const text = await emailjsRes.text();
    console.error("password-reset-email: EmailJS error", emailjsRes.status, text.slice(0, 500));
    return json({ error: "email_send_failed" }, 502);
  }

  return json({ ok: true });
});
