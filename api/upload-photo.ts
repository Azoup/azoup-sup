import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminConfigFromEnv } from "./lib/supabaseConfig.js";
import { uploadPhotoCore, type UploadPhotoBody } from "./lib/uploadPhotoCore.js";

function readBody(req: VercelRequest): UploadPhotoBody {
  const raw = req.body;
  if (raw == null) return {} as UploadPhotoBody;
  if (typeof raw === "string") return JSON.parse(raw) as UploadPhotoBody;
  return raw as UploadPhotoBody;
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
    const result = await uploadPhotoCore(authHeader, payload, config);
    return res.status(result.status).json(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return res.status(500).json({ error: "server_error", message });
  }
}
