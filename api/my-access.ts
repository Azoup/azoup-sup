import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminConfigFromEnv } from "./lib/supabaseConfig";
import { fetchUserAccessCore } from "./lib/userAccess";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
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

    const result = await fetchUserAccessCore(authHeader, config);
    return res.status(result.status).json(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return res.status(500).json({ error: "server_error", message });
  }
}
