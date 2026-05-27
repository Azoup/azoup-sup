const TICKET_PAD = 4;

/** Formata o número do ticket para exibição (ex.: 0001). */
export function formatDevTicketNumber(ticketNumber: number | null | undefined): string {
  if (ticketNumber == null || !Number.isFinite(ticketNumber)) return '';
  return String(Math.trunc(ticketNumber)).padStart(TICKET_PAD, '0');
}

/** Rótulo curto para título/mensagens (ex.: 0042 "Título"). */
export function devTicketLabel(ticketNumber: number | null | undefined, title: string): string {
  const formatted = formatDevTicketNumber(ticketNumber);
  if (!formatted) return `"${title}"`;
  return `${formatted} "${title}"`;
}

/** Busca contém apenas dígitos (com # opcional no início). */
export function isDevTicketNumberQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length > 0 && /^#?\d+$/.test(trimmed);
}

/** Dígitos digitados pelo usuário (sem #). */
export function devTicketSearchDigits(query: string): string {
  return query.trim().replace(/^#/, '');
}

/**
 * Corresponde ao prefixo exato do número exibido (0002 → só ticket 0002, não 20/200).
 * Aceita 2, 02, 002 ou 0002 para o mesmo ticket.
 */
export function devTicketMatchesSearch(
  ticketNumber: number | null | undefined,
  query: string,
): boolean {
  if (ticketNumber == null || !isDevTicketNumberQuery(query)) return false;

  const digits = devTicketSearchDigits(query);
  const formatted = formatDevTicketNumber(ticketNumber);

  return formatted.startsWith(digits);
}
