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
  console.log("[Digisac] Parâmetros enviados:", JSON.stringify(Array.from(params?.entries?.() ?? [])));

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
  const totals = payload?.totals ?? payload?.data?.totals ?? payload?.data ?? payload ?? {};
  console.log("[Digisac] mapGeneralPayload keys:", Object.keys(totals || {}));
  const totalChamados = pickByKeys(totals, ["totalTicketsCount", "totalTickets", "total_chamados", "ticketsTotal", "total", "attendanceCount"]);
  const totalFechados = pickByKeys(totals, ["closedTicketsCount", "closedTickets", "total_fechados", "finishedTickets", "closed"]);
  const totalAbertos = pickByKeys(totals, ["openedTicketsCount", "openTickets", "total_abertos", "openedTickets", "open"]);
  const totalMensagens = pickByKeys(totals, ["totalMessagesCount", "totalMessages", "total_mensagens", "messagesTotal", "messages"]);
  const totalContatos = pickByKeys(totals, ["contactsCount", "totalContacts", "total_contatos", "contactsTotal", "contacts"]);

  const ticketTimeMinutes = minutesFromSeconds(pickByKeys(totals, ["ticketTime", "avgTicketTime", "averageTicketTime", "tma"]));
  const waitingTimeMinutes = minutesFromSeconds(pickByKeys(totals, ["waitingTimeAvg", "waitingTime", "avgWaitingTime", "averageWaitingTime"]));
  const firstWaitingMinutes = minutesFromSeconds(pickByKeys(totals, ["firstWaitingTime", "avgFirstWaitingTime", "averageFirstWaitingTime", "firstResponseTime", "waitingTimeAfterBot"]));

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

