import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

// ============================================================================
// CACHE
// ============================================================================
interface CacheItem { data: any; timestamp: number; }
const cache: Record<string, CacheItem> = {};
const CACHE_TTL_MS = 60 * 1000; // 60s

// ============================================================================
// HELPERS
// ============================================================================
const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const trimForLogs = (value: string, maxLength = 500) => (
  value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
);

const safeParseJson = (value: string) => {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
};

const parseIncomingDate = (value?: string, boundary: 'start' | 'end' = 'start'): string | undefined => {
  if (!value || typeof value !== 'string') return undefined;

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return boundary === 'start'
      ? `${year}-${month}-${day}T00:00:00Z`
      : `${year}-${month}-${day}T23:59:59Z`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().replace('.000Z', 'Z');
};

const extractDigisacArray = (payload: any): any[] => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

const extractDigisacTotal = (payload: any): number | null => {
  // Digisac normalmente retorna { data, total, page, ... }
  if (typeof payload?.total === 'number') return payload.total;
  if (typeof payload?.count === 'number') return payload.count;
  return null;
};

const buildDigisacUrl = (baseUrl: string, endpoint: string, params?: URLSearchParams) => {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedEp = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const qs = params?.toString();
  return `${normalizedBase}${normalizedEp}${qs ? `?${qs}` : ''}`;
};

const buildErrorPayload = (action: string | undefined, message: string, extra: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = {
    error: true, message, total: 0, analistas: [],
    total_chamados: 0, total_fechados: 0, total_abertos: 0,
    total_mensagens: 0, total_contatos: 0,
    tma_geral_minutos: 0, tempo_espera_minutos: 0, primeira_resposta_minutos: 0,
  };
  if (action === 'listar_digisac_users') return { ...base, users: [], ...extra };
  if (action === 'test_digisac') return { ...base, digisac_status: null, sample: null, ...extra };
  return { ...base, ...extra };
};

const handledErrorResponse = (action: string | undefined, message: string, extra: Record<string, unknown> = {}) =>
  jsonResponse(buildErrorPayload(action, message, extra), 200);

