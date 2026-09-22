import { describe, expect, it } from 'vitest';
import {
  buildConfecCompletedDemandsPdf,
  confecDemandDisplayTitle,
  filterConfecCompletedCardsByPeriod,
  formatConfecCompletedDemandLine,
  personDisplayName,
  pickConfecDemandIcon,
  splitConfecDemandTitle,
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

describe('confecDemandDisplayTitle', () => {
  it('mantém o título completo do ticket', () => {
    expect(
      confecDemandDisplayTitle('MAKE DA MISS - SUGESTÃO DE MELHORIA'),
    ).toBe('MAKE DA MISS - SUGESTÃO DE MELHORIA');
  });

  it('usa placeholder quando vazio', () => {
    expect(confecDemandDisplayTitle('')).toBe('SEM TÍTULO');
  });
});

describe('personDisplayName', () => {
  it('mostra nome ou traço', () => {
    expect(personDisplayName({ name: 'Bia' })).toBe('Bia');
    expect(personDisplayName(null)).toBe('—');
  });
});

describe('splitConfecDemandTitle', () => {
  it('separa título e descrição por hífen', () => {
    expect(
      splitConfecDemandTitle(
        'SUGESTÃO DE MELHORIA - FIXAÇÃO DE LINHA E COLUNA NA TELA DE PREVISÕES FINANCEIRAS',
      ),
    ).toEqual({
      heading: 'SUGESTÃO DE MELHORIA',
      description: 'FIXAÇÃO DE LINHA E COLUNA NA TELA DE PREVISÕES FINANCEIRAS',
    });
  });

  it('separa título e descrição por travessão', () => {
    expect(
      splitConfecDemandTitle(
        'INNCOMUM UNIFORMES: PEDIDO — TIPO DE OPERAÇÃO, PAGAMENTO E PEDIDO DE COMPRA SE PERDEM NA EDIÇÃO',
      ),
    ).toEqual({
      heading: 'INNCOMUM UNIFORMES: PEDIDO',
      description: 'TIPO DE OPERAÇÃO, PAGAMENTO E PEDIDO DE COMPRA SE PERDEM NA EDIÇÃO',
    });
  });

  it('mantém título inteiro quando não há separador', () => {
    expect(splitConfecDemandTitle('FINANCEIRO')).toEqual({
      heading: 'FINANCEIRO',
      description: '',
    });
  });
});

describe('pickConfecDemandIcon', () => {
  it('escolhe ícone pelo contexto do título', () => {
    expect(pickConfecDemandIcon('SUGESTÃO DE MELHORIA', 'FIXAÇÃO DE LINHA')).toBe('lightbulb');
    expect(pickConfecDemandIcon('KALHANDRA UNIFORMES', 'SUGESTÃO DE MELHORIA')).toBe('wrench');
    expect(pickConfecDemandIcon('INNCOMUM', 'MELHORIA NA PRODUÇÃO')).toBe('gear');
    expect(pickConfecDemandIcon('TATUI', 'SUGESTÃO DE MELHORIA')).toBe('lightbulb');
    expect(pickConfecDemandIcon('INNCOMUM UNIFORMES: PEDIDO', 'TIPO DE OPERAÇÃO')).toBe('clipboard');
    expect(pickConfecDemandIcon('ORÇAMENTO/PEDIDO', 'PRAZO DE ENTREGA NA TELA')).toBe('calendar');
    expect(pickConfecDemandIcon('INNCOMUM UNIFORMES: FINANCEIRO', 'FILTROS ESSENCIAIS')).toBe('money');
    expect(pickConfecDemandIcon('FINANCEIRO', 'PDF CONTAS A PAGAR/RECEBER')).toBe('pdf');
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

describe('buildConfecCompletedDemandsPdf', () => {
  it('gera PDF com as demandas do período', () => {
    const doc = buildConfecCompletedDemandsPdf({
      dateFrom: '2026-09-22',
      dateTo: '2026-09-22',
      cards: [
        {
          ticket_number: 13,
          title: 'SUGESTÃO DE MELHORIA - FIXAÇÃO DE LINHA E COLUNA',
          analyst: { name: 'Bia' },
          developer: { name: 'Henri' },
        },
        { ticket_number: 14, title: 'KALHANDRA UNIFORMES - SUGESTÃO DE MELHORIA' },
      ],
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('gera PDF vazio sem demandas', () => {
    const doc = buildConfecCompletedDemandsPdf({
      dateFrom: '2026-09-22',
      dateTo: '2026-09-22',
      cards: [],
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
