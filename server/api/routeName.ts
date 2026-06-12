import type { VercelRequest } from "@vercel/node";

/** Extrai nome da rota /api/{nome} (query `route` ou pathname). */
export function routeName(req: Pick<VercelRequest, "query" | "url">): string {
  const raw = req.query.route;
  if (Array.isArray(raw)) {
    const joined = raw.map(String).filter(Boolean).join("/");
    if (joined) return joined;
  } else if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  const pathOnly = String(req.url ?? "").split("?")[0];
  const match = pathOnly.match(/\/api\/(.+)$/i);
  if (match?.[1]) {
    return decodeURIComponent(match[1]).replace(/\/+$/, "");
  }

  return "";
}
