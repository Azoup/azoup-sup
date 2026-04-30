import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

// Simple in-memory cache
interface CacheItem {
  data: any;
  timestamp: number;
}
const cache: Record<string, CacheItem> = {};
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const trimForLogs = (value: string, maxLength = 2000) => (
  value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
);

const safeParseJson = (value: string) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const extractDigisacArray = (payload: any) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

const buildDigisacUrl = (baseUrl: string, endpoint: string, params?: URLSearchParams) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const queryString = params?.toString();
  return `${normalizedBaseUrl}${normalizedEndpoint}${queryString ? `?${queryString}` : ''}`;
};

const buildErrorPayload = (action: string | undefined, message: string, extra: Record<string, unknown> = {}) => {
  const basePayload = {
    error: true,
    message,
    total: 0,
    analistas: [],
  };

  if (action === 'geral') {
    return {
      ...basePayload,
      total_chamados: 0,
      tma_geral_minutos: 0,
      ...extra,
    };
  }

  if (action === 'listar_digisac_users') {
    return {
      ...basePayload,
      users: [],
      ...extra,
    };
  }

  if (action === 'test_digisac') {
    return {
      ...basePayload,
      digisac_status: null,
      sample: null,
      ...extra,
    };
  }

  return {
    ...basePayload,
    ...extra,
  };
};

const handledErrorResponse = (action: string | undefined, message: string, extra: Record<string, unknown> = {}) => (
  jsonResponse(buildErrorPayload(action, message, extra), 200)
);

