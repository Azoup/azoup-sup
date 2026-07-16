import type { DigisacSlaAlert, DigisacSlaNotification } from './slaTypes';

export function formatSlaDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

export function formatSlaStartedAt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function slaClientName(n: Pick<DigisacSlaNotification, 'client_name'>): string {
  return n.client_name?.trim() || 'Não informado';
}

export function slaClientContact(n: Pick<DigisacSlaNotification, 'client_contact'>): string {
  return n.client_contact?.trim() || 'Não informado';
}

export function slaNotificationTitle(n: DigisacSlaNotification): string {
  return `SLA Digisac — ${n.protocol}`;
}

export function slaNotificationDetail(n: DigisacSlaNotification): string {
  const analyst = n.analyst_name || 'Sem atendente';
  const duration = formatSlaDuration(n.duration_minutes);
  const started = formatSlaStartedAt(n.started_at);
  const client = slaClientName(n);
  const contact = slaClientContact(n);
  return `Cliente: ${client} · Contato: ${contact} · Analista: ${analyst} · Tempo: ${duration} · Início: ${started}`;
}

export function slaNotificationDesktopBody(n: DigisacSlaNotification): string {
  const lines = [
    `Protocolo: ${n.protocol}`,
    `Cliente: ${slaClientName(n)}`,
    `Contato: ${slaClientContact(n)}`,
    `Analista: ${n.analyst_name || 'Sem atendente'}`,
    `Início: ${formatSlaStartedAt(n.started_at)}`,
    `Tempo de atendimento: ${formatSlaDuration(n.duration_minutes)}`,
  ];
  return lines.join('\n');
}

export type SlaNotificationField = { label: string; value: string };

export function slaNotificationFields(n: DigisacSlaNotification): SlaNotificationField[] {
  return [
    { label: 'Protocolo', value: n.protocol },
    { label: 'Cliente', value: slaClientName(n) },
    { label: 'Contato', value: slaClientContact(n) },
    { label: 'Analista', value: n.analyst_name || 'Sem atendente' },
    { label: 'Início do atendimento', value: formatSlaStartedAt(n.started_at) },
    { label: 'Tempo de atendimento', value: formatSlaDuration(n.duration_minutes) },
  ];
}

/** Converte alerta do histórico no formato do modal de notificação SLA. */
export function slaAlertToNotification(alert: DigisacSlaAlert): DigisacSlaNotification {
  return {
    id: alert.id,
    recipient_id: '',
    alert_id: alert.id,
    protocol: alert.protocol,
    analyst_name: alert.analyst_name,
    client_name: alert.client_name,
    client_contact: alert.client_contact,
    duration_minutes: alert.duration_minutes,
    started_at: alert.started_at,
    message: `Atendimento aberto há mais de 40 minutos no Digisac.`,
    read: true,
    created_at: alert.created_at,
  };
}
