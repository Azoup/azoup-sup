const TICKET_PAD = 4;

/** Formata o número do ticket para exibição (ex.: #0001). */
export function formatDevTicketNumber(ticketNumber: number | null | undefined): string {
  if (ticketNumber == null || !Number.isFinite(ticketNumber)) return '';
  return `#${String(Math.trunc(ticketNumber)).padStart(TICKET_PAD, '0')}`;
}

/** Rótulo curto para título/mensagens (ex.: #42 ou #0042). */
export function devTicketLabel(ticketNumber: number | null | undefined, title: string): string {
  const formatted = formatDevTicketNumber(ticketNumber);
  if (!formatted) return `"${title}"`;
  return `${formatted} "${title}"`;
}

/** Verifica se a busca corresponde ao número do ticket (#42, 42, 0042). */
export function devTicketMatchesSearch(
  ticketNumber: number | null | undefined,
  query: string,
): boolean {
  if (ticketNumber == null || !query.trim()) return false;
  const q = query.trim().toLowerCase();
  const formatted = formatDevTicketNumber(ticketNumber).toLowerCase();
  if (formatted.includes(q)) return true;

  const digits = q.replace(/^#/, '').replace(/\D/g, '');
  if (!digits) return false;

  const normalized = String(Math.trunc(ticketNumber));
  const normalizedQuery = digits.replace(/^0+/, '') || '0';
  return normalized === normalizedQuery || normalized.startsWith(normalizedQuery);
}
