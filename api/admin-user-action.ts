import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runAdminUserActionCore, type AdminBody } from "./lib/adminAction.js";
import { adminConfigFromEnv } from "./lib/supabaseConfig.js";

function readBody(req: VercelRequest): AdminBody {
  const raw = req.body;
  if (raw == null) return {} as AdminBody;
  if (typeof raw === "string") return JSON.parse(raw) as AdminBody;
  return raw as AdminBody;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const config = adminConfigFromEnv();
  if ("error" in config) {
    return res.status(500).json({ error: "server_misconfigured", message: config.error });
  }

  const authHeader = req.headers.authorization?.trim();
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const result = await runAdminUserActionCore(authHeader, readBody(req), config);
  return res.status(result.status).json(result.body);
}
