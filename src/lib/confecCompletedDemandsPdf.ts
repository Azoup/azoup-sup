import { jsPDF } from 'jspdf';
import { formatDevTicketNumber } from '@/lib/confecKanbanTicketNumber';

export type ConfecCompletedDemandCard = {
  id?: string;
  ticket_number?: number | null;
  title?: string | null;
  dev_notes?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  status?: string | null;
};

/** Linha do PDF: TICKET 0001 - TÍTULO - OBS: ... */
export function formatConfecCompletedDemandLine(card: ConfecCompletedDemandCard): string {
  const ticket = formatDevTicketNumber(card.ticket_number);
  const ticketPart = ticket ? `TICKET ${ticket}` : 'TICKET —';
  const title = (card.title || '').trim() || 'SEM TÍTULO';
  const obs = (card.dev_notes || '').trim() || '—';
  return `${ticketPart} - ${title} - OBS: ${obs}`;
}

function cardCompletionDate(card: ConfecCompletedDemandCard): Date | null {
  const raw = card.completed_at || card.updated_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data local yyyy-MM-dd a partir de um Date. */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function filterConfecCompletedCardsByPeriod(
  cards: ConfecCompletedDemandCard[],
  completionSlug: string | null,
  dateFrom: string,
  dateTo: string,
): ConfecCompletedDemandCard[] {
  if (!completionSlug) return [];
  const from = dateFrom.trim();
  const to = dateTo.trim();
  if (!from || !to) return [];

  return cards
    .filter((card) => card.status === completionSlug)
    .filter((card) => {
      const completed = cardCompletionDate(card);
      if (!completed) return false;
      const key = toLocalDateKey(completed);
      return key >= from && key <= to;
    })
    .sort((a, b) => {
      const ta = a.ticket_number ?? Number.MAX_SAFE_INTEGER;
      const tb = b.ticket_number ?? Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return (a.title || '').localeCompare(b.title || '', 'pt-BR');
    });
}

export function downloadConfecCompletedDemandsPdf(params: {
  cards: ConfecCompletedDemandCard[];
  dateFrom: string;
  dateTo: string;
}): void {
  const { cards, dateFrom, dateTo } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 14;
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Demandas concluídas — Kanban Confec', marginX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Período: ${dateFrom} a ${dateTo}`, marginX, y);
  y += 6;
  doc.text(`Total: ${cards.length} demanda(s)`, marginX, y);
  y += 10;

  doc.setFontSize(10);
  for (const card of cards) {
    const line = formatConfecCompletedDemandLine(card);
    const wrapped = doc.splitTextToSize(line, maxWidth) as string[];
    const blockHeight = wrapped.length * 5 + 3;
    if (y + blockHeight > pageHeight - 14) {
      doc.addPage();
      y = 18;
    }
    doc.text(wrapped, marginX, y);
    y += blockHeight;
  }

  if (cards.length === 0) {
    doc.text('Nenhuma demanda concluída no período selecionado.', marginX, y);
  }

  doc.save(`kanban-confec-concluidos_${dateFrom}_${dateTo}.pdf`);
}
