import { describe, expect, it } from 'vitest';
import {
  filterConfecCompletedCardsByPeriod,
  formatConfecCompletedDemandLine,
} from './confecCompletedDemandsPdf';

describe('formatConfecCompletedDemandLine', () => {
  it('monta linha com ticket, título e obs', () => {
    expect(
      formatConfecCompletedDemandLine({
        ticket_number: 12,
        title: 'AJUSTE DE CADASTRO',
        dev_notes: 'REALIZADO AJUSTE X E Y',
      }),
    ).toBe('TICKET 0012 - AJUSTE DE CADASTRO - OBS: REALIZADO AJUSTE X E Y');
  });

  it('usa placeholders quando faltar dado', () => {
    expect(formatConfecCompletedDemandLine({})).toBe('TICKET — - SEM TÍTULO - OBS: —');
  });
});

describe('filterConfecCompletedCardsByPeriod', () => {
  const cards = [
    {
      status: 'finalizados',
      ticket_number: 1,
      title: 'A',
      completed_at: '2026-08-01T15:00:00.000Z',
    },
    {
      status: 'finalizados',
      ticket_number: 2,
      title: 'B',
      completed_at: '2026-08-10T12:00:00.000Z',
    },
    {
      status: 'em-andamento',
      ticket_number: 3,
      title: 'C',
      completed_at: '2026-08-05T12:00:00.000Z',
    },
  ];

  it('filtra só concluídos no período', () => {
    const filtered = filterConfecCompletedCardsByPeriod(cards, 'finalizados', '2026-08-01', '2026-08-05');
    expect(filtered.map((c) => c.ticket_number)).toEqual([1]);
  });
});
