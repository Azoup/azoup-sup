import type { DigisacSlaNotification } from './slaTypes';

export function formatSlaDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

export function formatSlaStartedAt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function slaNotificationTitle(n: DigisacSlaNotification): string {
  return `SLA Digisac — ${n.protocol}`;
}

export function slaNotificationDetail(n: DigisacSlaNotification): string {
  const analyst = n.analyst_name || 'Sem atendente';
  const duration = formatSlaDuration(n.duration_minutes);
  const started = formatSlaStartedAt(n.started_at);
  return `Analista: ${analyst} · Tempo: ${duration} · Início: ${started}`;
}
