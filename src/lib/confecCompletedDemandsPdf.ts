import { jsPDF } from 'jspdf';
import { formatDevTicketNumber } from '@/lib/confecKanbanTicketNumber';
import { normalizeProfilePhotoUrl } from '@/lib/profilePhotoUrl';
import azoupLogoPng from '@/assets/azoup-logo.png?inline';

export type ConfecPdfPerson = {
  name?: string | null;
  photo_url?: string | null;
  photoDataUrl?: string | null;
};

export type ConfecCompletedDemandCard = {
  id?: string;
  ticket_number?: number | null;
  title?: string | null;
  dev_notes?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  released_at?: string | null;
  status?: string | null;
  analyst_id?: string | null;
  developer_id?: string | null;
  analyst?: ConfecPdfPerson | null;
  developer?: ConfecPdfPerson | null;
};

export type KanbanDemandsPdfBrand = {
  boardName: string;
  boardNameLine2: string;
  titleAccent: string;
  emptyMessage: string;
  filenamePrefix: string;
};

export const CONFEC_COMPLETED_PDF_BRAND: KanbanDemandsPdfBrand = {
  boardName: 'Kanban Confec',
  boardNameLine2: 'Confec',
  titleAccent: 'concluídas',
  emptyMessage: 'Nenhuma demanda concluída no período selecionado.',
  filenamePrefix: 'kanban-confec-concluidos',
};

export const DEV_RELEASE_PDF_BRAND: KanbanDemandsPdfBrand = {
  boardName: 'Kanban DEV',
  boardNameLine2: 'DEV',
  titleAccent: 'para atualizar',
  emptyMessage: 'Nenhuma demanda para atualizar no período selecionado.',
  filenamePrefix: 'kanban-dev-para-atualizar',
};

export type ConfecDemandIcon =
  | 'pdf'
  | 'calendar'
  | 'money'
  | 'clipboard'
  | 'gear'
  | 'lightbulb'
  | 'wrench';

type Rgb = [number, number, number];

const COLOR = {
  primary: [242, 92, 27] as Rgb,
  peach: [255, 243, 232] as Rgb,
  peachDeep: [255, 236, 219] as Rgb,
  cream: [252, 250, 247] as Rgb,
  white: [255, 255, 255] as Rgb,
  ink: [32, 28, 26] as Rgb,
  muted: [132, 122, 114] as Rgb,
  line: [236, 226, 216] as Rgb,
};

const MARGIN_X = 14;
const HEADER_H = 22;
const CORNER = 26;
const FOOTER_RESERVE = 24;
const CARD_GAP = 2.8;
const CARD_PAD_X = 4.2;
const CARD_PAD_Y = 3.2;
const ICON_BOX = 9;
const NUMBER_H = 3.5;
const NUMBER_GAP = 1.2;
const AVATAR_SIZE = 5.6;
const PERSON_CHIP_H = 7.6;
const PERSON_GAP = 1.8;
const PEOPLE_COL_W = 36;
const PEOPLE_STACK_H = PERSON_CHIP_H * 2 + PERSON_GAP;

/** Linha do PDF: TICKET 0001 - TÍTULO - OBS: ... */
export function formatConfecCompletedDemandLine(card: ConfecCompletedDemandCard): string {
  const ticket = formatDevTicketNumber(card.ticket_number);
  const ticketPart = ticket ? `TICKET ${ticket}` : 'TICKET —';
  const title = confecDemandDisplayTitle(card.title);
  const obs = (card.dev_notes || '').trim() || '—';
  return `${ticketPart} - ${title} - OBS: ${obs}`;
}

export function confecDemandDisplayTitle(title: string | null | undefined): string {
  return (title || '').trim() || 'SEM TÍTULO';
}

export function personDisplayName(person: ConfecPdfPerson | null | undefined): string {
  return (person?.name || '').trim() || '—';
}

export function personInitial(person: ConfecPdfPerson | null | undefined): string {
  const name = (person?.name || '').trim();
  return name ? name.charAt(0).toUpperCase() : '?';
}

export function splitConfecDemandTitle(title: string | null | undefined): {
  heading: string;
  description: string;
} {
  const raw = (title || '').trim() || 'SEM TÍTULO';
  const emParts = raw.split(/\s+[—–]\s+/);
  if (emParts.length > 1) {
    return { heading: emParts[0].trim(), description: emParts.slice(1).join(' — ').trim() };
  }
  const hyphenParts = raw.split(/\s+-\s+/);
  if (hyphenParts.length > 1) {
    return {
      heading: hyphenParts[0].trim(),
      description: hyphenParts.slice(1).join(' - ').trim(),
    };
  }
  return { heading: raw, description: '' };
}

