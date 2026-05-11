import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

interface CacheItem { data: any; timestamp: number; }
const cache: Record<string, CacheItem> = {};
const CACHE_TTL_MS = 15 * 1000;
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
  
  // Para o início do período: 00:00:00 no horário de Brasília (UTC-3) -> 03:00:00 UTC
  // Para o fim do período: 23:59:59 no horário de Brasília (UTC-3) -> 02:59:59 UTC do DIA SEGUINTE
  const utcDate = boundary === "start"
    ? new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0))
    : new Date(Date.UTC(year, month - 1, day + 1, 2, 59, 59, 999));
    
  return utcDate.toISOString();
};

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

const normalizeRequestedUserIds = (payload: Record<string, unknown>) => {
  const userIds = Array.isArray(payload.userIds)
    ? payload.userIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0 && value !== "all")
    : [];
  const singleUserId = typeof payload.userId === "string" && payload.userId.trim().length > 0 && payload.userId !== "all"
    ? payload.userId
    : undefined;

  if (userIds.length > 0) return userIds;
  if (singleUserId) return [singleUserId];
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

/**
 * Participação do atendente / andamento no departamento (mesmos filtros da tela Digisac).
 * Padrão `all` = contar chamados em que houve participação (não só como último responsável).
 * Se a API da sua instância exigir outro valor, defina DIGISAC_USER_PARTICIPATION / DIGISAC_DEPARTMENT_PARTICIPATION (ex.: last).
 */
const dashboardUserParticipation = () => {
  const v = Deno.env.get("DIGISAC_USER_PARTICIPATION")?.trim();
  return v && v.length > 0 ? v : "all";
};

const dashboardDepartmentParticipation = () => {
  const v = Deno.env.get("DIGISAC_DEPARTMENT_PARTICIPATION")?.trim();
  return v && v.length > 0 ? v : "all";
};

/**
 * Dashboard geral: com o mesmo critério da Digisac ao filtrar só departamento/período,
 * usar `userId=all` (toda a equipe no escopo). Só restringe a um atendente quando o filtro do app pede um analista.
 */
const buildGeneralDashboardParams = (
  startPeriod: string,
  endPeriod: string,
  departmentId: string,
  singleMappedDigisacUserId?: string,
) => {
  const params = new URLSearchParams({
    startPeriod,
    endPeriod,
    periodType: "openDate",
    userParticipation: dashboardUserParticipation(),
    departmentParticipation: dashboardDepartmentParticipation(),
    status: "all",
    userStatus: "all",
    withTotals: "true",
  });

  if (departmentId && departmentId !== "all") params.set("departmentId", departmentId);

  if (singleMappedDigisacUserId && singleMappedDigisacUserId.trim().length > 0) {
    params.set("userId", singleMappedDigisacUserId.trim());
  } else {
    params.set("userId", "all");
  }

  console.log("PARAMS FINAIS (geral):", params.toString());
  return params;
};

const buildAnalystsDashboardParams = (
  startPeriod: string,
  endPeriod: string,
  departmentId: string,
  requestedUserIds: string[],
) => {
  const params = new URLSearchParams({
    startPeriod,
    endPeriod,
    periodType: "openDate",
    userParticipation: dashboardUserParticipation(),
    departmentParticipation: dashboardDepartmentParticipation(),
    status: "all",
    userStatus: "all",
    withTotals: "true",
  });

  if (departmentId && departmentId !== "all") params.set("departmentId", departmentId);

  requestedUserIds.forEach((userId) => params.append("userId[]", userId));

  console.log("PARAMS FINAIS (analistas):", params.toString());
  return params;
};

const mergeByUserPayloadWithExpectedIds = (
  payload: any,
  expectedUserIds: string[],
  nameById: Map<string, string>,
) => {
  const items = Array.isArray(payload) ? payload : firstArray(payload, ["items", "data", "rows", "users"]);
  const byId = new Map<string, any>();
  for (const row of items) {
    const id = String(row?.userId ?? row?.id ?? row?.user?.id ?? "").trim();
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
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !user) {
        return handledErrorResponse(action, "Usuário não autenticado.", { code: "UNAUTHORIZED" });
      }

      // Permission check (digisac_dashboard) — admins always allowed
      const userId = user.id;
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
      const requestedUserIds = normalizeRequestedUserIds(payload);
      const startPeriod = toDigisacPeriod(startDate, "start")!;
      const endPeriod = toDigisacPeriod(endDate, "end")!;
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const validMappedUsers = await loadValidMappedAnalystUsers(adminClient, digisacUrl, digisacToken);
      const effectiveUserIds = resolveAnalystUserIds(requestedUserIds, validMappedUsers);
      const generalSingleUserId =
        requestedUserIds.length === 1 && resolveAnalystUserIds(requestedUserIds, validMappedUsers).length === 1
          ? requestedUserIds[0]
          : undefined;
      const cacheScope = action === "geral"
        ? (generalSingleUserId ?? "all")
        : (effectiveUserIds.join(",") || "none");
      const cacheKey = `dashboard_proxy_${action}_${startPeriod}_${endPeriod}_${departmentId}_${cacheScope}`;

      const cached = cache[cacheKey]?.data;
      if (cached && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
        return jsonResponse(cached);
      }

      const endpoint = action === "geral" ? "/api/v1/dashboard/general" : "/api/v1/dashboard/by-user";

      if (action === "analistas" && effectiveUserIds.length === 0) {
        const emptyPayload = { items: [], totals: { closedTicketsCount: 0, contactsCount: 0, openedTicketsCount: 0, receivedMessagesCount: 0, sentMessagesCount: 0, totalMessagesCount: 0, totalTicketsCount: 0 } };
        cache[cacheKey] = { data: emptyPayload, timestamp: Date.now() };
        return jsonResponse(emptyPayload);
      }

      const params = action === "geral"
        ? buildGeneralDashboardParams(startPeriod, endPeriod, departmentId, generalSingleUserId)
        : buildAnalystsDashboardParams(startPeriod, endPeriod, departmentId, effectiveUserIds);
      const response = await fetchDigisac(digisacUrl, digisacToken, endpoint, params);
      if (!response.ok) {
        return handledErrorResponse(action, `Erro API Digisac: ${response.status}`, {
          code: "DIGISAC_API_ERROR",
          digisac_status: response.status,
        });
      }

      let outData = response.data;
      if (action === "analistas") {
        const nameById = new Map(validMappedUsers.map((u) => [u.id, u.name]));
        outData = mergeByUserPayloadWithExpectedIds(response.data, effectiveUserIds, nameById);
      }

      cache[cacheKey] = {
        data: outData,
        timestamp: Date.now(),
      };

      return jsonResponse(outData);
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
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
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
