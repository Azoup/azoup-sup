import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

interface CacheItem { data: any; timestamp: number; }
const cache: Record<string, CacheItem> = {};
const CACHE_TTL_MS = 60 * 1000;
const BRAZIL_UTC_OFFSET_HOURS = 3;

const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const trimForLogs = (value: string, maxLength = 1200) => (
  value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
);

const safeParseJson = (value: string) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const buildErrorPayload = (action: string | undefined, message: string, extra: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = {
    error: true,
    message,
    total: 0,
    analistas: [],
    total_chamados: 0,
    total_fechados: 0,
    total_abertos: 0,
    total_mensagens: 0,
    total_contatos: 0,
    tma_geral_minutos: 0,
    tempo_espera_minutos: 0,
    primeira_resposta_minutos: 0,
  };

  if (action === "listar_digisac_users") return { ...base, users: [], ...extra };
  if (action === "test_digisac") return { ...base, digisac_status: null, sample: null, ...extra };
  return { ...base, ...extra };
};

const handledErrorResponse = (action: string | undefined, message: string, extra: Record<string, unknown> = {}) =>
  jsonResponse(buildErrorPayload(action, message, extra), 200);

const formatDateOnly = (value?: string) => {
  if (!value || typeof value !== "string") return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
};

const toDigisacPeriod = (dateOnly: string | undefined, boundary: "start" | "end") => {
  const normalized = formatDateOnly(dateOnly);
  if (!normalized) return undefined;
  const [year, month, day] = normalized.split("-").map(Number);
  const utcHour = boundary === "start" ? BRAZIL_UTC_OFFSET_HOURS : 24 + BRAZIL_UTC_OFFSET_HOURS - 1;
  const utcMinute = boundary === "start" ? 0 : 59;
  const utcSecond = boundary === "start" ? 0 : 59;
  const utcMs = boundary === "start" ? 0 : 999;
  const utcDate = boundary === "start"
    ? new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0))
    : new Date(Date.UTC(year, month - 1, day + 1, 2, 59, 59, 999));
  if (boundary === "start") {
    utcDate.setUTCHours(utcHour, utcMinute, utcSecond, utcMs);
  }
  return utcDate.toISOString();
};

const getTodayBrazilDate = () => {
  const now = new Date();
  const brazilMs = now.getTime() - BRAZIL_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const brazil = new Date(brazilMs);
  return `${brazil.getUTCFullYear()}-${String(brazil.getUTCMonth() + 1).padStart(2, "0")}-${String(brazil.getUTCDate()).padStart(2, "0")}`;
};

const buildDigisacUrl = (baseUrl: string, endpoint: string, params?: URLSearchParams) => {
  const endpointHasApiPrefix = endpoint.startsWith("/api/v1/");
  const normalizedBase = endpointHasApiPrefix
    ? baseUrl.replace(/\/api\/v1\/?$/i, "").replace(/\/+$/, "")
    : baseUrl.replace(/\/+$/, "");
  const normalizedEp = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const qs = params?.toString();
  return `${normalizedBase}${normalizedEp}${qs ? `?${qs}` : ""}`;
};

const fetchDigisac = async (baseUrl: string, token: string, endpoint: string, params?: URLSearchParams) => {
  const finalUrl = buildDigisacUrl(baseUrl, endpoint, params);
  console.log("[Digisac] URL completa:", finalUrl);
  console.log("[Digisac] Parâmetros enviados:", JSON.stringify(Object.fromEntries(params?.entries?.() ?? [])));

  const response = await fetch(finalUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const bodyText = await response.text();
  const parsed = safeParseJson(bodyText);
  console.log("[Digisac] Status:", response.status);
  console.log("[Digisac] Resposta API:", trimForLogs(bodyText));

  return {
    ok: response.ok,
    status: response.status,
    bodyText,
    data: parsed,
    url: finalUrl,
  };
};

const asNumber = (...values: unknown[]): number => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = Number(value.replace(",", "."));
      if (Number.isFinite(normalized)) return normalized;
    }
  }
  return 0;
};

const minutesFromSeconds = (value: number) => value > 0 ? value / 60 : 0;