export function pickConfecDemandIcon(heading: string, description: string): ConfecDemandIcon {
  const headingText = heading.toLocaleUpperCase('pt-BR');
  const fullText = `${heading} ${description}`.toLocaleUpperCase('pt-BR');

  if (/\bPDF\b/.test(fullText)) return 'pdf';
  if (/PRAZO|OR[CÇ]AMENTO|CALEND[AÁ]RIO|ENTREGA/.test(fullText)) return 'calendar';
  if (/FINANCEIRO|CONTAS A PAGAR|A RECEBER/.test(fullText) && !/\bPEDIDO\b/.test(headingText)) {
    return 'money';
  }
  if (/\bPEDIDO\b/.test(headingText)) return 'clipboard';
  if (/PRODU[CÇ][AÃ]O/.test(fullText)) return 'gear';
  if (/SUGEST[AÃ]O/.test(headingText)) return 'lightbulb';
  if (/UNIFORMES|MANUTEN[CÇ][AÃ]O|AJUSTE/.test(fullText)) return 'wrench';
  if (/SUGEST[AÃ]O|MELHORIA/.test(fullText)) return 'lightbulb';
  return 'clipboard';
}

function cardPeriodDate(
  card: ConfecCompletedDemandCard,
  options?: { preferUpdatedAt?: boolean; preferReleasedAt?: boolean },
): Date | null {
  const raw = options?.preferReleasedAt
    ? card.released_at || card.updated_at || card.completed_at
    : options?.preferUpdatedAt
      ? card.updated_at || card.completed_at
      : card.completed_at || card.updated_at;
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
  options?: { preferUpdatedAt?: boolean; preferReleasedAt?: boolean },
): ConfecCompletedDemandCard[] {
  if (!completionSlug) return [];
  const from = dateFrom.trim();
  const to = dateTo.trim();
  if (!from || !to) return [];

  return cards
    .filter((card) => card.status === completionSlug)
    .filter((card) => {
      const completed = cardPeriodDate(card, options);
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

function setFill(doc: jsPDF, color: Rgb) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setStroke(doc: jsPDF, color: Rgb) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setText(doc: jsPDF, color: Rgb) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function wrapLines(doc: jsPDF, text: string, maxWidth: number, maxLines: number): string[] {
  const source = text.trim() || '';
  if (!source) return [];
  const lines = doc.splitTextToSize(source, maxWidth) as string[];
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  const last = clipped[maxLines - 1] ?? '';
  clipped[maxLines - 1] = `${last.replace(/[.…\s]+$/, '')}…`;
  return clipped;
}

function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (!text) return '—';
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let current = text;
  while (current.length > 1 && doc.getTextWidth(`${current}…`) > maxWidth) {
    current = current.slice(0, -1);
  }
  return `${current}…`;
}

function circlePhotoFromSource(source: CanvasImageSource, width: number, height: number, size: number): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const scale = Math.max(size / Math.max(width, 1), size / Math.max(height, 1));
  const drawW = width * scale;
  const drawH = height * scale;
  ctx.drawImage(source, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);
  return canvas.toDataURL('image/png');
}

async function loadCircularPhotoDataUrl(url: string): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image'));
      el.src = url;
    });
    return circlePhotoFromSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height, 96);
  } catch {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (typeof createImageBitmap !== 'function') return null;
      const bitmap = await createImageBitmap(blob);
      const dataUrl = circlePhotoFromSource(bitmap, bitmap.width, bitmap.height, 96);
      bitmap.close();
      return dataUrl;
    } catch {
      return null;
    }
  }
}

export async function attachConfecPdfPersonPhotos(
  cards: ConfecCompletedDemandCard[],
): Promise<ConfecCompletedDemandCard[]> {
  const urls = new Set<string>();
  for (const card of cards) {
    const analystUrl = normalizeProfilePhotoUrl(card.analyst?.photo_url);
    const developerUrl = normalizeProfilePhotoUrl(card.developer?.photo_url);
    if (analystUrl) urls.add(analystUrl);
    if (developerUrl) urls.add(developerUrl);
  }

  const dataUrls = new Map<string, string | null>();
  await Promise.all(
    [...urls].map(async (url) => {
      dataUrls.set(url, await loadCircularPhotoDataUrl(url));
    }),
  );

  const withPhoto = (person: ConfecPdfPerson | null | undefined): ConfecPdfPerson | null => {
    if (!person) return null;
    const url = normalizeProfilePhotoUrl(person.photo_url);
    return {
      ...person,
      photoDataUrl: (url ? dataUrls.get(url) : null) ?? person.photoDataUrl ?? null,
    };
  };

  return cards.map((card) => ({
    ...card,
    analyst: withPhoto(card.analyst),
    developer: withPhoto(card.developer),
  }));
}

