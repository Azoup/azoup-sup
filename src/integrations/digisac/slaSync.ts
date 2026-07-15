import { supabase } from '@/integrations/supabase/client';
import type { DigisacSlaMonitorSummary } from '@/integrations/digisac/slaTypes';
import { formatSlaDuration } from '@/integrations/digisac/slaNormalize';

/**
 * Sincroniza alertas SLA via edge function `digisac-dashboard` (action sla_sync).
 * Não usa função separada — evita limite de serverless na Vercel/Supabase.
 */
export async function syncDigisacSlaAlerts(
  departmentId?: string,
): Promise<DigisacSlaMonitorSummary> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Faça login para sincronizar alertas SLA.');

  const payload = departmentId && departmentId !== 'all' ? { departmentId } : {};

  const { data, error } = await supabase.functions.invoke('digisac-dashboard', {
    method: 'POST',
    body: { action: 'sla_sync', payload },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw new Error(error.message || 'Falha ao sincronizar alertas SLA');
  if (!data || typeof data !== 'object') throw new Error('Resposta inválida da sincronização SLA');

  const row = data as DigisacSlaMonitorSummary & { error?: string | boolean; message?: string };
  if (row.error && !row.ok) {
    throw new Error(row.message || String(row.error));
  }
  return row;
}

export function describeSlaSyncResult(result: DigisacSlaMonitorSummary): string {
  const over40 = result.over40 ?? result.over45 ?? result.scanned ?? 0;
  const parts = [
    `${result.openTotal ?? 0} aberto(s) agora`,
    `${over40} com +40 min (notifica)`,
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
