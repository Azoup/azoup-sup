import { jsPDF } from 'jspdf';
import {
  RECURRENCE_CLASS_LABEL,
  formatPhoneDisplay,
  summarizeContacts,
  type RecurrenceClass,
  type RecurrenceContactRow,
  type RecurrenceUnitKey,
} from '@/lib/digisacBuRecurrence';
import type { RecurrenceDepartmentKey } from '@/lib/digisacRecurrenceDepartments';

export type RecurrencePdfFilters = {
  dateFrom: string;
  dateTo: string;
  departmentKey: RecurrenceDepartmentKey;
  departmentLabel: string;
  unitFilter: 'all' | RecurrenceUnitKey;
  classFilter: 'all' | RecurrenceClass;
  analystFilter: string;
  search: string;
};

type Rgb = [number, number, number];

const COLOR = {
  primary: [220, 122, 0] as Rgb,
  primarySoft: [255, 237, 213] as Rgb,
  ink: [35, 24, 15] as Rgb,
  muted: [122, 106, 92] as Rgb,
  line: [230, 220, 210] as Rgb,
  cream: [250, 247, 244] as Rgb,
  stripe: [255, 248, 240] as Rgb,
  white: [255, 255, 255] as Rgb,
  header: [35, 24, 15] as Rgb,
  unico: [107, 114, 128] as Rgb,
  unicoBg: [243, 244, 246] as Rgb,
  retorno: [180, 96, 0] as Rgb,
  retornoBg: [255, 237, 213] as Rgb,
  recorrente: [146, 64, 14] as Rgb,
  recorrenteBg: [254, 243, 199] as Rgb,
  alta: [185, 28, 28] as Rgb,
  altaBg: [254, 226, 226] as Rgb,
};

const CLASS_STYLE: Record<RecurrenceClass, { fg: Rgb; bg: Rgb }> = {
  unico: { fg: COLOR.unico, bg: COLOR.unicoBg },
  retorno: { fg: COLOR.retorno, bg: COLOR.retornoBg },
  recorrente: { fg: COLOR.recorrente, bg: COLOR.recorrenteBg },
  alta_recorrencia: { fg: COLOR.alta, bg: COLOR.altaBg },
};

const MARGIN_X = 12;
const FOOTER_Y = 200;
const ROW_H = 8.2;
const TABLE_HEADER_H = 8.6;

const COLS = [
  { key: 'name', label: 'Nome', w: 70, align: 'left' as const },
  { key: 'phone', label: 'Telefone', w: 42, align: 'left' as const },
  { key: 'atendimentos', label: 'Atendimentos', w: 28, align: 'right' as const },
  { key: 'retornos', label: 'Retornos', w: 24, align: 'right' as const },
  { key: 'classification', label: 'Classificação', w: 40, align: 'center' as const },
  { key: 'first', label: 'Primeiro', w: 34.5, align: 'center' as const },
  { key: 'last', label: 'Último', w: 34.5, align: 'center' as const },
];

export function formatRecurrencePdfDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value.trim() || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatRecurrencePdfPeriod(dateFrom: string, dateTo: string): string {
  return `${formatRecurrencePdfDay(dateFrom)} a ${formatRecurrencePdfDay(dateTo)}`;
}

export function buildRecurrencePdfFilterLabels(filters: RecurrencePdfFilters): { label: string; value: string }[] {
  const chips = [
    { label: 'Departamento', value: filters.departmentLabel },
    { label: 'Unidade', value: filters.unitFilter === 'all' ? 'B1 e B2' : filters.unitFilter },
    {
      label: 'Classificação',
      value: filters.classFilter === 'all' ? 'Todas' : RECURRENCE_CLASS_LABEL[filters.classFilter],
    },
  ];
  if (filters.analystFilter && filters.analystFilter !== 'all') {
    chips.push({ label: 'Analista', value: filters.analystFilter });
  }
  const search = filters.search.trim();
  if (search) chips.push({ label: 'Pesquisa', value: search });
  return chips;
}

export function buildRecurrencePdfFilename(filters: Pick<
  RecurrencePdfFilters,
  'departmentKey' | 'dateFrom' | 'dateTo' | 'unitFilter' | 'classFilter'
>): string {
  const parts = ['recorrencias', filters.departmentKey];
  if (filters.unitFilter !== 'all') parts.push(filters.unitFilter.toLowerCase());
  if (filters.classFilter !== 'all') parts.push(filters.classFilter);
  parts.push(filters.dateFrom, filters.dateTo);
  return `${parts.join('_')}.pdf`;
}

