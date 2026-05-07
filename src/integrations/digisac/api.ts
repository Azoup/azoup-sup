import { supabase } from "@/integrations/supabase/client";

export interface DigisacGeralResponse {
  total_chamados: number;
  total_fechados: number;
  total_abertos: number;
  total_mensagens: number;
  total_contatos: number;
  tma_geral_minutos: number;
  tempo_espera_minutos: number;
  primeira_resposta_minutos: number;
}

export interface DigisacAnalystStats {
  analyst_id: string;
  name: string;
  mapped?: boolean;
  total_chamados: number;
  chamados_fechados: number;
  chamados_abertos: number;
  total_contatos?: number;
  total_mensagens?: number;
  tma_minutos: number;
}

export interface DigisacDepartment {
  id: string;
  name: string;
}

export interface DigisacUser {
  id: string;
  name: string;
  email?: string;
}

interface DigisacErrorPayload {
  error?: boolean | string;
  message?: string;
  total?: number;
  analistas?: unknown[];
  total_chamados?: number;
  tma_geral_minutos?: number;
  users?: unknown[];
}

function isDigisacErrorPayload(value: unknown): value is DigisacErrorPayload {
  return !!value && typeof value === 'object' && ('error' in (value as Record<string, unknown>) || 'message' in (value as Record<string, unknown>));
}

function asNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.'));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function minutesFromSeconds(value: number) {
  return value > 0 ? value / 60 : 0;
}

const INVALID_DIGISAC_USER_NAMES = new Set([
  'sem atendente',
  'mandeumzap dev',
  'mande um zap dev',
  'azoup tecnologia ltda',
  'azoup digisac',
]);

function normalizeComparableName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function isInvalidDigisacUserName(value?: string) {
  const normalized = normalizeComparableName(value || '');
  if (!normalized) return true;
  return INVALID_DIGISAC_USER_NAMES.has(normalized);
}

function pickByKeys(source: Record<string, any> | undefined, keys: string[]) {
  if (!source) return 0;
  for (const key of keys) {
    if (key in source) return asNumber(source[key]);
  }
  return 0;
}

function firstArray(payload: any, keys: string[]) {
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      if (Array.isArray(value.data)) return value.data;
      if (Array.isArray(value.items)) return value.items;
      if (Array.isArray(value.rows)) return value.rows;
    }
  }
  return [];
}

function normalizeGeralResponse(payload: any): DigisacGeralResponse {
  const totals = payload?.totals ?? payload?.data?.totals ?? payload?.data ?? payload ?? {};
  return {
    total_chamados: pickByKeys(totals, ['totalTicketsCount', 'totalTickets', 'total_chamados', 'ticketsTotal', 'total', 'attendanceCount']),
    total_fechados: pickByKeys(totals, ['closedTicketsCount', 'closedTickets', 'total_fechados', 'finishedTickets', 'closed']),
    total_abertos: pickByKeys(totals, ['openedTicketsCount', 'openTickets', 'total_abertos', 'openedTickets', 'open']),
    total_mensagens: pickByKeys(totals, ['totalMessagesCount', 'totalMessages', 'total_mensagens', 'messagesTotal', 'messages']),
    total_contatos: pickByKeys(totals, ['contactsCount', 'totalContacts', 'total_contatos', 'contactsTotal', 'contacts']),
    tma_geral_minutos: minutesFromSeconds(pickByKeys(totals, ['ticketTime', 'avgTicketTime', 'averageTicketTime', 'tma'])),
    tempo_espera_minutos: minutesFromSeconds(pickByKeys(totals, ['waitingTimeAvg', 'waitingTime', 'avgWaitingTime', 'averageWaitingTime'])),
    primeira_resposta_minutos: minutesFromSeconds(pickByKeys(totals, ['firstWaitingTime', 'avgFirstWaitingTime', 'averageFirstWaitingTime', 'firstResponseTime', 'waitingTimeAfterBot'])),
  };
}