function drawBrandMark(doc: jsPDF, x: number, y: number, size: number) {
  try {
    doc.addImage(azoupLogoPng, 'PNG', x, y, size, size);
  } catch {
    setFill(doc, COLOR.primary);
    doc.circle(x + size / 2, y + size / 2, size / 2, 'F');
  }
}

function drawCornerAccents(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  setFill(doc, COLOR.primary);
  doc.triangle(pageW - CORNER, 0, pageW, 0, pageW, CORNER, 'F');
  doc.triangle(0, pageH - CORNER, 0, pageH, CORNER, pageH, 'F');
}

function drawPageChrome(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  setFill(doc, COLOR.cream);
  doc.rect(0, 0, pageW, pageH, 'F');
  drawCornerAccents(doc);
}

function drawHeader(doc: jsPDF, brand: KanbanDemandsPdfBrand) {
  const pageW = doc.internal.pageSize.getWidth();
  drawBrandMark(doc, MARGIN_X, 9.4, 9.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setText(doc, COLOR.primary);
  doc.text(brand.boardName, MARGIN_X + 11.4, 15.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setText(doc, COLOR.muted);
  doc.text('Mais organização,', pageW - 20, 13.2, { align: 'right' });
  doc.text('melhores resultados.', pageW - 20, 16.6, { align: 'right' });
}

function drawFooter(doc: jsPDF, page: number, total: number, brand: KanbanDemandsPdfBrand) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const y = pageH - 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLOR.muted);
  doc.text('Juntos por um sistema cada vez melhor!', MARGIN_X + 22, y);

  const logoX = pageW - MARGIN_X - 33;
  drawBrandMark(doc, logoX, y - 5.8, 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, COLOR.primary);
  doc.text('Kanban', logoX + 9.4, y - 1.6);
  doc.setFontSize(7.5);
  doc.text(brand.boardNameLine2, logoX + 9.4, y + 1.8);

  if (total > 1) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(doc, COLOR.muted);
    doc.text(`${page} / ${total}`, pageW / 2, pageH - 5, { align: 'center' });
  }
}

function drawCheckBadge(doc: jsPDF, x: number, y: number) {
  setFill(doc, COLOR.primary);
  doc.circle(x, y, 4.1, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.75);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  doc.line(x - 1.7, y + 0.15, x - 0.45, y + 1.55);
  doc.line(x - 0.45, y + 1.55, x + 2.05, y - 1.45);
}