function generatedAtLabel(): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date());
  } catch {
    return new Date().toLocaleString('pt-BR');
  }
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

function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (!text) return '—';
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let current = text;
  while (current.length > 1 && doc.getTextWidth(`${current}…`) > maxWidth) {
    current = current.slice(0, -1);
  }
  return `${current}…`;
}

function colX(index: number): number {
  let x = MARGIN_X;
  for (let i = 0; i < index; i++) x += COLS[i].w;
  return x;
}

function drawTopBar(doc: jsPDF) {
  setFill(doc, COLOR.primary);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 3.6, 'F');
}

function drawFooter(doc: jsPDF, page: number, total: number) {
  const width = doc.internal.pageSize.getWidth();
  setStroke(doc, COLOR.line);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, FOOTER_Y - 4, width - MARGIN_X, FOOTER_Y - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLOR.muted);
  doc.text('Azoup Suporte · Relatório de recorrências', MARGIN_X, FOOTER_Y);
  doc.text(`Página ${page} de ${total}`, width - MARGIN_X, FOOTER_Y, { align: 'right' });
}

function drawChip(doc: jsPDF, x: number, y: number, label: string, value: string): number {
  const text = `${label}: ${value}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const textW = doc.getTextWidth(text);
  const w = textW + 6;
  setFill(doc, COLOR.primarySoft);
  doc.roundedRect(x, y - 3.6, w, 6.4, 1.6, 1.6, 'F');
  setText(doc, COLOR.ink);
  doc.text(text, x + 3, y);
  return w + 2.4;
}

function drawKpis(doc: jsPDF, y: number, contacts: RecurrenceContactRow[]): number {
  const summary = summarizeContacts(contacts);
  const items = [
    { label: 'Contatos no resultado', value: String(summary.contatosUnicos) },
    { label: 'Atendimentos', value: String(summary.totalAtendimentos) },
    { label: 'Retornos', value: String(summary.totalRetornos) },
    { label: 'Taxa de recorrência', value: `${summary.taxaRecorrencia.toFixed(1).replace('.', ',')}%` },
  ];
  const gap = 3;
  const cardW = (COLS.reduce((sum, col) => sum + col.w, 0) - gap * (items.length - 1)) / items.length;
  const cardH = 18;

  items.forEach((item, index) => {
    const x = MARGIN_X + index * (cardW + gap);
    setFill(doc, COLOR.cream);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
    setFill(doc, COLOR.primary);
    doc.roundedRect(x, y, 1.6, cardH, 0.6, 0.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setText(doc, COLOR.ink);
    doc.text(item.value, x + 6, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(doc, COLOR.muted);
    doc.text(item.label, x + 6, y + 13.4);
  });

  return y + cardH;
}

function drawTableHeader(doc: jsPDF, y: number) {
  const tableW = COLS.reduce((sum, col) => sum + col.w, 0);
  setFill(doc, COLOR.header);
  doc.roundedRect(MARGIN_X, y, tableW, TABLE_HEADER_H, 1.4, 1.4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setText(doc, COLOR.white);
  COLS.forEach((col, index) => {
    const x = colX(index);
    const labelY = y + 5.5;
    if (col.align === 'right') {
      doc.text(col.label, x + col.w - 2.4, labelY, { align: 'right' });
    } else if (col.align === 'center') {
      doc.text(col.label, x + col.w / 2, labelY, { align: 'center' });
    } else {
      doc.text(col.label, x + 2.4, labelY);
    }
  });
}

function drawClassificationBadge(doc: jsPDF, x: number, y: number, width: number, classification: RecurrenceClass, label: string) {
  const style = CLASS_STYLE[classification];
  const text = fitText(doc, label, width - 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const textW = Math.min(doc.getTextWidth(text) + 5.2, width - 4);
  const badgeX = x + (width - textW) / 2;
  const badgeY = y + 1.7;
  setFill(doc, style.bg);
  doc.roundedRect(badgeX, badgeY, textW, 4.8, 1.4, 1.4, 'F');
  setText(doc, style.fg);
  doc.text(text, badgeX + textW / 2, badgeY + 3.3, { align: 'center' });
}

function drawRow(doc: jsPDF, y: number, row: RecurrenceContactRow, striped: boolean) {
  const tableW = COLS.reduce((sum, col) => sum + col.w, 0);
  setFill(doc, striped ? COLOR.stripe : COLOR.white);
  doc.rect(MARGIN_X, y, tableW, ROW_H, 'F');

  if (row.classification === 'alta_recorrencia') {
    setFill(doc, COLOR.alta);
    doc.rect(MARGIN_X, y + 0.8, 1.1, ROW_H - 1.6, 'F');
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLOR.ink);

  const values = [
    fitText(doc, row.name, COLS[0].w - 5),
    fitText(doc, formatPhoneDisplay(row.phone), COLS[1].w - 5),
    String(row.atendimentos),
    String(row.retornos),
    '',
    formatRecurrencePdfDay(row.firstAtendimento),
    formatRecurrencePdfDay(row.lastAtendimento),
  ];

  values.forEach((value, index) => {
    if (COLS[index].key === 'classification') {
      drawClassificationBadge(doc, colX(index), y, COLS[index].w, row.classification, row.classificationLabel);
      return;
    }
    const x = colX(index);
    const textY = y + 5.3;
    doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');
    doc.setFontSize(8);
    setText(doc, COLOR.ink);
    if (COLS[index].align === 'right') {
      doc.text(value, x + COLS[index].w - 2.4, textY, { align: 'right' });
    } else if (COLS[index].align === 'center') {
      doc.text(value, x + COLS[index].w / 2, textY, { align: 'center' });
    } else {
      doc.text(value, x + 2.4, textY);
    }
  });

  setStroke(doc, COLOR.line);
  doc.setLineWidth(0.15);
  doc.line(MARGIN_X, y + ROW_H, MARGIN_X + tableW, y + ROW_H);
}

function drawFirstPageIntro(doc: jsPDF, filters: RecurrencePdfFilters, contacts: RecurrenceContactRow[]): number {
  drawTopBar(doc);
  const width = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, COLOR.primary);
  doc.text('AZOUP SUPORTE', MARGIN_X, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLOR.muted);
  doc.text(`Gerado em ${generatedAtLabel()}`, width - MARGIN_X, 11, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setText(doc, COLOR.ink);
  doc.text('Relatório de Recorrências', MARGIN_X, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setText(doc, COLOR.muted);
  doc.text(
    `Recorrência por telefone — ${filters.departmentLabel}  ·  ${formatRecurrencePdfPeriod(filters.dateFrom, filters.dateTo)}`,
    MARGIN_X,
    26.2,
  );

  let chipX = MARGIN_X;
  const chips = buildRecurrencePdfFilterLabels(filters);
  chips.forEach((chip) => {
    chipX += drawChip(doc, chipX, 33.4, chip.label, chip.value);
  });

  const kpiBottom = drawKpis(doc, 39, contacts);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLOR.muted);
  const countY = kpiBottom + 6;
  doc.text(
    contacts.length === 1
      ? '1 contato no resultado filtrado'
      : `${contacts.length} contatos no resultado filtrado`,
    MARGIN_X,
    countY,
  );

  return countY + 4;
}

function drawContinuedHeader(doc: jsPDF, filters: RecurrencePdfFilters): number {
  drawTopBar(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, COLOR.ink);
  doc.text('Relatório de Recorrências — continuação', MARGIN_X, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLOR.muted);
  doc.text(formatRecurrencePdfPeriod(filters.dateFrom, filters.dateTo), MARGIN_X, 17);
  return 20;
}

export function buildRecurrenceContactsPdf(params: {
  contacts: RecurrenceContactRow[];
  filters: RecurrencePdfFilters;
}): jsPDF {
  const { contacts, filters } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = drawFirstPageIntro(doc, filters, contacts);
  drawTableHeader(doc, y);
  y += TABLE_HEADER_H;

  if (contacts.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setText(doc, COLOR.muted);
    doc.text('Nenhum contato no período filtrado.', MARGIN_X + 2, y + 10);
  } else {
    contacts.forEach((row, index) => {
      if (y + ROW_H > FOOTER_Y - 8) {
        doc.addPage();
        y = drawContinuedHeader(doc, filters);
        drawTableHeader(doc, y);
        y += TABLE_HEADER_H;
      }
      drawRow(doc, y, row, index % 2 === 1);
      y += ROW_H;
    });
  }

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    drawFooter(doc, page, total);
  }

  return doc;
}

export function downloadRecurrenceContactsPdf(params: {
  contacts: RecurrenceContactRow[];
  filters: RecurrencePdfFilters;
}): void {
  const doc = buildRecurrenceContactsPdf(params);
  doc.save(buildRecurrencePdfFilename(params.filters));
}
