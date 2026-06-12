import type { Connect, Plugin } from "vite";
import { runAdminUserActionCore, type AdminBody } from "./server/api/adminAction";
import { adminConfigFromEnv } from "./server/api/supabaseConfig";
import { fetchUserAccessCore } from "./server/api/userAccess";
import { fetchAppBootstrapCore } from "./server/api/appBootstrap";
import { fetchKanbanBoardCore } from "./server/api/kanbanBoard";
import { fetchDevKanbanBoardCore } from "./server/api/devKanbanBoard";
import { proxyAuthenticatedSupabaseRequest, type RestProxyBody } from "./server/api/restProxy";
import { uploadPhotoCore, type UploadPhotoBody } from "./server/api/uploadPhotoCore";
import { uploadKanbanImageCore, type UploadKanbanImageBody } from "./server/api/uploadKanbanImageCore";
import { uploadKanbanFileCore, type UploadKanbanFileBody } from "./server/api/uploadKanbanFileCore";

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Em `npm run dev`, serve rotas /api/* usando variáveis do .env */
export function adminApiDevPlugin(env: Record<string, string>): Plugin {
  return {
    name: "admin-api-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];

        if (url === "/api/rest-proxy") {
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

          let body: RestProxyBody = { path: "/" };
          try {
            const raw = await readBody(req);
            body = raw ? (JSON.parse(raw) as RestProxyBody) : body;
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "invalid_json" }));
            return;
          }

          try {
            const result = await proxyAuthenticatedSupabaseRequest(authHeader, body, config);
            for (const [key, value] of Object.entries(result.headers)) {
              res.setHeader(key, value);
            }
            res.statusCode = result.status;
            if (result.status === 204 || result.status === 205 || result.status === 304) {
              res.end();
            } else {
              res.end(result.body);
            }
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
          return;
        }

        const handleGetApi = async (
          handler: (auth: string, config: NonNullable<ReturnType<typeof adminConfigFromEnv> & object>) => Promise<{ status: number; body: Record<string, unknown> }>,
        ) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "authorization");

          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return true;
          }

          if (req.method !== "GET") {
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "method_not_allowed" }));
            return true;
          }

          const config = adminConfigFromEnv(env as NodeJS.ProcessEnv);
          if ("error" in config) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "server_misconfigured", message: config.error }));
            return true;
          }

          const authHeader = req.headers.authorization?.trim();
          if (!authHeader?.startsWith("Bearer ")) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "unauthorized" }));
            return true;
          }

          try {
            const result = await handler(authHeader, config);
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
          return true;
        };

        if (url === "/api/my-access") {
          if (await handleGetApi(fetchUserAccessCore)) return;
        }

        if (url === "/api/app-bootstrap") {
          if (await handleGetApi(fetchAppBootstrapCore)) return;
        }

        if (url === "/api/kanban-board") {
          if (await handleGetApi(fetchKanbanBoardCore)) return;
        }

        if (url === "/api/dev-kanban-board") {
          if (await handleGetApi(fetchDevKanbanBoardCore)) return;
        }

        if (url === "/api/upload-kanban-image") {
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

          let body: UploadKanbanImageBody = {} as UploadKanbanImageBody;
          try {
            const raw = await readBody(req);
            body = raw ? (JSON.parse(raw) as UploadKanbanImageBody) : body;
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "invalid_json" }));
            return;
          }

          try {
            const result = await uploadKanbanImageCore(authHeader, body, config);
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
          return;
        }

        if (url === "/api/upload-kanban-file") {
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

          let body: UploadKanbanFileBody = {} as UploadKanbanFileBody;
          try {
            const raw = await readBody(req);
            body = raw ? (JSON.parse(raw) as UploadKanbanFileBody) : body;
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "invalid_json" }));
            return;
          }

          try {
            const result = await uploadKanbanFileCore(authHeader, body, config);
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
          return;
        }

        if (url === "/api/upload-photo") {
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

          let body: UploadPhotoBody = {} as UploadPhotoBody;
          try {
            const raw = await readBody(req);
            body = raw ? (JSON.parse(raw) as UploadPhotoBody) : body;
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "invalid_json" }));
            return;
          }

          try {
            const result = await uploadPhotoCore(authHeader, body, config);
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
          return;
        }

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
