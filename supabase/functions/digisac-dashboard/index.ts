import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  filterDigisacUsersForDepartment,
  findDigisacDepartmentAnalystRule,
} from "../_shared/digisacDepartmentAnalystScope.ts";
import { resolveDigisacQueryPlan } from "../_shared/digisacApiQueryPlan.ts";
import {
  pickSuporteDepartmentId,
} from "../_shared/digisacAnswersOverview.ts";
import {
  aggregateAnswerRows,
  aggregateAnswersByMappedAnalysts,
  countsToMappedOverview,
  emptyNpsCounts,
} from "../_shared/digisacNpsAggregate.ts";
import {
  fetchDigisacAnswersRows,
  fetchDigisacNpsOverview,
  sumOverviewFromParts,
} from "../_shared/digisacNpsFetch.ts";
import { formatDigisacDateOnly, toDigisacPeriodIso } from "../_shared/digisacPeriod.ts";
import {
  ADMIN_USER_ACTIONS,
  assertCallerIsAdmin,
  normalizeAdminBody,
  runAdminUserAction,
} from "../_shared/adminUserActions.ts";

interface CacheItem { data: any; timestamp: number; }
const cache: Record<string, CacheItem> = {};
/** 0 = sem cache no dashboard geral/analistas. `DIGISAC_DASHBOARD_CACHE_MS` em ms. */
const DASHBOARD_CACHE_TTL_MS = (() => {
  const raw = Deno.env.get("DIGISAC_DASHBOARD_CACHE_MS")?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
})();
/** Listas auxiliares (usuários/departamentos) — evita martelar a API a cada refresh do painel. */
const LIST_CACHE_TTL_MS = 15 * 1000;
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
    mensagens_enviadas: 0,
    mensagens_recebidas: 0,
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

const formatDateOnly = (value?: string) => formatDigisacDateOnly(value);