// ============================================================================
// FETCH WITH PAGINATION
// ============================================================================
const fetchDigisac = async (baseUrl: string, token: string, endpoint: string, params?: URLSearchParams) => {
  const finalUrl = buildDigisacUrl(baseUrl, endpoint, params);
  console.log('[Digisac] GET', finalUrl);
  const response = await fetch(finalUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const bodyText = await response.text();
  if (!response.ok) {
    console.error('[Digisac] Error', response.status, trimForLogs(bodyText));
  }
  return { ok: response.ok, status: response.status, bodyText, data: safeParseJson(bodyText) };
};

/**
 * Busca todos os tickets paginando (Digisac usa offset/limit).
 * Aplica filtro de período em `startedAt` (data de abertura).
 */
const fetchAllTickets = async (
  baseUrl: string,
  token: string,
  startDate?: string,
  endDate?: string,
  isOpen?: boolean,
): Promise<{ tickets: any[]; lastStatus: number; lastError?: string }> => {
  const PAGE_SIZE = 100;
  let offset = 0;
  let all: any[] = [];
  let lastStatus = 200;
  let safety = 50; // máximo 5000 tickets

  while (safety-- > 0) {
    const params = new URLSearchParams();
    if (typeof isOpen === 'boolean') params.append('where[isOpen]', String(isOpen));
    if (startDate) params.append('where[startedAt][gte]', startDate);
    if (endDate) params.append('where[startedAt][lte]', endDate);
    params.append('limit', String(PAGE_SIZE));
    params.append('offset', String(offset));
    // Pedimos os campos necessários (se a API ignorar, retorna tudo)
    params.append('include[]', 'metrics');

    const res = await fetchDigisac(baseUrl, token, '/tickets', params);
    lastStatus = res.status;
    if (!res.ok) {
      return { tickets: all, lastStatus, lastError: res.bodyText };
    }
    const batch = extractDigisacArray(res.data);
    all = all.concat(batch);
    console.log(`[Digisac] Page offset=${offset} got=${batch.length} total_so_far=${all.length}`);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return { tickets: all, lastStatus };
};

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let action: string | undefined;
  try {
    const url = new URL(req.url);
    const isTestRoute = req.method === 'GET' && url.pathname.replace(/\/+$/, '').endsWith('/test-digisac');

    let payload: Record<string, unknown> = {};
    if (isTestRoute) {
      action = 'test_digisac';
    } else if (req.method === 'GET') {
      action = url.searchParams.get('action') ?? undefined;
      payload = {
        startDate: url.searchParams.get('startDate') ?? undefined,
        endDate: url.searchParams.get('endDate') ?? undefined,
      };
    } else {
      try {
        const body = await req.json();
        action = body?.action;
        payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      } catch {
        return handledErrorResponse(undefined, 'Corpo JSON inválido.', { code: 'INVALID_JSON' });
      }
    }

    console.log('[Digisac] Action:', action, 'Payload:', JSON.stringify(payload));

    const authHeader = req.headers.get('Authorization');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: authHeader ? { Authorization: authHeader } : {} } }
    );

    if (action !== 'test_digisac') {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return handledErrorResponse(action, 'Usuário não autenticado. Faça login para acessar a integração.', { code: 'UNAUTHORIZED' });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return handledErrorResponse(action, 'Usuário não autenticado.', { code: 'UNAUTHORIZED' });
      }
    }

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

    const startDate = parseIncomingDate(
      typeof payload?.startDate === 'string' && payload.startDate ? payload.startDate : undefined,
      'start'
    ) ?? todayStart.toISOString().replace('.000Z', 'Z');
    const endDate = parseIncomingDate(
      typeof payload?.endDate === 'string' && payload.endDate ? payload.endDate : undefined,
      'end'
    ) ?? todayEnd.toISOString().replace('.000Z', 'Z');

    console.log('startDate:', startDate);
    console.log('endDate:', endDate);

    const digisacUrl = Deno.env.get('DIGISAC_API_URL');
    const digisacToken = Deno.env.get('DIGISAC_API_TOKEN');
    if (!digisacUrl || !digisacToken) {
      return handledErrorResponse(action, 'Configuração do Digisac ausente no backend.', { code: 'CONFIG_MISSING' });
    }

    // ---------- TEST ----------
    if (action === 'test_digisac') {
      const params = new URLSearchParams({ limit: '1' });
      const r = await fetchDigisac(digisacUrl, digisacToken, '/users', params);
      if (!r.ok) {
        return handledErrorResponse(action, `Erro API Digisac: ${r.status}`, {
          code: 'DIGISAC_API_ERROR', digisac_status: r.status, sample: null,
        });
      }
      const sample = extractDigisacArray(r.data)[0] ?? null;
      return jsonResponse({
        ok: true, digisac_status: r.status,
        sample: sample ? { id: sample.id, name: sample.name, email: sample.email } : null,
      });
    }

    // ---------- DASHBOARD (geral + analistas em uma única busca) ----------
    if (action === 'geral' || action === 'analistas') {
      const cacheKey = `dash_${startDate || 'all'}_${endDate || 'all'}`;
      let snapshot: any = null;

      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
        console.log('[Digisac] Cache hit:', cacheKey);
        snapshot = cache[cacheKey].data;
      } else {
        // Buscar fechados E abertos em paralelo
        const [closedResult, openResult] = await Promise.all([
          fetchAllTickets(digisacUrl, digisacToken, startDate, endDate, false),
          fetchAllTickets(digisacUrl, digisacToken, startDate, endDate, true),
        ]);

        if (closedResult.lastError) {
          return handledErrorResponse(action, `Erro API Digisac: ${closedResult.lastStatus}`, {
            code: 'DIGISAC_API_ERROR', digisac_status: closedResult.lastStatus,
          });
        }

        const closed = closedResult.tickets;
        const open = openResult.tickets;
        const all = [...closed, ...open];

        console.log('[Digisac] returnedCounts', JSON.stringify({
          closed: closed.length,
          open: open.length,
          total: all.length,
          sample: all[0] ? {
            id: all[0].id,
            startedAt: all[0].startedAt,
            endedAt: all[0].endedAt,
            createdAt: all[0].createdAt,
            updatedAt: all[0].updatedAt,
            isOpen: all[0].isOpen,
            userId: all[0].userId,
            ownerId: all[0].ownerId,
          } : null,
        }));

        // Mapeamentos
        const { data: mappings } = await supabaseClient
          .from('digisac_analyst_mapping')
          .select('digisac_user_id, digisac_user_name, analysts(id, name)');

        const analistaInfo: Record<string, { id: string; name: string; mapped: boolean }> = {};
        mappings?.forEach((m: any) => {
          if (m.analysts) {
            analistaInfo[m.digisac_user_id] = { id: m.analysts.id, name: m.analysts.name, mapped: true };
          }
        });

        // Cálculo de métricas
        let sumTicketTime = 0, countTicketTime = 0;
        let sumWaitingTime = 0, countWaitingTime = 0;
        let sumFirstWaiting = 0, countFirstWaiting = 0;
        let sumMessages = 0;
        const contatosSet = new Set<string>();

        const perAnalyst: Record<string, {
          id: string; name: string; mapped: boolean;
          fechados: number; abertos: number; total: number;
          tma_sum: number; tma_count: number;
        }> = {};

        const ensureAnalyst = (userId: string): typeof perAnalyst[string] => {
          if (!perAnalyst[userId]) {
            const info = analistaInfo[userId];
            perAnalyst[userId] = {
              id: info?.id || userId,
              name: info?.name || 'Não mapeado',
              mapped: !!info,
              fechados: 0, abertos: 0, total: 0,
              tma_sum: 0, tma_count: 0,
            };
          }
          return perAnalyst[userId];
        };

        all.forEach((t: any) => {
          const userId = t.userId || t.ownerId;
          const isOpen = !!t.isOpen;
          const m = t.metrics || {};

          if (t.contactId) contatosSet.add(t.contactId);
          if (typeof m.messagingTime === 'number') {
            // não somamos messagingTime; mensagens = via outra contagem se disponível
          }
          // Contagem de mensagens (se a API expuser)
          if (typeof t.messagesCount === 'number') sumMessages += t.messagesCount;

          // TMA — apenas em chamados fechados, usando metrics.ticketTime (segundos)
          let ticketTimeMin = 0;
          if (!isOpen) {
            if (typeof m.ticketTime === 'number' && m.ticketTime > 0) {
              ticketTimeMin = m.ticketTime / 60;
            } else if (t.startedAt && t.endedAt) {
              const d = (new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) / 60000;
              if (d > 0) ticketTimeMin = d;
            }
            if (ticketTimeMin > 0) {
              sumTicketTime += ticketTimeMin;
              countTicketTime++;
            }
          }

          // Tempo médio de espera total
          if (typeof m.waitingTime === 'number' && m.waitingTime > 0) {
            sumWaitingTime += m.waitingTime / 60;
            countWaitingTime++;
          }
          // 1º tempo de espera
          const firstWait = m.firstWaitingTime ?? m.waitingTimeFirst ?? null;
          if (typeof firstWait === 'number' && firstWait > 0) {
            sumFirstWaiting += firstWait / 60;
            countFirstWaiting++;
          }

          if (userId) {
            const a = ensureAnalyst(userId);
            a.total++;
            if (isOpen) a.abertos++; else a.fechados++;
            if (!isOpen && ticketTimeMin > 0) {
              a.tma_sum += ticketTimeMin;
              a.tma_count++;
            }
          }
        });

        snapshot = {
          totals: {
            total_chamados: all.length,
            total_fechados: closed.length,
            total_abertos: open.length,
            total_mensagens: sumMessages,
            total_contatos: contatosSet.size,
            tma_geral_minutos: countTicketTime > 0 ? sumTicketTime / countTicketTime : 0,
            tempo_espera_minutos: countWaitingTime > 0 ? sumWaitingTime / countWaitingTime : 0,
            primeira_resposta_minutos: countFirstWaiting > 0 ? sumFirstWaiting / countFirstWaiting : 0,
          },
          analistas: Object.values(perAnalyst).map(a => ({
            analyst_id: a.id,
            name: a.name,
            mapped: a.mapped,
            total_chamados: a.total,
            chamados_fechados: a.fechados,
            chamados_abertos: a.abertos,
            tma_minutos: a.tma_count > 0 ? a.tma_sum / a.tma_count : 0,
          })),
        };

        cache[cacheKey] = { data: snapshot, timestamp: Date.now() };
        console.log('[Digisac] Snapshot:', JSON.stringify(snapshot.totals));
      }

      if (action === 'geral') {
        return jsonResponse({
          ...snapshot.totals,
          total: snapshot.totals.total_chamados,
          analistas: snapshot.analistas,
        });
      }
      // analistas
      return jsonResponse(snapshot.analistas);
    }

    // ---------- LISTAR USUÁRIOS DIGISAC ----------
    if (action === 'listar_digisac_users') {
      const cacheKey = 'digisac_users';
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
        return jsonResponse(cache[cacheKey].data);
      }
      const r = await fetchDigisac(digisacUrl, digisacToken, '/users');
      if (!r.ok) {
        return handledErrorResponse(action, `Erro API Digisac: ${r.status}`, {
          code: 'DIGISAC_API_ERROR', digisac_status: r.status,
        });
      }
      const users = extractDigisacArray(r.data);
      cache[cacheKey] = { data: users, timestamp: Date.now() };
      return jsonResponse(users);
    }

    return handledErrorResponse(action, 'Ação inválida.', { code: 'INVALID_ACTION' });
  } catch (error: any) {
    console.error('[Edge Function Error]', error?.message || error);
    return handledErrorResponse(action, error?.message || 'Internal Edge Function Error', { code: 'UNEXPECTED_ERROR' });
  }
});
