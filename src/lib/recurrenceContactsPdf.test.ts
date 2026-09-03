import { describe, expect, it } from 'vitest';
import { buildRecurrence } from './digisacBuRecurrence';
import {
  buildRecurrenceContactsPdf,
  buildRecurrencePdfFilename,
  buildRecurrencePdfFilterLabels,
  formatRecurrencePdfDay,
  formatRecurrencePdfPeriod,
  type RecurrencePdfFilters,
} from './recurrenceContactsPdf';

const filters: RecurrencePdfFilters = {
  dateFrom: '2026-08-01',
  dateTo: '2026-08-31',
  departmentKey: 'suporte',
  departmentLabel: 'Suporte',
  unitFilter: 'B1',
  classFilter: 'alta_recorrencia',
  analystFilter: 'all',
  search: '',
};

describe('formatRecurrencePdfDay', () => {
  it('formata yyyy-MM-dd para pt-BR', () => {
    expect(formatRecurrencePdfDay('2026-08-01')).toBe('01/08/2026');
  });

  it('mantém valor inválido e usa traço vazio', () => {
    expect(formatRecurrencePdfDay('ontem')).toBe('ontem');
    expect(formatRecurrencePdfDay('')).toBe('—');
  });
});

describe('formatRecurrencePdfPeriod', () => {
  it('junta início e fim', () => {
    expect(formatRecurrencePdfPeriod('2026-08-01', '2026-08-31')).toBe('01/08/2026 a 31/08/2026');
  });
});

describe('buildRecurrencePdfFilterLabels', () => {
  it('mostra unidade e classificação filtradas', () => {
    expect(buildRecurrencePdfFilterLabels(filters)).toEqual([
      { label: 'Departamento', value: 'Suporte' },
      { label: 'Unidade', value: 'B1' },
      { label: 'Classificação', value: 'Alta recorrência' },
    ]);
  });

  it('inclui analista e pesquisa quando houver', () => {
    const chips = buildRecurrencePdfFilterLabels({
      ...filters,
      unitFilter: 'all',
      classFilter: 'all',
      analystFilter: 'Ana',
      search: 'Maria',
    });
    expect(chips).toEqual([
      { label: 'Departamento', value: 'Suporte' },
      { label: 'Unidade', value: 'B1 e B2' },
      { label: 'Classificação', value: 'Todas' },
      { label: 'Analista', value: 'Ana' },
      { label: 'Pesquisa', value: 'Maria' },
    ]);
  });
});

describe('buildRecurrencePdfFilename', () => {
  it('inclui departamento, filtros e período', () => {
    expect(buildRecurrencePdfFilename(filters)).toBe(
      'recorrencias_suporte_b1_alta_recorrencia_2026-08-01_2026-08-31.pdf',
    );
  });
});

describe('buildRecurrenceContactsPdf', () => {
  it('gera um PDF com o resultado filtrado', () => {
    const { contacts } = buildRecurrence(
      Array.from({ length: 5 }, (_, i) => ({
        id: `t${i}`,
        contactId: 'c1',
        date: `2026-08-0${i + 1}`,
        sortAt: `2026-08-0${i + 1}T10:00:00.000Z`,
        phone: '(19) 99999-0001',
        name: 'Maria Silva',
        attendantName: 'Ana',
        attendantUserId: 'u1',
        subject: 'Dúvida',
        protocol: `p${i}`,
        unit: 'B1' as const,
      })),
    );

    const doc = buildRecurrenceContactsPdf({ contacts, filters });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const output = doc.output('arraybuffer');
    expect(output.byteLength).toBeGreaterThan(500);
  });
});