const getTodayBrazilDate = () => {
  const now = new Date();
  // Ajuste manual para UTC-3 (Horário de Brasília)
  const brazilDate = new Date(now.getTime() - (3 * 60 * 60 * 1000));
  const year = brazilDate.getUTCFullYear();
  const month = String(brazilDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(brazilDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const INVALID_DIGISAC_USER_NAMES = new Set([
  "sem atendente",
  "mandeumzap dev",
  "mande um zap dev",
  "azoup tecnologia ltda",
  "azoup digisac",
]);

const normalizeComparableName = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, " ")
  .trim()
  .toLowerCase();

const isInvalidDigisacUserName = (value?: string) => {
  const normalized = normalizeComparableName(value || "");
  if (!normalized) return true;
  return INVALID_DIGISAC_USER_NAMES.has(normalized);
};

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
  const totalFechados = pickByKeys(totals, [
    "closedTicketsCount",
    "closedTickets",
    "closed_tickets_count",
    "total_fechados",
    "finishedTickets",
    "closed",
  ]);
  const totalAbertos = pickByKeys(totals, [
    "openedTicketsCount",
    "openTickets",
    "opened_tickets_count",
    "openTicketsCount",
    "total_abertos",
    "openedTickets",
    "open",
  ]);
  const hasBreakdown = ["closedTicketsCount", "closedTickets", "closed", "openedTicketsCount", "openTickets", "opened", "open"].some((k) => k in totals);
  const sumTickets = totalFechados + totalAbertos;
  const fromTicketTotal = pickByKeys(totals, ["totalTicketsCount", "totalTickets", "total_chamados", "ticketsTotal", "total", "attendanceCount"]);
  const totalChamados = hasBreakdown
    ? fromTicketTotal > 0 && sumTickets > 0 ? Math.max(fromTicketTotal, sumTickets) : (sumTickets || fromTicketTotal)
    : fromTicketTotal;
  const sentMsg = pickByKeys(totals, ["sentMessagesCount", "sentMessages", "sent_messages_count", "messagesSent", "messages_sent", "outboundMessagesCount"]);
  const recMsg = pickByKeys(totals, ["receivedMessagesCount", "receivedMessages", "received_messages_count", "messagesReceived", "messages_received", "inboundMessagesCount"]);
  const apiMsgTotal = pickByKeys(totals, ["totalMessagesCount", "totalMessages", "total_mensagens", "messagesTotal", "messagesCount", "messages"]);
  const totalMensagens = apiMsgTotal > 0 ? apiMsgTotal : sentMsg + recMsg;
  const totalContatos = pickByKeys(totals, ["contactsCount", "totalContacts", "total_contatos", "contactsTotal", "contacts"]);

  const ticketTimeMinutes = minutesFromSeconds(pickByKeys(totals, ["ticketTime", "avgTicketTime", "averageTicketTime", "tma"]));
  const waitingTimeMinutes = minutesFromSeconds(pickByKeys(totals, ["waitingTimeAvg", "avgWaitingTime", "averageWaitingTime", "totalWaitingTime"]));
  const firstWaitingMinutes = ("waitingTime" in totals && asNumber(totals.waitingTime) > 0)
    ? minutesFromSeconds(asNumber(totals.waitingTime))
    : (() => {
      const ex = pickByKeys(totals, ["firstWaitingTimeMinutes", "averageFirstWaitingTimeMinutes", "avgFirstWaitingTimeMinutes"]);
      if (ex > 0) return ex;
      return minutesFromSeconds(pickByKeys(totals, [
        "firstWaitingTime",
        "avgFirstWaitingTime",
        "averageFirstWaitingTime",
        "waitingTimeAfterBot",
      ]));
    })();

  return {
    total_chamados: totalChamados,
    total_fechados: totalFechados,
    total_abertos: totalAbertos,
    total_mensagens: totalMensagens,
    mensagens_enviadas: sentMsg,
    mensagens_recebidas: recMsg,
    total_contatos: totalContatos,
    tma_geral_minutos: ticketTimeMinutes,
    tempo_espera_minutos: waitingTimeMinutes,
    primeira_resposta_minutos: firstWaitingMinutes,
  };
};

const loadDigisacUsers = async (baseUrl: string, token: string) => {
  const usersCacheKey = "digisac_users_raw";
  let users: Array<{ id: string; name: string }> = cache[usersCacheKey]?.data;

  if (!users || Date.now() - cache[usersCacheKey].timestamp >= LIST_CACHE_TTL_MS) {
    const pageSize = 200;
    const collected: Array<{ id: string; name: string }> = [];
    const seen = new Set<string>();
    let page = 1;
    let hasMore = true;

    while (hasMore && page < 80) {
      const params = new URLSearchParams({ limit: String(pageSize), page: String(page) });
      const response = await fetchDigisac(baseUrl, token, "/api/v1/users", params);
      if (!response.ok) {
        if (page === 1) {
          const fallback = await fetchDigisac(baseUrl, token, "/api/v1/users");
          const list = Array.isArray(fallback.data?.data) ? fallback.data.data : Array.isArray(fallback.data) ? fallback.data : [];
          for (const user of list) {
            if (!user?.id || user.deletedAt || user.isClientUser === true) continue;
            if (isInvalidDigisacUserName(user.name || user.email)) continue;
            const id = String(user.id);
            if (seen.has(id)) continue;
            seen.add(id);
            collected.push({ id, name: user.name || user.email || "Sem nome" });
          }
        }
        break;
      }
      const list = Array.isArray(response.data?.data) ? response.data.data : Array.isArray(response.data) ? response.data : [];
      let newOnPage = 0;
      for (const user of list) {
        if (!user?.id || user.deletedAt || user.isClientUser === true) continue;
        if (isInvalidDigisacUserName(user.name || user.email)) continue;
        const id = String(user.id);
        if (seen.has(id)) continue;
        seen.add(id);
        collected.push({ id, name: user.name || user.email || "Sem nome" });
        newOnPage++;
      }
      if (list.length < pageSize || newOnPage === 0) hasMore = false;
      else page++;
    }

    users = collected.sort((a, b) => a.name.localeCompare(b.name));
    cache[usersCacheKey] = { data: users, timestamp: Date.now() };
  }

  return users;
};

const normalizeRequestedUserIds = (
  payload: Record<string, unknown>,
  mappings: Array<{ digisac_user_id: string; analyst_id: string }> = [],
) => {
  const userIds = Array.isArray(payload.userIds)
    ? payload.userIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0 && value !== "all")
    : [];
  const singleUserId = typeof payload.userId === "string" && payload.userId.trim().length > 0 && payload.userId !== "all"
    ? payload.userId.trim()
    : undefined;

  const digisacIds = new Set(mappings.map((m) => String(m.digisac_user_id)));
  const analystIdToDigisac = new Map(mappings.map((m) => [String(m.analyst_id), String(m.digisac_user_id)]));

  const resolveOne = (raw: string): string | undefined => {
    if (digisacIds.has(raw)) return raw;
    return analystIdToDigisac.get(raw);
  };

  const resolved: string[] = [];
  for (const id of userIds) {
    const r = resolveOne(id);
    if (r) resolved.push(r);
  }
  if (resolved.length > 0) return [...new Set(resolved)];

  if (singleUserId) {
    const r = resolveOne(singleUserId);
    if (r) return [r];
  }
  return [];
};

