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
  // Outros campos podem vir da API do Digisac, mas precisamos ao menos do id e nome
}

export const digisacApi = {
  /**
   * Obtém métricas gerais do Dashboard
   */
  async getDashboardGeral(): Promise<DigisacGeralResponse> {
    const { data, error } = await supabase.functions.invoke('digisac-dashboard', {
      body: { action: 'geral' }
    });

    if (error) throw error;
    return data as DigisacGeralResponse;
  },

  /**
   * Obtém métricas agrupadas por analistas do sistema interno (já mapeados)
   */
  async getDashboardAnalistas(): Promise<DigisacAnalystStats[]> {
    const { data, error } = await supabase.functions.invoke('digisac-dashboard', {
      body: { action: 'analistas' }
    });

    if (error) throw error;
    return data as DigisacAnalystStats[];
  },

  /**
   * Lista todos os usuários cadastrados na plataforma Digisac
   */
  async getDigisacUsers(): Promise<DigisacUser[]> {
    const { data, error } = await supabase.functions.invoke('digisac-dashboard', {
      body: { action: 'listar_digisac_users' }
    });

    if (error) throw error;
    return data as DigisacUser[];
  },

  /**
   * Obtém os mapeamentos existentes no banco de dados do Supabase
   */
  async getMappings() {
    const { data, error } = await supabase
      .from('digisac_analyst_mapping')
      .select('id, digisac_user_id, digisac_user_name, analyst_id');
      
    if (error) throw error;
    return data;
  },

  /**
   * Salva ou atualiza um mapeamento entre um usuário Digisac e um Analista interno
   */
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

  /**
   * Remove um mapeamento existente
   */
  async deleteMapping(id: string) {
    const { error } = await supabase
      .from('digisac_analyst_mapping')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};
