import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runAdminUserActionCore, type AdminBody } from "./lib/adminAction.js";
import { adminConfigFromEnv } from "./lib/supabaseConfig.js";
import { fetchAppBootstrapCore } from "./lib/appBootstrap.js";
import { fetchDevKanbanBoardCore } from "./lib/devKanbanBoard.js";
import { fetchKanbanBoardCore } from "./lib/kanbanBoard.js";
import { proxyAuthenticatedSupabaseRequest, type RestProxyBody } from "./lib/restProxy.js";
import { fetchUserAccessCore } from "./lib/userAccess.js";
import { uploadKanbanFileCore, type UploadKanbanFileBody } from "./lib/uploadKanbanFileCore.js";
import { uploadKanbanImageCore, type UploadKanbanImageBody } from "./lib/uploadKanbanImageCore.js";
import { uploadPhotoCore, type UploadPhotoBody } from "./lib/uploadPhotoCore.js";
import { routeName } from "./lib/routeName.js";

const ROUTES = new Set([
  "app-bootstrap",
  "my-access",
  "kanban-board",
  "dev-kanban-board",
  "admin-user-action",
  "rest-proxy",
  "upload-photo",
  "upload-kanban-image",
  "upload-kanban-file",
]);

function readJsonBody<T>(req: VercelRequest): T {
  const raw = req.body;
  if (raw == null) return {} as T;
  if (typeof raw === "string") return JSON.parse(raw) as T;
  return raw as T;
}

function setCors(res: VercelResponse, methods: string) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
}

function requireConfig(res: VercelResponse) {
  const config = adminConfigFromEnv();
  if ("error" in config) {
    res.status(500).json({ error: "server_misconfigured", message: config.error });
    return null;
  }
  return config;
}

function requireAuth(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization?.trim();
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return authHeader;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const name = routeName(req);

  if (!name || !ROUTES.has(name)) {
    return res.status(404).json({ error: "not_found", route: name || null });
  }

  try {
    switch (name) {
      case "app-bootstrap": {
        setCors(res, "GET, OPTIONS");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
        const config = requireConfig(res);
        if (!config) return;
        const authHeader = requireAuth(req, res);
        if (!authHeader) return;
        const kanbanOnly = req.query.scope === "kanban";
        const result = kanbanOnly
          ? await fetchKanbanBoardCore(authHeader, config)
          : await fetchAppBootstrapCore(authHeader, config);
        return res.status(result.status).json(result.body);
      }

      case "my-access": {
        setCors(res, "GET, OPTIONS");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
        const config = requireConfig(res);
        if (!config) return;
        const authHeader = requireAuth(req, res);
        if (!authHeader) return;
        const result = await fetchUserAccessCore(authHeader, config);
        return res.status(result.status).json(result.body);
      }

      case "kanban-board": {
        setCors(res, "GET, OPTIONS");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
        const config = requireConfig(res);
        if (!config) return;
        const authHeader = requireAuth(req, res);
        if (!authHeader) return;
        const result = await fetchKanbanBoardCore(authHeader, config);
        return res.status(result.status).json(result.body);
      }

      case "dev-kanban-board": {
        setCors(res, "GET, OPTIONS");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
        const config = requireConfig(res);
        if (!config) return;
        const authHeader = requireAuth(req, res);
        if (!authHeader) return;
        const result = await fetchDevKanbanBoardCore(authHeader, config);
        return res.status(result.status).json(result.body);
      }

      case "admin-user-action": {
        setCors(res, "POST, OPTIONS");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
        const config = requireConfig(res);
        if (!config) return;
        const authHeader = requireAuth(req, res);
        if (!authHeader) return;
        const result = await runAdminUserActionCore(authHeader, readJsonBody<AdminBody>(req), config);
        return res.status(result.status).json(result.body);
      }

      case "rest-proxy": {
        setCors(res, "POST, OPTIONS");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
        const config = requireConfig(res);
        if (!config) return;
        const authHeader = requireAuth(req, res);
        if (!authHeader) return;
        const result = await proxyAuthenticatedSupabaseRequest(
          authHeader,
          readJsonBody<RestProxyBody>(req),
          config,
        );
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }
        if (result.status === 204 || result.status === 205 || result.status === 304) {
          return res.status(result.status).end();
        }
        return res.status(result.status).send(result.body);
      }

      case "upload-photo": {
        setCors(res, "POST, OPTIONS");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
        const config = requireConfig(res);
        if (!config) return;
        const authHeader = requireAuth(req, res);
        if (!authHeader) return;
        const result = await uploadPhotoCore(authHeader, readJsonBody<UploadPhotoBody>(req), config);
        return res.status(result.status).json(result.body);
      }

      case "upload-kanban-image": {
        setCors(res, "POST, OPTIONS");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
        const config = requireConfig(res);
        if (!config) return;
        const authHeader = requireAuth(req, res);
        if (!authHeader) return;
        const result = await uploadKanbanImageCore(authHeader, readJsonBody<UploadKanbanImageBody>(req), config);
        return res.status(result.status).json(result.body);
      }

      case "upload-kanban-file": {
        setCors(res, "POST, OPTIONS");
        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
        const config = requireConfig(res);
        if (!config) return;
        const authHeader = requireAuth(req, res);
        if (!authHeader) return;
        const result = await uploadKanbanFileCore(authHeader, readJsonBody<UploadKanbanFileBody>(req), config);
        return res.status(result.status).json(result.body);
      }

      default:
        return res.status(404).json({ error: "not_found", route: name });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return res.status(500).json({ error: "server_error", message });
  }
}
