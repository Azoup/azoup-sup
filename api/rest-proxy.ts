import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminConfigFromEnv } from "./lib/supabaseConfig.js";
import { proxyAuthenticatedSupabaseRequest, type RestProxyBody } from "./lib/restProxy.js";

function readBody(req: VercelRequest): RestProxyBody {
  const raw = req.body;
  if (raw == null) return { path: "/" };
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as RestProxyBody;
    } catch {
      return { path: "/" };
    }
  }
  return raw as RestProxyBody;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const config = adminConfigFromEnv();
    if ("error" in config) {
      return res.status(500).json({ error: "server_misconfigured", message: config.error });
    }

    const authHeader = req.headers.authorization?.trim();
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const payload = readBody(req);
    const result = await proxyAuthenticatedSupabaseRequest(authHeader, payload, config);

    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
    if (result.status === 204 || result.status === 205 || result.status === 304) {
      return res.status(result.status).end();
    }
    return res.status(result.status).send(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return res.status(500).json({ error: "server_error", message });
  }
}
