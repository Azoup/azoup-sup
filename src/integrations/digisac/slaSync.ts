import { supabase } from '@/integrations/supabase/client';
import type { DigisacSlaMonitorSummary } from '@/integrations/digisac/slaTypes';
import { formatSlaDuration } from '@/integrations/digisac/slaNormalize';

async function invokeWithToken(
  functionName: string,
  body: Record<string, unknown>,
  token: string,
): Promise<DigisacSlaMonitorSummary> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    method: 'POST',
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw new Error(error.message || 'Falha ao sincronizar alertas SLA');
  if (!data || typeof data !== 'object') throw new Error('Resposta inválida da sincronização SLA');

  const row = data as DigisacSlaMonitorSummary & { error?: string; message?: string };
  if (row.error && !row.ok) {
    throw new Error(row.message || String(row.error));
  }
  return row;
}

export async function syncDigisacSlaAlerts(
  departmentId?: string,
): Promise<DigisacSlaMonitorSummary> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Faça login para sincronizar alertas SLA.');

  const payload = departmentId && departmentId !== 'all' ? { departmentId } : {};

  try {
    return await invokeWithToken('digisac-sla-cron', payload, token);
  } catch (cronErr) {
    try {
      const { data, error } = await supabase.functions.invoke('digisac-dashboard', {
        method: 'POST',
        body: { action: 'sla_sync', payload },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      const row = data as DigisacSlaMonitorSummary & { error?: string; message?: string };
      if (row?.error && !row.ok) throw new Error(row.message || String(row.error));
      return row;
    } catch {
      throw cronErr instanceof Error ? cronErr : new Error(String(cronErr));
    }
  }
}

export function describeSlaSyncResult(result: DigisacSlaMonitorSummary): string {
  const parts = [
    `${result.openTotal ?? 0} aberto(s) agora`,
    `${result.over40 ?? result.scanned ?? 0} com +40 min`,
    `${result.over45 ?? 0} com +45 min`,
  ];
  if (result.tracked) parts.push(`${result.tracked} rastreado(s)`);
  if (result.notified) parts.push(`${result.notified} notificação(ões) enviada(s)`);
  if (result.resolved) parts.push(`${result.resolved} resolvido(s)`);
  return parts.join(' · ');
}

export function slaSyncPreviewLines(result: DigisacSlaMonitorSummary): string[] {
  if (!result.preview?.length) return [];
  return result.preview.map(
    (p) => `${p.protocol} — ${p.analystName} — ${formatSlaDuration(p.durationMinutes)}`,
  );
}
