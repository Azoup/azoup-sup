import { supabase } from "@/integrations/supabase/client";

export interface DigisacGeralResponse {
  total_chamados: number;
  tma_geral_minutos: number;
}

export interface DigisacAnalystStats {
  analyst_id: string;
  name: string;
  total_chamados: number;
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
    return invokeDigisac<DigisacGeralResponse>('geral', { startDate, endDate });
  },

  async getDashboardAnalistas(startDate?: string, endDate?: string): Promise<DigisacAnalystStats[]> {
    return invokeDigisac<DigisacAnalystStats[]>('analistas', { startDate, endDate });
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
