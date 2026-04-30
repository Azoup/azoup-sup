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
   * Função auxiliar para realizar o fetch direto no Digisac via Frontend
   */
  async fetchDirect(endpoint: string) {
    const url = import.meta.env.VITE_DIGISAC_API_URL;
    const token = import.meta.env.VITE_DIGISAC_API_TOKEN;

    if (!url || !token) {
      throw new Error("Credenciais do Digisac não configuradas no .env (VITE_DIGISAC_API_URL e VITE_DIGISAC_API_TOKEN).");
    }

    const response = await fetch(`${url}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro API Digisac: ${response.status} - ${errorText}`);
    }

    return response.json();
  },

  /**
   * Obtém os tickets do Digisac, com os devidos filtros
   */
  async getTickets(startDate?: string, endDate?: string) {
    let endpoint = '/tickets?where[isOpen]=false';
    if (startDate) {
      endpoint += `&where[closedAt][gte]=${startDate}T00:00:00.000Z`;
    }
    if (endDate) {
      endpoint += `&where[closedAt][lte]=${endDate}T23:59:59.999Z`;
    }
    return this.fetchDirect(endpoint);
  },

  /**
   * Obtém métricas gerais do Dashboard
   */
  async getDashboardGeral(startDate?: string, endDate?: string): Promise<DigisacGeralResponse> {
    const res = await this.getTickets(startDate, endDate);
    const tickets = res.data || [];

    let totalTickets = 0;
    let totalTmaMinutes = 0;
    let ticketsWithTmaCount = 0;

    tickets.forEach((ticket: any) => {
      totalTickets++;
      if (ticket.createdAt && ticket.closedAt) {
        const opened = new Date(ticket.createdAt).getTime();
        const closed = new Date(ticket.closedAt).getTime();
        const diffMinutes = (closed - opened) / 60000;
        
        if (diffMinutes > 0) {
          totalTmaMinutes += diffMinutes;
          ticketsWithTmaCount++;
        }
      }
    });

    const tmaGeral = ticketsWithTmaCount > 0 ? (totalTmaMinutes / ticketsWithTmaCount) : 0;

    return {
      total_chamados: totalTickets,
      tma_geral_minutos: tmaGeral
    };
  },

  /**
   * Obtém métricas agrupadas por analistas do sistema interno (já mapeados)
   */
  async getDashboardAnalistas(startDate?: string, endDate?: string): Promise<DigisacAnalystStats[]> {
    const [ticketsRes, mappings] = await Promise.all([
      this.getTickets(startDate, endDate),
      this.getMappings()
    ]);

    const tickets = ticketsRes.data || [];
    const analistasStats: Record<string, { id: string, name: string, total: number, tma_minutes: number, closed_count: number }> = {};

    mappings?.forEach((m: any) => {
       analistasStats[m.digisac_user_id] = {
         id: m.analyst_id,
         name: m.analysts?.name || 'Analista',
         total: 0,
         tma_minutes: 0,
         closed_count: 0
       };
    });

    tickets.forEach((ticket: any) => {
      const userId = ticket.userId || ticket.ownerId;
      if (userId && analistasStats[userId]) {
        analistasStats[userId].total++;

        if (ticket.createdAt && ticket.closedAt) {
          const opened = new Date(ticket.createdAt).getTime();
          const closed = new Date(ticket.closedAt).getTime();
          const diffMinutes = (closed - opened) / 60000;
          
          if (diffMinutes > 0) {
            analistasStats[userId].closed_count++;
            analistasStats[userId].tma_minutes += diffMinutes;
          }
        }
      }
    });

    return Object.values(analistasStats).map(stat => ({
      analyst_id: stat.id,
      name: stat.name,
      total_chamados: stat.total,
      tma_minutos: stat.closed_count > 0 ? (stat.tma_minutes / stat.closed_count) : 0
    }));
  },

  /**
   * Lista todos os usuários cadastrados na plataforma Digisac
   */
  async getDigisacUsers(): Promise<DigisacUser[]> {
    const res = await this.fetchDirect('/users');
    return res.data || [];
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
