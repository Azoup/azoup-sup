import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";
import { runDigisacSlaMonitor, type SlaMonitorResult } from "../_shared/digisacSlaMonitor.ts";
import type { FetchDigisacFn } from "../_shared/digisacNpsTickets.ts";

const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const buildDigisacUrl = (baseUrl: string, endpoint: string, params?: URLSearchParams) => {
  const endpointHasApiPrefix = endpoint.startsWith("/api/v1/");
  const normalizedBase = endpointHasApiPrefix
    ? baseUrl.replace(/\/api\/v1\/?$/i, "").replace(/\/+$/, "")
    : baseUrl.replace(/\/+$/, "");
  const normalizedEp = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const qs = params?.toString();
  return `${normalizedBase}${normalizedEp}${qs ? `?${qs}` : ""}`;
};

const fetchDigisacRaw = async (
  baseUrl: string,
  token: string,
  endpoint: string,
  params?: URLSearchParams,
) => {
  const response = await fetch(buildDigisacUrl(baseUrl, endpoint, params), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
};

async function isAuthorizedAdmin(req: Request, serviceKey: string): Promise<boolean> {
  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!auth) return false;
  if (auth === serviceKey) return true;

  const cronSecret = Deno.env.get("DIGISAC_SLA_CRON_SECRET")?.trim();
  if (cronSecret && auth === cronSecret) return true;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return false;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${auth}` } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return roleRow?.role === "admin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const digisacUrl = Deno.env.get("DIGISAC_API_URL") ?? "";
  const digisacToken = Deno.env.get("DIGISAC_API_TOKEN") ?? "";

  if (!supabaseUrl || !serviceKey || !digisacUrl || !digisacToken) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const authorized = await isAuthorizedAdmin(req, serviceKey);
  if (!authorized) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let departmentId: string | undefined;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.departmentId === "string") departmentId = body.departmentId;
    }
  } catch {
    // GET sem body
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const fetchDigisac: FetchDigisacFn = (endpoint, params) =>
    fetchDigisacRaw(digisacUrl, digisacToken, endpoint, params);

  let result: SlaMonitorResult;
  try {
    result = await runDigisacSlaMonitor({
      fetchDigisac,
      adminClient,
      departmentId,
    });
  } catch (e) {
    return jsonResponse({ error: "monitor_failed", message: String(e) }, 500);
  }

  return jsonResponse({ ok: true, ...result });
});
