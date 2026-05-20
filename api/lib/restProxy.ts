import { createClient } from "@supabase/supabase-js";
import type { AdminConfig } from "./supabaseConfig.js";

export type RestProxyBody = {
  path: string;
  method?: string;
  body?: string | null;
  headers?: Record<string, string>;
};

export async function proxyAuthenticatedSupabaseRequest(
  authHeader: string,
  payload: RestProxyBody,
  config: AdminConfig,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const jwt = authHeader.slice(7).trim();

  const userClient = createClient(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser(jwt);
  if (authErr || !user?.id) {
    return {
      status: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "unauthorized" }),
    };
  }

  const path = payload.path?.trim();
  if (!path || !path.startsWith("/")) {
    return {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "invalid_path" }),
    };
  }

  const allowedPrefixes = ["/rest/v1/", "/storage/v1/"];
  if (!allowedPrefixes.some((p) => path.startsWith(p))) {
    return {
      status: 403,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "path_not_allowed" }),
    };
  }

  const method = (payload.method || "GET").toUpperCase();
  const forwardHeaders: Record<string, string> = {
    apikey: config.serviceRole,
    Authorization: `Bearer ${config.serviceRole}`,
  };

  const incoming = payload.headers || {};
  if (incoming.Prefer) forwardHeaders.Prefer = incoming.Prefer;
  if (incoming.Accept) forwardHeaders.Accept = incoming.Accept;
  if (incoming["Content-Type"]) forwardHeaders["Content-Type"] = incoming["Content-Type"];
  if (incoming["Content-Range"]) forwardHeaders["Content-Range"] = incoming["Content-Range"];
  if (incoming["X-Upsert"]) forwardHeaders["X-Upsert"] = incoming["X-Upsert"];

  const targetUrl = `${config.supabaseUrl}${path}`;
  const upstream = await fetch(targetUrl, {
    method,
    headers: forwardHeaders,
    body:
      method === "GET" || method === "HEAD"
        ? undefined
        : payload.body ?? undefined,
  });

  const responseHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("Content-Type") || "application/json",
  };
  const contentRange = upstream.headers.get("Content-Range");
  if (contentRange) responseHeaders["Content-Range"] = contentRange;

  return {
    status: upstream.status,
    headers: responseHeaders,
    body: await upstream.text(),
  };
}