function drawTitleBlock(doc: jsPDF, brand: KanbanDemandsPdfBrand): number {
  const y = HEADER_H + 10;
  drawCheckBadge(doc, MARGIN_X + 4.2, y - 1.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setText(doc, COLOR.ink);
  doc.text('Demandas ', MARGIN_X + 11.2, y);
  const demandasW = doc.getTextWidth('Demandas ');
  setText(doc, COLOR.primary);
  doc.text(brand.titleAccent, MARGIN_X + 11.2 + demandasW, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, COLOR.muted);
  doc.text(brand.boardName, MARGIN_X + 11.2, y + 5.4);
  return y + 11;
}

function drawCalendarGlyph(doc: jsPDF, x: number, y: number) {
  setStroke(doc, COLOR.primary);
  setFill(doc, COLOR.primary);
  doc.setLineWidth(0.45);
  doc.setLineCap('round');
  doc.roundedRect(x, y + 1.1, 6.2, 5.4, 0.7, 0.7, 'S');
  doc.line(x, y + 2.7, x + 6.2, y + 2.7);
  doc.rect(x + 1.4, y, 0.7, 1.6, 'F');
  doc.rect(x + 4.1, y, 0.7, 1.6, 'F');
  doc.rect(x + 1.3, y + 3.5, 1.1, 1.1, 'F');
  doc.rect(x + 2.8, y + 3.5, 1.1, 1.1, 'F');
}

function drawListGlyph(doc: jsPDF, x: number, y: number) {
  setFill(doc, COLOR.primary);
  setStroke(doc, COLOR.primary);
  doc.setLineWidth(0.55);
  doc.setLineCap('round');
  for (let i = 0; i < 3; i += 1) {
    const iy = y + 1.1 + i * 2.05;
    doc.circle(x + 0.7, iy, 0.55, 'F');
    doc.line(x + 2.1, iy, x + 6.1, iy);
  }
}

function drawKpiRow(doc: jsPDF, y: number, dateFrom: string, dateTo: string, total: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  const gap = 4;
  const width = (pageW - MARGIN_X * 2 - gap) / 2;
  const height = 16;

  const drawCard = (x: number) => {
    setFill(doc, COLOR.peach);
    doc.roundedRect(x, y, width, height, 2.6, 2.6, 'F');
  };

  drawCard(MARGIN_X);
  drawCalendarGlyph(doc, MARGIN_X + 4.2, y + 4.6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setText(doc, COLOR.muted);
  doc.text('PERÍODO', MARGIN_X + 13.6, y + 6.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  setText(doc, COLOR.ink);
  doc.text(`${dateFrom} a ${dateTo}`, MARGIN_X + 13.6, y + 11.4);

  const rightX = MARGIN_X + width + gap;
  drawCard(rightX);
  drawListGlyph(doc, rightX + 4.2, y + 4.6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setText(doc, COLOR.muted);
  doc.text('TOTAL', rightX + 13.6, y + 6.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setText(doc, COLOR.primary);
  const totalLabel = String(total);
  doc.text(totalLabel, rightX + 13.6, y + 12.4);
  const numberW = doc.getTextWidth(totalLabel);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLOR.muted);
  doc.text('demanda(s)', rightX + 13.6 + numberW + 1.6, y + 12);
  return y + height + 5;
}

function drawIcon(doc: jsPDF, kind: ConfecDemandIcon, cx: number, cy: number) {
  setStroke(doc, COLOR.primary);
  setFill(doc, COLOR.primary);
  doc.setLineWidth(0.55);
  doc.setLineCap('round');
  doc.setLineJoin('round');

  if (kind === 'lightbulb') {
    doc.circle(cx, cy - 0.7, 1.65, 'S');
    doc.setLineWidth(0.7);
    doc.line(cx - 0.9, cy + 1.05, cx + 0.9, cy + 1.05);
    doc.setLineWidth(0.5);
    doc.line(cx - 0.7, cy + 1.65, cx + 0.7, cy + 1.65);
    doc.line(cx - 0.45, cy + 2.2, cx + 0.45, cy + 2.2);
    doc.line(cx, cy - 2.7, cx, cy - 3.3);
    doc.line(cx - 2.2, cy - 1.85, cx - 2.75, cy - 2.35);
    doc.line(cx + 2.2, cy - 1.85, cx + 2.75, cy - 2.35);
    return;
  }

  if (kind === 'wrench') {
    doc.setLineWidth(0.95);
    doc.line(cx - 1.7, cy + 1.8, cx + 1.5, cy - 1.4);
    doc.setLineWidth(0.6);
    doc.circle(cx + 2.05, cy - 1.95, 1.05, 'S');
    doc.circle(cx - 2.15, cy + 2.15, 0.72, 'S');
    return;
  }

  if (kind === 'gear') {
    doc.circle(cx, cy, 1.85, 'S');
    doc.circle(cx, cy, 0.75, 'S');
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i;
      const x1 = cx + Math.cos(angle) * 2.15;
      const y1 = cy + Math.sin(angle) * 2.15;
      const x2 = cx + Math.cos(angle) * 2.85;
      const y2 = cy + Math.sin(angle) * 2.85;
      doc.setLineWidth(0.85);
      doc.line(x1, y1, x2, y2);
    }
    return;
  }

  if (kind === 'clipboard') {
    doc.roundedRect(cx - 2.15, cy - 1.35, 4.3, 4.4, 0.55, 0.55, 'S');
    doc.roundedRect(cx - 1.15, cy - 2.35, 2.3, 1.5, 0.35, 0.35, 'S');
    doc.setLineWidth(0.45);
    doc.line(cx - 1.15, cy + 0.15, cx + 1.15, cy + 0.15);
    doc.line(cx - 1.15, cy + 1.2, cx + 1.15, cy + 1.2);
    doc.line(cx - 1.15, cy + 2.2, cx + 0.55, cy + 2.2);
    return;
  }

  if (kind === 'calendar') {
    doc.roundedRect(cx - 2.35, cy - 1.05, 4.7, 4.15, 0.55, 0.55, 'S');
    doc.line(cx - 2.35, cy + 0.2, cx + 2.35, cy + 0.2);
    doc.rect(cx - 1.35, cy - 2.15, 0.55, 1.35, 'F');
    doc.rect(cx + 0.8, cy - 2.15, 0.55, 1.35, 'F');
    doc.rect(cx - 1.2, cy + 1.05, 0.9, 0.9, 'F');
    return;
  }

  if (kind === 'money') {
    doc.circle(cx, cy, 2.45, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    setText(doc, COLOR.primary);
    doc.text('$', cx, cy + 1.2, { align: 'center' });
    return;
  }

  doc.roundedRect(cx - 2.15, cy - 2.2, 4.1, 4.7, 0.4, 0.4, 'S');
  setFill(doc, COLOR.peachDeep);
  setStroke(doc, COLOR.primary);
  doc.triangle(cx + 0.35, cy - 2.2, cx + 1.95, cy - 2.2, cx + 1.95, cy - 0.55, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.2);
  setText(doc, COLOR.primary);
  doc.text('PDF', cx - 0.1, cy + 1.9, { align: 'center' });
}

function measureDemandCard(
  doc: jsPDF,
  card: ConfecCompletedDemandCard,
  pageW: number,
): {
  height: number;
  ticket: string;
  titleLines: string[];
  obsLines: string[];
  icon: ConfecDemandIcon;
  textW: number;
} {
  const title = confecDemandDisplayTitle(card.title);
  const { heading, description } = splitConfecDemandTitle(card.title);
  const ticket = formatDevTicketNumber(card.ticket_number) || '—';
  const obs = (card.dev_notes || '').trim() || '—';
  const textX = CARD_PAD_X + ICON_BOX + 3.4;
  const textW = pageW - MARGIN_X * 2 - textX - PEOPLE_COL_W - CARD_PAD_X - 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  const titleLines = wrapLines(doc, title, textW, 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  const obsLines = wrapLines(doc, obs, textW, 8);
  const titleH = titleLines.length * 3.6;
  const obsBlockH = 3.4 + obsLines.length * 3.4;
  const textH = titleH + 1.8 + obsBlockH;
  const leftH = NUMBER_H + NUMBER_GAP + ICON_BOX;
  const height = CARD_PAD_Y + Math.max(leftH, textH, PEOPLE_STACK_H) + CARD_PAD_Y;
  return {
    height,
    ticket,
    titleLines,
    obsLines,
    icon: pickConfecDemandIcon(heading, description),
    textW,
  };
}

function drawAvatar(doc: jsPDF, x: number, y: number, person: ConfecPdfPerson | null | undefined) {
  const r = AVATAR_SIZE / 2;
  if (person?.photoDataUrl) {
    try {
      doc.addImage(person.photoDataUrl, 'PNG', x, y, AVATAR_SIZE, AVATAR_SIZE);
      setStroke(doc, COLOR.line);
      doc.setLineWidth(0.18);
      doc.circle(x + r, y + r, r, 'S');
      return;
    } catch {
      // fallback to initial
    }
  }
  setFill(doc, COLOR.peach);
  doc.circle(x + r, y + r, r, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  setText(doc, COLOR.primary);
  doc.text(personInitial(person), x + r, y + r + 1.9, { align: 'center' });
}

function drawPersonChip(
  doc: jsPDF,
  x: number,
  y: number,
  role: string,
  person: ConfecPdfPerson | null | undefined,
  maxWidth: number,
) {
  drawAvatar(doc, x, y + 0.6, person);
  const textX = x + AVATAR_SIZE + 1.5;
  const nameWidth = Math.max(8, maxWidth - AVATAR_SIZE - 1.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.6);
  setText(doc, COLOR.muted);
  doc.text(role, textX, y + 2.4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  setText(doc, COLOR.ink);
  doc.text(fitText(doc, personDisplayName(person), nameWidth), textX, y + 5.8);
}

function drawDemandCard(
  doc: jsPDF,
  card: ConfecCompletedDemandCard,
  y: number,
  pageW: number,
): number {
  const layout = measureDemandCard(doc, card, pageW);
  const x = MARGIN_X;
  const width = pageW - MARGIN_X * 2;

  setFill(doc, COLOR.white);
  setStroke(doc, COLOR.line);
  doc.setLineWidth(0.28);
  doc.roundedRect(x, y, width, layout.height, 2.4, 2.4, 'FD');

  const iconX = x + CARD_PAD_X;
  const numberY = y + CARD_PAD_Y + NUMBER_H;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  setText(doc, COLOR.primary);
  doc.text(layout.ticket, iconX + ICON_BOX / 2, numberY, { align: 'center' });

  const boxY = y + CARD_PAD_Y + NUMBER_H + NUMBER_GAP;
  setFill(doc, COLOR.peach);
  doc.roundedRect(iconX, boxY, ICON_BOX, ICON_BOX, 2.2, 2.2, 'F');
  drawIcon(doc, layout.icon, iconX + ICON_BOX / 2, boxY + ICON_BOX / 2);

  const textX = iconX + ICON_BOX + 3.4;
  let textY = y + CARD_PAD_Y + NUMBER_H;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  setText(doc, COLOR.ink);
  for (const line of layout.titleLines) {
    doc.text(line, textX, textY);
    textY += 3.6;
  }

  textY += 1.6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  setText(doc, COLOR.muted);
  doc.text('OBS', textX, textY);
  textY += 3.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  setText(doc, COLOR.ink);
  for (const line of layout.obsLines) {
    doc.text(line, textX, textY);
    textY += 3.4;
  }

  const peopleX = x + width - CARD_PAD_X - PEOPLE_COL_W;
  const peopleY = y + CARD_PAD_Y;
  drawPersonChip(doc, peopleX, peopleY, 'ANALISTA', card.analyst, PEOPLE_COL_W);
  drawPersonChip(doc, peopleX, peopleY + PERSON_CHIP_H + PERSON_GAP, 'DEV', card.developer, PEOPLE_COL_W);

  return layout.height;
}

function addPreparedPage(
  doc: jsPDF,
  first: boolean,
  dateFrom: string,
  dateTo: string,
  total: number,
  brand: KanbanDemandsPdfBrand,
): number {
  if (!first) doc.addPage();
  drawPageChrome(doc);
  drawHeader(doc, brand);
  if (first) {
    const afterTitle = drawTitleBlock(doc, brand);
    return drawKpiRow(doc, afterTitle, dateFrom, dateTo, total);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, COLOR.ink);
  doc.text(`Demandas ${brand.titleAccent} — continuação`, MARGIN_X, HEADER_H + 8);
  return HEADER_H + 13;
}

export function buildConfecCompletedDemandsPdf(params: {
  cards: ConfecCompletedDemandCard[];
  dateFrom: string;
  dateTo: string;
  brand?: KanbanDemandsPdfBrand;
}): jsPDF {
  const { cards, dateFrom, dateTo } = params;
  const brand = params.brand ?? CONFEC_COMPLETED_PDF_BRAND;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentBottom = pageH - FOOTER_RESERVE;

  let y = addPreparedPage(doc, true, dateFrom, dateTo, cards.length, brand);

  if (cards.length === 0) {
    setFill(doc, COLOR.white);
    setStroke(doc, COLOR.line);
    doc.setLineWidth(0.28);
    doc.roundedRect(MARGIN_X, y, pageW - MARGIN_X * 2, 18, 2.4, 2.4, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, COLOR.muted);
    doc.text(brand.emptyMessage, pageW / 2, y + 10.4, {
      align: 'center',
    });
  } else {
    for (const card of cards) {
      const height = measureDemandCard(doc, card, pageW).height;
      if (y + height > contentBottom) {
        y = addPreparedPage(doc, false, dateFrom, dateTo, cards.length, brand);
      }
      const drawn = drawDemandCard(doc, card, y, pageW);
      y += drawn + CARD_GAP;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages, brand);
  }

  return doc;
}

export async function downloadConfecCompletedDemandsPdf(params: {
  cards: ConfecCompletedDemandCard[];
  dateFrom: string;
  dateTo: string;
  brand?: KanbanDemandsPdfBrand;
}): Promise<void> {
  const brand = params.brand ?? CONFEC_COMPLETED_PDF_BRAND;
  const cards = await attachConfecPdfPersonPhotos(params.cards);
  const doc = buildConfecCompletedDemandsPdf({
    cards,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    brand,
  });
  doc.save(`${brand.filenamePrefix}_${params.dateFrom}_${params.dateTo}.pdf`);
}