const fetchDigisac = async (baseUrl: string, token: string, endpoint: string, params?: URLSearchParams) => {
  const finalUrl = buildDigisacUrl(baseUrl, endpoint, params);
  const loggedParams = params ? Object.fromEntries(params.entries()) : {};

  console.log('[Digisac] URL:', finalUrl);
  console.log('[Digisac] Params:', JSON.stringify(loggedParams));

  const response = await fetch(finalUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const responseBody = await response.text();
  console.log('[Digisac] Response status:', response.status);
  console.log('[Digisac] Response body:', trimForLogs(responseBody));

  return {
    ok: response.ok,
    status: response.status,
    bodyText: responseBody,
    data: safeParseJson(responseBody),
  };
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    console.log('[Digisac] Action:', action);
    console.log('[Digisac] Payload:', JSON.stringify(payload));

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: req.headers.get('Authorization') ? { Authorization: req.headers.get('Authorization')! } : {} } }
    );

    // Verify authentication
    if (action !== 'test_digisac') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return handledErrorResponse(action, 'Usuário não autenticado. Faça login para acessar a integração.', { code: 'UNAUTHORIZED' });
      }

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        console.error('[Digisac] Auth error:', authError?.message || 'Usuário não encontrado');
        return handledErrorResponse(action, 'Usuário não autenticado. Faça login para acessar a integração.', { code: 'UNAUTHORIZED' });
      }
    }

    const startDate = typeof payload?.startDate === 'string' ? payload.startDate : undefined;
    const endDate = typeof payload?.endDate === 'string' ? payload.endDate : undefined;

    const digisacUrl = Deno.env.get('DIGISAC_API_URL');
    const digisacToken = Deno.env.get('DIGISAC_API_TOKEN');

    console.log(`[Digisac] Checking config. URL length: ${digisacUrl?.length || 0}, Token length: ${digisacToken?.length || 0}`);

    if (!digisacUrl || !digisacToken) {
      console.error('[Digisac] Configuration missing: DIGISAC_API_URL or DIGISAC_API_TOKEN is not set in environment variables.');
      return handledErrorResponse(action, 'Configuração do Digisac ausente no backend.', { code: 'CONFIG_MISSING' });
    }

    if (action === 'test_digisac') {
      const testParams = new URLSearchParams({ limit: '1' });
      const testResult = await fetchDigisac(digisacUrl, digisacToken, '/users', testParams);

      if (!testResult.ok) {
        return handledErrorResponse(action, `Erro API Digisac: ${testResult.status}`, {
          code: 'DIGISAC_API_ERROR',
          digisac_status: testResult.status,
          sample: null,
        });
      }

      const sample = extractDigisacArray(testResult.data)[0] ?? null;
      return jsonResponse({
        ok: true,
        digisac_status: testResult.status,
        sample: sample ? {
          id: sample.id ?? null,
          name: sample.name ?? null,
          email: sample.email ?? null,
        } : null,
      });
    }

    if (action === 'geral' || action === 'analistas') {
      // Check cache first
      const cacheKey = `tickets_data_${startDate || 'all'}_${endDate || 'all'}`;
      let tickets = [];

      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
        console.log('[Digisac] Serving tickets from cache');
        tickets = cache[cacheKey].data;
      } else {
        console.log('[Digisac] Fetching fresh ticket data from Digisac');
        // Digisac API: usa bracket notation simples. Apenas `createdAt` aceita gte/lte.
        // `closedAt` com operadores retorna 500. `where` como JSON string também falha.
        const params = new URLSearchParams();
        params.append('where[isOpen]', 'false');
        if (startDate) params.append('where[createdAt][gte]', `${startDate}T00:00:00.000Z`);
        if (endDate) params.append('where[createdAt][lte]', `${endDate}T23:59:59.999Z`);
        params.append('limit', '500');

        const ticketsRes = await fetchDigisac(digisacUrl, digisacToken, '/tickets', params);
        if (!ticketsRes.ok) {
          return handledErrorResponse(action, `Erro API Digisac: ${ticketsRes.status}`, {
            code: 'DIGISAC_API_ERROR',
            digisac_status: ticketsRes.status,
          });
        }

        tickets = extractDigisacArray(ticketsRes.data);

        cache[cacheKey] = {
          data: tickets,
          timestamp: Date.now()
        };
      }

      // Fetch mappings from DB
      const { data: mappings, error: mappingError } = await supabaseClient
        .from('digisac_analyst_mapping')
        .select(`
          digisac_user_id,
          analysts(id, name)
        `);

      if (mappingError) {
        console.error('[Digisac] Mapping error:', mappingError.message);
        return handledErrorResponse(action, 'Falha ao carregar o mapeamento de analistas.', { code: 'MAPPING_ERROR' });
      }

      // Process Data
      let totalTickets = 0;
      let totalTmaMinutes = 0;
      let ticketsWithTmaCount = 0;

      const analistasStats: Record<string, { id: string, name: string, total: number, tma_minutes: number, closed_count: number }> = {};

      // Initialize mapped analysts
      mappings?.forEach((m: any) => {
        if (m.analysts) {
           analistasStats[m.digisac_user_id] = {
             id: m.analysts.id,
             name: m.analysts.name,
             total: 0,
             tma_minutes: 0,
             closed_count: 0
           };
        }
      });

      tickets.forEach((ticket: any) => {
        totalTickets++;
        
        // Calculate TMA
        if (ticket.createdAt && ticket.closedAt) {
           const opened = new Date(ticket.createdAt).getTime();
           const closed = new Date(ticket.closedAt).getTime();
           const diffMinutes = (closed - opened) / 60000;
           
           if (diffMinutes > 0) {
             totalTmaMinutes += diffMinutes;
             ticketsWithTmaCount++;

             const userId = ticket.userId || ticket.ownerId; // Adjust based on Digisac ticket structure
             if (userId && analistasStats[userId]) {
               analistasStats[userId].total++;
               analistasStats[userId].closed_count++;
               analistasStats[userId].tma_minutes += diffMinutes;
             }
           }
        } else {
           const userId = ticket.userId || ticket.ownerId;
           if (userId && analistasStats[userId]) {
             analistasStats[userId].total++;
           }
        }
      });
      console.log(`[Digisac] Processed ${totalTickets} tickets. Tickets with valid TMA: ${ticketsWithTmaCount}.`);

      const tmaGeral = ticketsWithTmaCount > 0 ? (totalTmaMinutes / ticketsWithTmaCount) : 0;

      if (action === 'geral') {
        return jsonResponse({
          total_chamados: totalTickets,
          tma_geral_minutos: tmaGeral,
          total: totalTickets,
          analistas: Object.values(analistasStats),
        });
      }

      if (action === 'analistas') {
        const result = Object.values(analistasStats).map(stat => ({
          analyst_id: stat.id,
          name: stat.name,
          total_chamados: stat.total,
          tma_minutos: stat.closed_count > 0 ? (stat.tma_minutes / stat.closed_count) : 0
        }));

        return jsonResponse(result);
      }
    }

    if (action === 'listar_digisac_users') {
      const cacheKey = 'digisac_users';
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
        console.log('[Digisac] Serving users from cache');
        return jsonResponse(cache[cacheKey].data);
      }

      const usersRes = await fetchDigisac(digisacUrl, digisacToken, '/users');
      if (!usersRes.ok) {
        return handledErrorResponse(action, `Erro API Digisac: ${usersRes.status}`, {
          code: 'DIGISAC_API_ERROR',
          digisac_status: usersRes.status,
        });
      }

      const users = extractDigisacArray(usersRes.data);
      cache[cacheKey] = {
        data: users,
        timestamp: Date.now(),
      };

      return jsonResponse(users);
    }

    return handledErrorResponse(action, 'Ação inválida.', { code: 'INVALID_ACTION' });

  } catch (error: any) {
    console.error('[Edge Function Error] Processing request failed:', error.message || error);
    return handledErrorResponse(action, error.message || 'Internal Edge Function Error', { code: 'UNEXPECTED_ERROR' });
  }
});