const loadDigisacUsers = async (baseUrl: string, token: string) => {
  const usersCacheKey = "digisac_users_raw";
  let users: Array<{ id: string; name: string }> = cache[usersCacheKey]?.data;

  if (!users || Date.now() - cache[usersCacheKey].timestamp >= CACHE_TTL_MS) {
    const response = await fetchDigisac(baseUrl, token, "/api/v1/users");
    const list = Array.isArray(response.data?.data) ? response.data.data : Array.isArray(response.data) ? response.data : [];

    users = list
      .filter((user: any) => user && user.id && !user.deletedAt && user.isClientUser !== true)
      .map((user: any) => ({
        id: String(user.id),
        name: user.name || user.email || "Sem nome",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    cache[usersCacheKey] = { data: users, timestamp: Date.now() };
  }

  return users;
};

const buildGeneralDashboardParams = (
  startPeriod: string,
  endPeriod: string,
  departmentId: string,
  userId: string,
) => {
  const params = new URLSearchParams({
    startPeriod,
    endPeriod,
    periodType: "openDate",
    userParticipation: "last",
    departmentParticipation: "last",
    userId,
    status: "all",
    withTotals: "true",
  });

  if (departmentId && departmentId !== "all") params.set("departmentId", departmentId);

  return params;
};

const buildAnalystsDashboardParams = (
  startPeriod: string,
  endPeriod: string,
  departmentId: string,
  userIds: string[],
  fallbackUserId?: string,
) => {
  const params = new URLSearchParams({
    startPeriod,
    endPeriod,
    periodType: "openDate",
    userParticipation: "last",
    departmentParticipation: "last",
    status: "all",
    withTotals: "true",
  });

  if (departmentId && departmentId !== "all") params.set("departmentId", departmentId);

  if (userIds.length > 0) {
    userIds.forEach((userId) => params.append("userId[]", userId));
  } else if (fallbackUserId) {
    params.set("userId", fallbackUserId);
  }

  return params;
};

const fetchAnalystsByUser = async (
  baseUrl: string,
  token: string,
  startPeriod: string,
  endPeriod: string,
  departmentId: string,
  userIds: string[],
  fallbackUserId: string | undefined,
  usersIndex: Map<string, string>,
) => {
  const params = buildAnalystsDashboardParams(startPeriod, endPeriod, departmentId, userIds, fallbackUserId);

  const r = await fetchDigisac(baseUrl, token, "/api/v1/dashboard/by-user", params);
  if (!r.ok) {
    console.error("[Digisac] by-user falhou:", r.status);
    return [];
  }

  const items = firstArray(r.data, ["items", "data", "rows", "users"]);
  console.log("[Digisac] by-user items:", items.length);

  return items.map((item: any) => {
    const id = String(item.userId ?? item.id ?? item.user?.id ?? "");
    const name = item.userName ?? item.name ?? item.user?.name ?? usersIndex.get(id) ?? "Sem nome";
    const closed = asNumber(item.closedTicketsCount, item.closedTickets, item.closed);
    const ticketTimeSec = asNumber(item.ticketTime, item.totalTicketTime, item.ticketsTime);
    // REGRA: TMA = ticketTime / closedTicketsCount (por item). Não usar totals nem média global.
    const tmaSeconds = closed > 0 ? ticketTimeSec / closed : 0;
    const sent = asNumber(item.sentMessagesCount, item.sentMessages);
    const received = asNumber(item.receivedMessagesCount, item.receivedMessages);
    return {
      analyst_id: id,
      name,
      mapped: true,
      total_chamados: asNumber(item.totalTicketsCount, item.totalTickets) || closed,
      chamados_fechados: closed,
      chamados_abertos: asNumber(item.openedTicketsCount, item.openTickets, item.opened),
      total_contatos: asNumber(item.contactsCount, item.totalContacts),
      total_mensagens: sent + received,
      tma_minutos: minutesFromSeconds(tmaSeconds),
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

      // Permission check (digisac_dashboard) — admins always allowed
      const userId = claimsData.claims.sub as string;
      const protectedActions = new Set(["geral", "analistas", "listar_departments", "listar_digisac_users", "listar_analysts"]);
      if (protectedActions.has(action ?? "")) {
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        const [{ data: roleRow }, { data: permRow }] = await Promise.all([
          adminClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
          adminClient.from("user_permissions").select("allowed").eq("user_id", userId).eq("permission_key", "digisac_dashboard_view").maybeSingle(),
        ]);
        const isAdmin = !!roleRow;
        const allowed = isAdmin || permRow?.allowed === true;
        if (!allowed) {
          return handledErrorResponse(action, "Sem permissão para acessar o Dashboard Digisac.", { code: "FORBIDDEN" });
        }
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
      const departmentId = typeof payload?.departmentId === "string" && payload.departmentId ? payload.departmentId : "all";
      const userIdFilter = typeof payload?.userId === "string" && payload.userId ? payload.userId : "all";
      const startPeriod = toDigisacPeriod(startDate, "start")!;
      const endPeriod = toDigisacPeriod(endDate, "end")!;
      const cacheKey = `dashboard_general_${startPeriod}_${endPeriod}_${departmentId}_${userIdFilter}`;
      const users = await loadDigisacUsers(digisacUrl, digisacToken);
      const usersIndex = new Map(users.map((user) => [user.id, user.name]));
      const analystUserIds = userIdFilter === "all"
        ? users.map((user) => user.id)
        : users.some((user) => user.id === userIdFilter)
          ? [userIdFilter]
          : [];
      const fallbackUserId = userIdFilter !== "all" ? userIdFilter : undefined;

      let snapshot = cache[cacheKey]?.data;
      if (!snapshot || Date.now() - cache[cacheKey].timestamp >= CACHE_TTL_MS) {
        const params = buildDashboardParams(startPeriod, endPeriod, departmentId, analystUserIds, fallbackUserId);

        const response = await fetchDigisac(digisacUrl, digisacToken, "/api/v1/dashboard/general", params);
        if (!response.ok) {
          return handledErrorResponse(action, `Erro API Digisac: ${response.status}`, {
            code: "DIGISAC_API_ERROR",
            digisac_status: response.status,
          });
        }

        // Uma única chamada /by-user retorna TODOS os analistas com seus próprios totais.
        // TMA é calculado item a item: ticketTime / closedTicketsCount.
        const analystResults = await fetchAnalystsByUser(
          digisacUrl,
          digisacToken,
          startPeriod,
          endPeriod,
          departmentId,
          analystUserIds,
          fallbackUserId,
          usersIndex,
        );

        const analistas = analystResults
          .filter((a) => (a.chamados_fechados ?? 0) > 0 || (a.total_chamados ?? 0) > 0)
          .sort((a, b) => b.tma_minutos - a.tma_minutos);

        snapshot = {
          totals: mapGeneralPayload(response.data),
          analistas,
          allUsers: users,
          rawMeta: { startPeriod, endPeriod, departmentId, userIdFilter, totalAnalysts: analistas.length },
        };

        cache[cacheKey] = { data: snapshot, timestamp: Date.now() };
        console.log("[Digisac] Resultado final:", JSON.stringify(snapshot.totals), "analistas:", analistas.length);
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

    if (action === "listar_analysts") {
      // Returns Digisac users (id, name) — used to feed the analyst filter
      const users = await loadDigisacUsers(digisacUrl, digisacToken);
      return jsonResponse(users);
    }

    if (action === "listar_digisac_users") {
      const cacheKey = "digisac_users";
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
        return jsonResponse(cache[cacheKey].data);
      }
      const r = await fetchDigisac(digisacUrl, digisacToken, "/api/v1/users");
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

    if (action === "listar_departments") {
      const cacheKey = "digisac_departments";
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
        return jsonResponse(cache[cacheKey].data);
      }
      const r = await fetchDigisac(digisacUrl, digisacToken, "/api/v1/departments");
      if (!r.ok) {
        return handledErrorResponse(action, `Erro API Digisac: ${r.status}`, {
          code: "DIGISAC_API_ERROR",
          digisac_status: r.status,
        });
      }
      const list = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
      const departments = list
        .filter((d: any) => d && d.id && !d.deletedAt)
        .map((d: any) => ({ id: String(d.id), name: d.name || "Sem nome" }));
      cache[cacheKey] = { data: departments, timestamp: Date.now() };
      return jsonResponse(departments);
    }
    return handledErrorResponse(action, "Ação inválida.", { code: "INVALID_ACTION" });
  } catch (error: any) {
    console.error("[Edge Function Error]", error?.message || error);
    return handledErrorResponse(action, error?.message || "Internal Edge Function Error", { code: "UNEXPECTED_ERROR" });
  }
});
