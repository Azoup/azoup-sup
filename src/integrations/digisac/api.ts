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
  tma_minutos: number;
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

function toUtcBoundary(date: string | undefined, boundary: 'start' | 'end'): string | undefined {
  if (!date) return undefined;

  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (isoDateOnly.test(date)) {
    return boundary === 'start'
      ? `${date}T00:00:00Z`
      : `${date}T23:59:59Z`;
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().replace('.000Z', 'Z');
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
  async getDashboardGeral(startDate?: string, endDate?: string): Promise<DigisacGeralResponse> {
    return invokeDigisac<DigisacGeralResponse>('geral', {
      startDate: toUtcBoundary(startDate, 'start'),
      endDate: toUtcBoundary(endDate, 'end'),
    });
  },

  async getDashboardAnalistas(startDate?: string, endDate?: string): Promise<DigisacAnalystStats[]> {
    return invokeDigisac<DigisacAnalystStats[]>('analistas', {
      startDate: toUtcBoundary(startDate, 'start'),
      endDate: toUtcBoundary(endDate, 'end'),
    });
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