function normalizeAnalistasResponse(payload: any): DigisacAnalystStats[] {
  const items = Array.isArray(payload) ? payload : firstArray(payload, ['items', 'data', 'rows', 'users']);

  return items
    .filter((item: any) => !isInvalidDigisacUserName(item?.userName ?? item?.name ?? item?.user?.name))
    .map((item: any) => {
    const closed = asNumber(item.closedTicketsCount, item.closedTickets, item.closed);
    const opened = asNumber(item.openedTicketsCount, item.openTickets, item.opened);
    const ticketTimeSeconds = asNumber(item.ticketTime, item.totalTicketTime, item.ticketsTime);
    const sent = asNumber(item.sentMessagesCount, item.sentMessages);
    const received = asNumber(item.receivedMessagesCount, item.receivedMessages);

    return {
      analyst_id: String(item.userId ?? item.id ?? item.user?.id ?? item.name ?? ''),
      name: item.userName ?? item.name ?? item.user?.name ?? 'Sem nome',
      mapped: true,
      total_chamados: asNumber(item.totalTicketsCount, item.totalTickets, closed + opened),
      chamados_fechados: closed,
      chamados_abertos: opened,
      total_contatos: asNumber(item.contactsCount, item.totalContacts),
      total_mensagens: sent + received,
      tma_minutos: minutesFromSeconds(ticketTimeSeconds),
    };
  });
}

function normalizeDateOnly(date: string | undefined): string | undefined {
  if (!date) return undefined;

  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (isoDateOnly.test(date)) return date;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper que invoca a edge function `digisac-dashboard`.
 * IMPORTANTE: chamamos via edge function (não direto na API Digisac)
 * porque o servidor Digisac só libera CORS para o domínio publicado,
 * bloqueando todas as chamadas no preview do Lovable.
 */
async function invokeDigisac<T>(action: string, payload: Record<string, any> = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error('Faça login para visualizar os dados da integração Digisac.');
  }

  const { data, error } = await supabase.functions.invoke('digisac-dashboard', {
    body: { action, payload },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    console.error(`[digisacApi] Erro ao invocar action="${action}"`, error);
    throw new Error(error.message || 'Erro ao chamar Digisac');
  }

  if (isDigisacErrorPayload(data) && data.error) {
    const message = data.message || (typeof data.error === 'string' ? data.error : 'Erro ao chamar Digisac');
    console.error(`[digisacApi] Resposta tratada com erro action="${action}"`, data);
    throw new Error(message);
  }

  return data as T;
}

export const digisacApi = {
  async getDashboardGeral(startDate?: string, endDate?: string, departmentId?: string, userId?: string): Promise<DigisacGeralResponse> {
    const data = await invokeDigisac<any>('geral', {
      startDate: normalizeDateOnly(startDate),
      endDate: normalizeDateOnly(endDate),
      departmentId: departmentId || 'all',
      userId: userId || 'all',
    });
    return normalizeGeralResponse(data);
  },

  async getDashboardAnalistas(startDate?: string, endDate?: string, departmentId?: string, userId?: string): Promise<DigisacAnalystStats[]> {
    const data = await invokeDigisac<any>('analistas', {
      startDate: normalizeDateOnly(startDate),
      endDate: normalizeDateOnly(endDate),
      departmentId: departmentId || 'all',
      userId: userId || 'all',
    });
    return normalizeAnalistasResponse(data);
  },

  async getDepartments(): Promise<DigisacDepartment[]> {
    return invokeDigisac<DigisacDepartment[]>('listar_departments');
  },

  async getAnalysts(): Promise<DigisacUser[]> {
    return invokeDigisac<DigisacUser[]>('listar_analysts');
  },

  async getDigisacUsers(): Promise<DigisacUser[]> {
    return invokeDigisac<DigisacUser[]>('listar_digisac_users');
  },

  async testConnection(): Promise<{ ok: boolean; digisac_status: number | null; sample: DigisacUser | null }> {
    return invokeDigisac<{ ok: boolean; digisac_status: number | null; sample: DigisacUser | null }>('test_digisac');
  },

  async getMappings() {
    const { data, error } = await supabase
      .from('digisac_analyst_mapping')
      .select('id, digisac_user_id, digisac_user_name, analyst_id');
    if (error) throw error;
    return data;
  },

  async saveMapping(digisacUserId: string, digisacUserName: string, analystId: string) {
    const { data, error } = await supabase
      .from('digisac_analyst_mapping')
      .upsert({
        digisac_user_id: digisacUserId,
        digisac_user_name: digisacUserName,
        analyst_id: analystId
      }, { onConflict: 'digisac_user_id' })
      .select();
    if (error) throw error;
    return data;
  },

  async deleteMapping(id: string) {
    const { error } = await supabase
      .from('digisac_analyst_mapping')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }
};