const pickByKeys = (source: Record<string, any> | undefined, keys: string[]) => {
  if (!source) return 0;
  for (const key of keys) {
    if (key in source) return asNumber(source[key]);
  }
  return 0;
};

const firstArray = (payload: any, keys: string[]) => {
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      if (Array.isArray(value.data)) return value.data;
      if (Array.isArray(value.items)) return value.items;
      if (Array.isArray(value.rows)) return value.rows;
    }
  }
  return [];
};

const mapGeneralPayload = (payload: any) => {
  const totals = payload?.totals ?? payload?.data?.totals ?? payload?.data ?? payload;
  const totalChamados = pickByKeys(totals, ["totalTickets", "total_chamados", "ticketsTotal", "total", "attendanceCount"]);
  const totalFechados = pickByKeys(totals, ["closedTickets", "total_fechados", "finishedTickets", "closed"]);
  const totalAbertos = pickByKeys(totals, ["openTickets", "total_abertos", "openedTickets", "open"]);
  const totalMensagens = pickByKeys(totals, ["totalMessages", "total_mensagens", "messagesTotal", "messages"]);
  const totalContatos = pickByKeys(totals, ["totalContacts", "total_contatos", "contactsTotal", "contacts"]);

  const ticketTimeMinutes = minutesFromSeconds(pickByKeys(totals, ["ticketTime", "avgTicketTime", "averageTicketTime", "tma"]));
  const waitingTimeMinutes = minutesFromSeconds(pickByKeys(totals, ["waitingTime", "avgWaitingTime", "averageWaitingTime"]));
  const firstWaitingMinutes = minutesFromSeconds(pickByKeys(totals, ["firstWaitingTime", "avgFirstWaitingTime", "averageFirstWaitingTime", "firstResponseTime"]));

  return {
    total_chamados: totalChamados,
    total_fechados: totalFechados,
    total_abertos: totalAbertos,
    total_mensagens: totalMensagens,
    total_contatos: totalContatos,
    tma_geral_minutos: ticketTimeMinutes,
    tempo_espera_minutos: waitingTimeMinutes,
    primeira_resposta_minutos: firstWaitingMinutes,
  };
};

