import { supabase } from "@/integrations/supabase/client";
import {
  normalizeAnalistasResponse,
  normalizeGeralResponse,
  type DigisacAnalystStats,
  type DigisacGeralResponse,
} from "@/integrations/digisac/dashboardNormalize";
import {
  mergeDigisacDashboardFilters,
  type DigisacDashboardQueryFilters,
} from "@/integrations/digisac/dashboardFilters";
import { filterDigisacAnalystStatsForDepartment } from "@/lib/digisacDepartmentAnalystScope";
import {
  mergeDigisacNpsFilters,
  type DigisacNpsQueryFilters,
} from "@/integrations/digisac/npsFilters";
import {
  normalizeNpsDashboardResponse,
  type DigisacNpsDashboardResponse,
} from "@/integrations/digisac/npsNormalize";

export type { DigisacDashboardQueryFilters };
export {
  DIGISAC_DASHBOARD_FILTER_DEFAULTS,
  mergeDigisacDashboardFilters,
} from "@/integrations/digisac/dashboardFilters";

export type { DigisacAnalystStats, DigisacGeralResponse };
export type { DigisacNpsQueryFilters, DigisacNpsDashboardResponse };
export { mergeDigisacNpsFilters } from "@/integrations/digisac/npsFilters";

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
 * bloqueando chamadas diretas do browser em previews e ambientes não listados.
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

function buildNpsPayload(filters: DigisacNpsQueryFilters) {
  const merged = mergeDigisacNpsFilters(filters);
  return {
    startDate: normalizeDateOnly(merged.startDate),
    endDate: normalizeDateOnly(merged.endDate),
    startTime: merged.startTime?.trim() || undefined,
    endTime: merged.endTime?.trim() || undefined,
    departmentId: merged.departmentId,
    departmentName: merged.departmentName?.trim() || undefined,
    userId: merged.userId,
    evaluationType: merged.evaluationType,
    periodType: merged.periodType,
    ...(merged.serviceId ? { serviceId: merged.serviceId } : {}),
  };
}

function buildDashboardPayload(filters: DigisacDashboardQueryFilters) {
  const merged = mergeDigisacDashboardFilters(filters);
  return {
    startDate: normalizeDateOnly(merged.startDate),
    endDate: normalizeDateOnly(merged.endDate),
    startTime: merged.startTime?.trim() || undefined,
    endTime: merged.endTime?.trim() || undefined,
    departmentId: merged.departmentId,
    departmentName: merged.departmentName?.trim() || undefined,
    userId: merged.userId,
    periodType: merged.periodType,
    departmentParticipation: merged.departmentParticipation,
    userParticipation: merged.userParticipation,
    status: merged.status,
    grouping: merged.grouping,
    ...(merged.serviceId ? { serviceId: merged.serviceId } : {}),
  };
}

export const digisacApi = {
  async getDashboardGeral(filters: DigisacDashboardQueryFilters = {}): Promise<DigisacGeralResponse> {
    const data = await invokeDigisac<unknown>('geral', buildDashboardPayload(filters));
    return normalizeGeralResponse(data);
  },

  async getNpsDashboard(filters: DigisacNpsQueryFilters = {}): Promise<DigisacNpsDashboardResponse> {
    const data = await invokeDigisac<unknown>('nps_dashboard', buildNpsPayload(filters));
    return normalizeNpsDashboardResponse(data);
  },

  async getDashboardAnalistas(filters: DigisacDashboardQueryFilters = {}): Promise<DigisacAnalystStats[]> {
    const merged = mergeDigisacDashboardFilters(filters);
    const data = await invokeDigisac<unknown>('analistas', buildDashboardPayload(filters));
    const rows = normalizeAnalistasResponse(data);
    return filterDigisacAnalystStatsForDepartment(merged.departmentName, rows);
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
