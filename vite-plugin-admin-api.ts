import type { Connect, Plugin } from "vite";
import {
  adminConfigFromEnv,
  runAdminUserActionCore,
  type AdminBody,
} from "./server/adminUserActionCore";

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Em `npm run dev`, serve /api/admin-user-action usando variáveis do .env */
export function adminApiDevPlugin(env: Record<string, string>): Plugin {
  return {
    name: "admin-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/api/admin-user-action") {
          return next();
        }

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }

        const config = adminConfigFromEnv(env as NodeJS.ProcessEnv);
        if ("error" in config) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "server_misconfigured", message: config.error }));
          return;
        }

        const authHeader = req.headers.authorization?.trim();
        if (!authHeader?.startsWith("Bearer ")) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }

        let body: AdminBody = {};
        try {
          const raw = await readBody(req);
          body = raw ? (JSON.parse(raw) as AdminBody) : {};
        } catch {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "invalid_json" }));
          return;
        }

        try {
          const result = await runAdminUserActionCore(authHeader, body, config);
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result.body));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "server_error",
              message: err instanceof Error ? err.message : "unknown",
            }),
          );
        }
      });
    },
  };
}