const loadValidMappedAnalystUsers = async (
  adminClient: ReturnType<typeof createClient>,
  baseUrl: string,
  token: string,
) => {
  const [digisacUsers, mappingsResult, analystsResult] = await Promise.all([
    loadDigisacUsers(baseUrl, token),
    adminClient.from("digisac_analyst_mapping").select("digisac_user_id, digisac_user_name, analyst_id"),
    adminClient.from("analysts").select("id, name, status").eq("status", "active"),
  ]);

  if (mappingsResult.error) throw mappingsResult.error;
  if (analystsResult.error) throw analystsResult.error;

  const activeAnalystsById = new Map(
    (analystsResult.data ?? []).map((analyst: any) => [String(analyst.id), analyst]),
  );
  const digisacUsersById = new Map(digisacUsers.map((user) => [user.id, user]));
  const validUsers = new Map<string, { id: string; name: string }>();

  for (const mapping of mappingsResult.data ?? []) {
    const activeAnalyst = activeAnalystsById.get(String(mapping.analyst_id));
    if (!activeAnalyst) continue;

    const digisacUser = digisacUsersById.get(String(mapping.digisac_user_id));
    const displayName = digisacUser?.name || (mapping.digisac_user_name as string) || activeAnalyst.name;
    if (isInvalidDigisacUserName(activeAnalyst.name) || isInvalidDigisacUserName(displayName)) continue;

    validUsers.set(String(mapping.digisac_user_id), {
      id: String(mapping.digisac_user_id),
      name: displayName,
    });
  }

  return Array.from(validUsers.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const resolveAnalystUserIds = (
  requestedUserIds: string[],
  validUsers: Array<{ id: string; name: string }>,
) => {
  const validUserIds = new Set(validUsers.map((user) => user.id));
  if (requestedUserIds.length > 0) {
    return requestedUserIds.filter((userId) => validUserIds.has(userId));
  }
  return validUsers.map((user) => user.id);
};

const getDepartmentNameById = async (
  digisacUrl: string,
  token: string,
  departmentId: string,
): Promise<string | undefined> => {
  if (!departmentId || departmentId === "all") return undefined;
  const cacheKey = "digisac_departments";
  let departments: Array<{ id: string; name: string }> | undefined = cache[cacheKey]?.data;
  if (!departments || Date.now() - cache[cacheKey].timestamp >= LIST_CACHE_TTL_MS) {
    const r = await fetchDigisac(digisacUrl, token, "/api/v1/departments");
    if (!r.ok) return undefined;
    const list = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
    departments = list
      .filter((d: { id?: string; deletedAt?: unknown }) => d?.id && !d.deletedAt)
      .map((d: { id: string; name?: string }) => ({ id: String(d.id), name: d.name || "Sem nome" }));
    cache[cacheKey] = { data: departments, timestamp: Date.now() };
  }
  return departments.find((d) => d.id === departmentId)?.name;
};

const resolvePeriodType = (payload: Record<string, unknown>) => {
  const p = typeof payload.periodType === "string" ? payload.periodType.trim() : "";
  if (p === "closeDate" || p === "openDate") return p;
  return "openDate";
};

const resolveTicketStatus = (payload: Record<string, unknown>) => {
  const p = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";
  if (p === "open" || p === "close" || p === "all") return p;
  return "all";
};

/** `payload` pode forçar `last`/`middle` (API Digisac). */
const resolveUserParticipation = (payload: Record<string, unknown>) => {
  const p = typeof payload.userParticipation === "string" ? payload.userParticipation.trim().toLowerCase() : "";
  if (p === "last" || p === "middle") return p;
  const v = Deno.env.get("DIGISAC_USER_PARTICIPATION")?.trim()?.toLowerCase();
  if (v === "last" || v === "middle") return v;
  return "last";
};

const resolveDepartmentParticipation = (payload: Record<string, unknown>) => {
  const p = typeof payload.departmentParticipation === "string" ? payload.departmentParticipation.trim().toLowerCase() : "";
  if (p === "last" || p === "middle") return p;
  const v = Deno.env.get("DIGISAC_DEPARTMENT_PARTICIPATION")?.trim()?.toLowerCase();
  if (v === "last" || v === "middle") return v;
  return "last";
};

/** Converte resposta "totals" (modo dept+user) em linha por analista para o gráfico. */
const buildAnalystItemFromGeneralTotals = (
  userId: string,
  userName: string,
  payload: unknown,
) => {
  const g = mapGeneralPayload(payload);
  return {
    userId,
    userName,
    closedTicketsCount: g.total_fechados,
    openedTicketsCount: g.total_abertos,
    totalTicketsCount: g.total_chamados,
    ticketTime: Math.round(g.tma_geral_minutos * 60),
    waitingTime: Math.round(g.primeira_resposta_minutos * 60),
    totalMessagesCount: g.total_mensagens,
    contactsCount: g.total_contatos,
    sentMessagesCount: g.mensagens_enviadas,
    receivedMessagesCount: g.mensagens_recebidas,
  };
};

/**
 * Monta query string oficial: `GET /api/v1/dashboard/general`
 * Doc Digisac dept+user: `departmentId={id}&userId={id}` (singular).
 * Equipe: `userId[]` apenas quando breakdown com vários analistas.
 */
const buildDigisacGeneralDashboardParams = (input: {
  startPeriod: string;
  endPeriod: string;
  departmentId: string;
  digisacUserIds: string[];
  useTeamMultiUserParams: boolean;
  periodType: string;
  userParticipation: string;
  departmentParticipation: string;
  status: string;
  grouping?: string;
  serviceId?: string;
}) => {
  const params = new URLSearchParams({
    startPeriod: input.startPeriod,
    endPeriod: input.endPeriod,
    periodType: input.periodType,
    userParticipation: input.userParticipation,
    departmentParticipation: input.departmentParticipation,
    status: input.status,
    userStatus: "all",
    withTotals: "true",
  });
  params.set("grouping", input.grouping ?? "");

  params.set(
    "departmentId",
    input.departmentId && input.departmentId !== "all" ? input.departmentId : "all",
  );

  if (input.serviceId?.trim()) params.set("serviceId", input.serviceId.trim());

  const ids = input.digisacUserIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    params.set("userId", "all");
  } else if (ids.length === 1 || !input.useTeamMultiUserParams) {
    params.set("userId", ids[0]);
  } else {
    for (const userId of ids) {
      params.append("userId[]", userId);
      params.append("userIdsList[]", userId);
    }
  }

  console.log(
    "[Digisac] GET /api/v1/dashboard/general →",
    params.toString(),
    input.useTeamMultiUserParams ? "(equipe userId[])" : "(userId singular)",
  );
  return params;
};

const filterPayloadToUserIds = (payload: unknown, allowedIds: Set<string>) => {
  if (!allowedIds.size) return payload;
  const items = Array.isArray(payload)
    ? payload
    : firstArray(payload as Record<string, unknown>, ["items", "data", "rows", "users"]);
  const filtered = items.filter((row: Record<string, unknown>) => {
    const id = String(row?.userId ?? row?.id ?? (row?.user as Record<string, unknown>)?.id ?? "").trim();
    return id && allowedIds.has(id);
  });
  if (Array.isArray(payload)) return filtered;
  if (payload && typeof payload === "object") {
    return { ...(payload as Record<string, unknown>), items: filtered };
  }
  return { items: filtered };
};

const mergeByUserPayloadWithExpectedIds = (
  payload: any,
  expectedUserIds: string[],
  nameById: Map<string, string>,
) => {
  const items = Array.isArray(payload) ? payload : firstArray(payload, ["items", "data", "rows", "users"]);
  const byId = new Map<string, any>();
  for (const row of items) {
    const id = String(row?.userId ?? row?.id ?? row?.user?.id ?? row?.user_id ?? "").trim();
    if (id) byId.set(id, row);
  }
  const merged: any[] = [];
  for (const id of expectedUserIds) {
    const existing = byId.get(id);
    if (existing) merged.push(existing);
    else {
      merged.push({
        userId: id,
        userName: nameById.get(id) ?? "Analista",
        closedTicketsCount: 0,
        openedTicketsCount: 0,
        totalTicketsCount: 0,
        ticketTime: 0,
        totalMessagesCount: 0,
        contactsCount: 0,
        firstWaitingTime: 0,
      });
    }
  }
  if (Array.isArray(payload)) return merged;
  if (payload && typeof payload === "object") return { ...payload, items: merged };
  return { items: merged };
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let action: string | undefined;

  try {
    const url = new URL(req.url);
    const isTestRoute = req.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/test-digisac");

    let payload: Record<string, unknown> = {};
    let rawBody: Record<string, unknown> = {};
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
        rawBody = body && typeof body === "object" ? body : {};
        action = body?.action;
        payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
        if (Object.keys(payload).length === 0 && rawBody && typeof rawBody === "object") {
          const { action: _a, payload: _p, ...rest } = rawBody as Record<string, unknown>;
          if (Object.keys(rest).length > 0) payload = rest;
        }
      } catch {
        return handledErrorResponse(undefined, "Corpo JSON inválido.", { code: "INVALID_JSON" });
      }
    }

    if (typeof action === "string") {
      const trimmed = action.trim();
      action = trimmed === "answers_overview" ? "nps_dashboard" : trimmed.replace(/-/g, "_");
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
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !user) {
        return handledErrorResponse(action, "Usuário não autenticado.", { code: "UNAUTHORIZED" });
      }

      const userId = user.id;

      // Ações de administração de utilizadores (mesmo projeto que o app — evita função inexistente).
      if (ADMIN_USER_ACTIONS.has(action ?? "")) {
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
        const anonKey =
          Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() ?? "";
        const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
        if (!supabaseUrl || !anonKey || !serviceRole) {
          return jsonResponse({ error: "server_misconfigured" }, 500);
        }
        const gate = await assertCallerIsAdmin(authHeader, supabaseUrl, anonKey, serviceRole);
        if (!gate.ok) return jsonResponse(gate.body, gate.status);
        const adminBody = normalizeAdminBody(action, payload, rawBody);
        const result = await runAdminUserAction(gate, adminBody);
        return jsonResponse(result.body, result.status);
      }

      // Permission check (digisac_dashboard) — admins always allowed
      const protectedActions = new Set([
        "geral",
        "analistas",
        "nps_dashboard",
        "listar_departments",
        "listar_digisac_users",
        "listar_analysts",
      ]);
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
      const startTime = typeof payload?.startTime === "string" ? payload.startTime : undefined;
      const endTime = typeof payload?.endTime === "string" ? payload.endTime : undefined;
      const departmentId = typeof payload?.departmentId === "string" && payload.departmentId ? payload.departmentId : "all";
      const startPeriod = toDigisacPeriodIso(startDate, "start", startTime)!;
      const endPeriod = toDigisacPeriodIso(endDate, "end", endTime)!;
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const mappingsResult = await adminClient.from("digisac_analyst_mapping").select("digisac_user_id, analyst_id");
      if (mappingsResult.error) throw mappingsResult.error;
      const mappings = mappingsResult.data ?? [];

      const requestedUserIds = normalizeRequestedUserIds(payload, mappings);
      const validMappedUsers = await loadValidMappedAnalystUsers(adminClient, digisacUrl, digisacToken);
      const departmentNameFromPayload = typeof payload?.departmentName === "string"
        ? payload.departmentName.trim()
        : "";
      const departmentNameForScope = departmentNameFromPayload
        || (departmentId !== "all" ? await getDepartmentNameById(digisacUrl, digisacToken, departmentId) : undefined);
      const isClosureDepartment = !!findDigisacDepartmentAnalystRule(departmentNameForScope);
      const scopedMappedUsers = filterDigisacUsersForDepartment(
        departmentNameForScope,
        validMappedUsers,
      );
      if (isClosureDepartment) {
        console.log(
          "[Digisac] Departamento de encerramento:",
          departmentNameForScope,
          "→ somente:",
          scopedMappedUsers.map((u) => u.name).join(", "),
        );
      }
      let effectiveUserIds = resolveAnalystUserIds(requestedUserIds, scopedMappedUsers);
      if (isClosureDepartment && scopedMappedUsers.length > 0) {
        const scopedIds = new Set(scopedMappedUsers.map((u) => u.id));
        if (requestedUserIds.length === 0) {
          effectiveUserIds = scopedMappedUsers.map((u) => u.id);
        } else {
          effectiveUserIds = effectiveUserIds.filter((id) => scopedIds.has(id));
          if (effectiveUserIds.length === 0) {
            effectiveUserIds = scopedMappedUsers.map((u) => u.id);
          }
        }
      }
      const userParticipation = resolveUserParticipation(payload);
      const departmentParticipation = resolveDepartmentParticipation(payload);
      const periodType = resolvePeriodType(payload);
      const status = resolveTicketStatus(payload);
      const serviceId = typeof payload.serviceId === "string" ? payload.serviceId : undefined;
      const grouping = typeof payload.grouping === "string" ? payload.grouping : "";
      const queryPlan = resolveDigisacQueryPlan({
        action: action as "geral" | "analistas",
        departmentId,
        requestedUserIds,
        effectiveUserIds,
        isClosureDepartment,
      });

      const cacheScope = `${queryPlan.departmentId}_${queryPlan.userIds.join(",") || "all"}_${queryPlan.useDepartmentAndUserSingular ? "singular" : "team"}`;
      const cacheKey = `dashboard_proxy_${action}_${startPeriod}_${endPeriod}_${periodType}_${status}_${userParticipation}_${departmentParticipation}_${serviceId ?? ""}_${cacheScope}`;

      const cached = cache[cacheKey]?.data;
      if (cached && Date.now() - cache[cacheKey].timestamp < DASHBOARD_CACHE_TTL_MS) {
        return jsonResponse(cached);
      }

      const endpoint = "/api/v1/dashboard/general";

      if (action === "analistas" && effectiveUserIds.length === 0) {
        const emptyPayload = { items: [], totals: { closedTicketsCount: 0, contactsCount: 0, openedTicketsCount: 0, receivedMessagesCount: 0, sentMessagesCount: 0, totalMessagesCount: 0, totalTicketsCount: 0 } };
        cache[cacheKey] = { data: emptyPayload, timestamp: Date.now() };
        return jsonResponse(emptyPayload);
      }

      if (action === "analistas") {
        const nameById = new Map(scopedMappedUsers.map((u) => [u.id, u.name]));
        const deptForAnalyst = queryPlan.departmentId;

        const fetchAnalystItem = async (uid: string) => {
          const params = buildDigisacGeneralDashboardParams({
            startPeriod,
            endPeriod,
            departmentId: deptForAnalyst,
            digisacUserIds: [uid],
            useTeamMultiUserParams: false,
            periodType,
            userParticipation,
            departmentParticipation,
            status,
            grouping,
            serviceId,
          });
          const r = await fetchDigisac(digisacUrl, digisacToken, endpoint, params);
          const displayName = nameById.get(uid) ?? "Analista";
          if (!r.ok) {
            console.warn("[Digisac] Métricas do analista falhou:", uid, r.status);
            return buildAnalystItemFromGeneralTotals(uid, displayName, { totals: {} });
          }
          return buildAnalystItemFromGeneralTotals(uid, displayName, r.data);
        };

        console.log(
          "[Digisac] analistas: buscando",
          effectiveUserIds.length,
          "analista(s) com departmentId=",
          deptForAnalyst,
        );
        const items = await Promise.all(effectiveUserIds.map((uid) => fetchAnalystItem(uid)));
        const outData = { items, totals: {} };
        cache[cacheKey] = { data: outData, timestamp: Date.now() };
        return jsonResponse(outData);
      }

      const params = buildDigisacGeneralDashboardParams({
        startPeriod,
        endPeriod,
        departmentId: queryPlan.departmentId,
        digisacUserIds: queryPlan.userIds,
        useTeamMultiUserParams: queryPlan.useTeamMultiUserParams,
        periodType,
        userParticipation,
        departmentParticipation,
        status,
        grouping,
        serviceId,
      });
      const response = await fetchDigisac(digisacUrl, digisacToken, endpoint, params);
      if (!response.ok) {
        return handledErrorResponse(action, `Erro API Digisac: ${response.status}`, {
          code: "DIGISAC_API_ERROR",
          digisac_status: response.status,
        });
      }

      cache[cacheKey] = {
        data: response.data,
        timestamp: Date.now(),
      };

      return jsonResponse(response.data);
    }

    if (action === "nps_dashboard" || action === "answers_overview") {
      const today = getTodayBrazilDate();
      const startDate = formatDateOnly(typeof payload?.startDate === "string" ? payload.startDate : undefined) ?? today;
      const endDate = formatDateOnly(typeof payload?.endDate === "string" ? payload.endDate : undefined) ?? startDate;
      const startTime = typeof payload?.startTime === "string" ? payload.startTime : undefined;
      const endTime = typeof payload?.endTime === "string" ? payload.endTime : undefined;
      const from = toDigisacPeriodIso(startDate, "start", startTime)!;
      const to = toDigisacPeriodIso(endDate, "end", endTime)!;

      const evaluationType = typeof payload?.evaluationType === "string"
        && (payload.evaluationType === "csat" || payload.evaluationType === "nps")
        ? payload.evaluationType
        : "nps";
      const periodType = typeof payload?.periodType === "string"
        && ["all", "close", "open"].includes(payload.periodType)
        ? payload.periodType as "all" | "close" | "open"
        : "all";
      const serviceId = typeof payload?.serviceId === "string" ? payload.serviceId : undefined;

      let departmentId = typeof payload?.departmentId === "string" && payload.departmentId
        ? payload.departmentId
        : "all";
      const departmentNameFromPayload = typeof payload?.departmentName === "string"
        ? payload.departmentName.trim()
        : "";

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const mappingsResult = await adminClient.from("digisac_analyst_mapping").select("digisac_user_id, analyst_id");
      if (mappingsResult.error) throw mappingsResult.error;
      const mappings = mappingsResult.data ?? [];

      if (!departmentId || departmentId === "all") {
        const deptCacheKey = "digisac_departments";
        let departments: Array<{ id: string; name: string }> | undefined = cache[deptCacheKey]?.data;
        if (!departments || Date.now() - cache[deptCacheKey].timestamp >= LIST_CACHE_TTL_MS) {
          const r = await fetchDigisac(digisacUrl, digisacToken, "/api/v1/departments");
          if (r.ok) {
            const list = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
            departments = list
              .filter((d: { id?: string; deletedAt?: unknown }) => d?.id && !d.deletedAt)
              .map((d: { id: string; name?: string }) => ({ id: String(d.id), name: d.name || "Sem nome" }));
            cache[deptCacheKey] = { data: departments, timestamp: Date.now() };
          }
        }
        const suporteId = pickSuporteDepartmentId(departments ?? []);
        if (suporteId) departmentId = suporteId;
      }

      const departmentName = departmentNameFromPayload
        || (departmentId !== "all" ? await getDepartmentNameById(digisacUrl, digisacToken, departmentId) : undefined)
        || "Suporte";

      const requestedUserIds = normalizeRequestedUserIds(payload, mappings);
      const validMappedUsers = await loadValidMappedAnalystUsers(adminClient, digisacUrl, digisacToken);
      const effectiveUserIds = resolveAnalystUserIds(requestedUserIds, validMappedUsers);
      const nameById = new Map(validMappedUsers.map((u) => [u.id, u.name]));

      const digisacFetch = async (endpoint: string, params?: URLSearchParams) => {
        const r = await fetchDigisac(digisacUrl, digisacToken, endpoint, params);
        return { ok: r.ok, status: r.status, data: r.data };
      };

      const queryBase = {
        from,
        to,
        departmentId,
        type: evaluationType,
        periodType,
        serviceId,
      };

      const cacheKey = `nps_dashboard_${from}_${to}_${departmentId}_${evaluationType}_${periodType}_${serviceId ?? ""}_${effectiveUserIds.join(",") || "all"}`;
      const cached = cache[cacheKey]?.data;
      if (cached && Date.now() - cache[cacheKey].timestamp < DASHBOARD_CACHE_TTL_MS) {
        return jsonResponse(cached);
      }

      if (!departmentId || departmentId === "all") {
        return handledErrorResponse(action, "Departamento Suporte não encontrado no Digisac.", {
          code: "NPS_DEPT_MISSING",
        });
      }

      const chartUserId = effectiveUserIds.length === 1 ? effectiveUserIds[0] : undefined;
      const analystsToQuery = effectiveUserIds.length > 0
        ? effectiveUserIds
        : validMappedUsers.map((u) => u.id);

      console.log("[Digisac NPS] dept=", departmentId, "período", from, "→", to);

      const analystRows = await Promise.all(
        analystsToQuery.map(async (uid) => {
          const displayName = nameById.get(uid) ?? "Analista";
          const overview = await fetchDigisacNpsOverview(digisacFetch, {
            ...queryBase,
            userId: uid,
          });
          return {
            userId: uid,
            name: displayName,
            total: overview.total,
            overview,
          };
        }),
      );

      let overviewMapped = await fetchDigisacNpsOverview(digisacFetch, {
        ...queryBase,
        userId: chartUserId,
      });

      if (overviewMapped.total <= 0 && analystRows.some((a) => a.total > 0)) {
        overviewMapped = chartUserId
          ? (analystRows.find((a) => a.userId === chartUserId)?.overview ?? sumOverviewFromParts(analystRows.map((a) => a.overview)))
          : sumOverviewFromParts(analystRows.map((a) => a.overview));
      }

      const allAnswerRows = await fetchDigisacAnswersRows(digisacFetch, queryBase);
      console.log("[Digisac NPS] /answers linhas:", allAnswerRows.length);

      if (overviewMapped.total <= 0 && allAnswerRows.length > 0) {
        overviewMapped = countsToMappedOverview(aggregateAnswerRows(allAnswerRows));
      }

      const countsByAnalyst = aggregateAnswersByMappedAnalysts(allAnswerRows, validMappedUsers);
      for (const row of analystRows) {
        if (row.total > 0) continue;
        const fromList = countsByAnalyst.get(row.userId);
        if (fromList && fromList.total > 0) {
          row.overview = countsToMappedOverview(fromList);
          row.total = row.overview.total;
        }
      }

      analystRows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

      const out = {
        departmentId,
        departmentName,
        overview: overviewMapped,
        analysts: analystRows,
        dataSource: overviewMapped.total > 0 || analystRows.some((a) => a.total > 0) ? "api" : "empty",
        answersRowCount: allAnswerRows.length,
      };
      cache[cacheKey] = { data: out, timestamp: Date.now() };
      return jsonResponse(out);
    }

    if (action === "listar_analysts") {
      // Returns only valid Digisac users mapped to active internal analysts
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const users = await loadValidMappedAnalystUsers(adminClient, digisacUrl, digisacToken);
      return jsonResponse(users);
    }

    if (action === "listar_digisac_users") {
      const cacheKey = "digisac_users_full_list";
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < LIST_CACHE_TTL_MS) {
        return jsonResponse(cache[cacheKey].data);
      }
      const pageSize = 200;
      const merged: unknown[] = [];
      const seen = new Set<string>();
      let page = 1;
      let hasMore = true;
      while (hasMore && page < 80) {
        const params = new URLSearchParams({ limit: String(pageSize), page: String(page) });
        const r = await fetchDigisac(digisacUrl, digisacToken, "/api/v1/users", params);
        if (!r.ok) {
          if (page === 1) {
            const r0 = await fetchDigisac(digisacUrl, digisacToken, "/api/v1/users");
            if (!r0.ok) {
              return handledErrorResponse(action, `Erro API Digisac: ${r0.status}`, {
                code: "DIGISAC_API_ERROR",
                digisac_status: r0.status,
              });
            }
            const users = Array.isArray(r0.data?.data) ? r0.data.data : Array.isArray(r0.data) ? r0.data : [];
            cache[cacheKey] = { data: users, timestamp: Date.now() };
            return jsonResponse(users);
          }
          break;
        }
        const list = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
        let newOnPage = 0;
        for (const u of list) {
          const id = String((u as any)?.id ?? "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(u);
          newOnPage++;
        }
        if (list.length < pageSize || newOnPage === 0) hasMore = false;
        else page++;
      }
      cache[cacheKey] = { data: merged, timestamp: Date.now() };
      return jsonResponse(merged);
    }

    if (action === "listar_departments") {
      const cacheKey = "digisac_departments";
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < LIST_CACHE_TTL_MS) {
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