const mapAnalystsPayload = (payload: any) => {
  const analystRows = firstArray(payload?.data ?? payload, ["users", "attendants", "analysts", "byUser", "rows"]);

  return analystRows.map((item: any, index: number) => {
    const metrics = item?.totals ?? item?.metrics ?? item;
    const id = String(item?.userId ?? item?.id ?? item?.user?.id ?? `row-${index}`);
    const name = item?.name ?? item?.user?.name ?? item?.attendantName ?? item?.label ?? "Não mapeado";

    return {
      analyst_id: id,
      name,
      mapped: true,
      total_chamados: pickByKeys(metrics, ["totalTickets", "total_chamados", "ticketsTotal", "total"]),
      chamados_fechados: pickByKeys(metrics, ["closedTickets", "total_fechados", "finishedTickets", "closed"]),
      chamados_abertos: pickByKeys(metrics, ["openTickets", "total_abertos", "openedTickets", "open"]),
      tma_minutos: minutesFromSeconds(pickByKeys(metrics, ["ticketTime", "avgTicketTime", "averageTicketTime", "tma"])),
    };
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let action: string | undefined;

  try {
    const url = new URL(req.url);
    const isTestRoute = req.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/test-digisac");

    let payload: Record<string, unknown> = {};
    if (isTestRoute) {
      action = "test_digisac";
    } else if (req.method === "GET") {
      action = url.searchParams.get("action") ?? undefined;
      payload = {
        startDate: url.searchParams.get("startDate") ?? undefined,
        endDate: url.searchParams.get("endDate") ?? undefined,
      };
    } else {
      try {
        const body = await req.json();
        action = body?.action;
        payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
      } catch {
        return handledErrorResponse(undefined, "Corpo JSON inválido.", { code: "INVALID_JSON" });
      }
    }

    console.log("[Digisac] Action:", action, "Payload:", JSON.stringify(payload));

    const authHeader = req.headers.get("Authorization");
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: authHeader ? { Authorization: authHeader } : {} } }
    );

    if (action !== "test_digisac") {
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return handledErrorResponse(action, "Usuário não autenticado. Faça login para acessar a integração.", { code: "UNAUTHORIZED" });
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return handledErrorResponse(action, "Usuário não autenticado.", { code: "UNAUTHORIZED" });
      }
    }

    const digisacUrl = Deno.env.get("DIGISAC_API_URL");
    const digisacToken = Deno.env.get("DIGISAC_API_TOKEN");
    if (!digisacUrl || !digisacToken) {
      return handledErrorResponse(action, "Configuração do Digisac ausente no backend.", { code: "CONFIG_MISSING" });
    }

    if (action === "test_digisac") {
      const testParams = new URLSearchParams({ limit: "1" });
      const r = await fetchDigisac(digisacUrl, digisacToken, "/users", testParams);
      if (!r.ok) {
        return handledErrorResponse(action, `Erro API Digisac: ${r.status}`, {
          code: "DIGISAC_API_ERROR",
          digisac_status: r.status,
          sample: null,
        });
      }
      const sample = Array.isArray(r.data?.data) ? r.data.data[0] : Array.isArray(r.data) ? r.data[0] : null;
      return jsonResponse({
        ok: true,
        digisac_status: r.status,
        sample: sample ? { id: sample.id, name: sample.name, email: sample.email } : null,
      });
    }

    if (action === "geral" || action === "analistas") {
      const today = getTodayBrazilDate();
      const startDate = formatDateOnly(typeof payload?.startDate === "string" ? payload.startDate : undefined) ?? today;
      const endDate = formatDateOnly(typeof payload?.endDate === "string" ? payload.endDate : undefined) ?? startDate;
      const startPeriod = toDigisacPeriod(startDate, "start")!;
      const endPeriod = toDigisacPeriod(endDate, "end")!;
      const cacheKey = `dashboard_general_${startPeriod}_${endPeriod}`;

      let snapshot = cache[cacheKey]?.data;
      if (!snapshot || Date.now() - cache[cacheKey].timestamp >= CACHE_TTL_MS) {
        const params = new URLSearchParams({
          startPeriod,
          endPeriod,
          periodType: "openDate",
          userId: "all",
          status: "all",
          withTotals: "true",
        });

        const response = await fetchDigisac(digisacUrl, digisacToken, "/api/v1/dashboard/general", params);
        if (!response.ok) {
          return handledErrorResponse(action, `Erro API Digisac: ${response.status}`, {
            code: "DIGISAC_API_ERROR",
            digisac_status: response.status,
          });
        }

        snapshot = {
          totals: mapGeneralPayload(response.data),
          analistas: mapAnalystsPayload(response.data),
          rawMeta: {
            startPeriod,
            endPeriod,
            responseKeys: Object.keys(response.data || {}),
          },
        };

        cache[cacheKey] = { data: snapshot, timestamp: Date.now() };
        console.log("[Digisac] Resultado final enviado ao frontend:", JSON.stringify(snapshot));
      }

      if (action === "geral") {
        return jsonResponse({
          ...snapshot.totals,
          total: snapshot.totals.total_chamados,
          analistas: snapshot.analistas,
        });
      }

      return jsonResponse(snapshot.analistas);
    }

    if (action === "listar_digisac_users") {
      const cacheKey = "digisac_users";
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
        return jsonResponse(cache[cacheKey].data);
      }
      const r = await fetchDigisac(digisacUrl, digisacToken, "/users");
      if (!r.ok) {
        return handledErrorResponse(action, `Erro API Digisac: ${r.status}`, {
          code: "DIGISAC_API_ERROR",
          digisac_status: r.status,
        });
      }
      const users = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
      cache[cacheKey] = { data: users, timestamp: Date.now() };
      return jsonResponse(users);
    }

    return handledErrorResponse(action, "Ação inválida.", { code: "INVALID_ACTION" });
  } catch (error: any) {
    console.error("[Edge Function Error]", error?.message || error);
    return handledErrorResponse(action, error?.message || "Internal Edge Function Error", { code: "UNEXPECTED_ERROR" });
  }
});
