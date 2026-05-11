import { describe, expect, it } from "vitest";
import {
  normalizeGeralResponse,
  normalizeAnalistasResponse,
  pickFirstPositiveByKeys,
  totalsPrimeiraRespostaMinutes,
  totalsTempoEsperaMinutes,
  timeRawToAverageMinutes,
} from "./dashboardNormalize";

describe("pickFirstPositiveByKeys", () => {
  it("ignora zero inicial e usa o próximo campo > 0", () => {
    const totals = { firstWaitingTime: 0, averageFirstWaitingTime: 180 };
    expect(pickFirstPositiveByKeys(totals, ["firstWaitingTime", "averageFirstWaitingTime"])).toBe(180);
  });
});

describe("totalsPrimeiraRespostaMinutes", () => {
  it("converte segundos em minutos (ex.: 180s → 3min)", () => {
    const totals = { averageFirstWaitingTime: 180 };
    expect(totalsPrimeiraRespostaMinutes(totals)).toBeCloseTo(3, 5);
  });
});

describe("timeRawToAverageMinutes", () => {
  it("valores >= 10M são tratados como ms → minutos", () => {
    const ms = 12_000_000;
    expect(timeRawToAverageMinutes(ms)).toBeCloseTo(12_000_000 / 1000 / 60, 5);
  });
});

describe("normalizeGeralResponse", () => {
  it("lê totals aninhados e TMA", () => {
    const payload = {
      totals: {
        totalTicketsCount: 10,
        closedTicketsCount: 4,
        openedTicketsCount: 6,
        totalMessagesCount: 100,
        contactsCount: 8,
        ticketTime: 600,
        waitingTimeAvg: 120,
        averageFirstWaitingTime: 180,
      },
    };
    const g = normalizeGeralResponse(payload);
    expect(g.total_chamados).toBe(10);
    expect(g.tma_geral_minutos).toBeCloseTo(10, 5);
    expect(g.primeira_resposta_minutos).toBeCloseTo(3, 5);
    expect(g.mensagens_enviadas).toBe(0);
    expect(g.mensagens_recebidas).toBe(0);
    expect(g.total_mensagens).toBe(100);
  });

  it("total de chamados = fechados + abertos quando a API manda os dois (ex.: 244 vs totalTicketsCount 237)", () => {
    const payload = {
      totals: {
        totalTicketsCount: 237,
        closedTicketsCount: 244,
        openedTicketsCount: 0,
        sentMessagesCount: 3071,
        receivedMessagesCount: 3939,
        ticketTime: 3819,
        averageFirstWaitingTime: 229,
      },
    };
    const g = normalizeGeralResponse(payload);
    expect(g.total_chamados).toBe(244);
    expect(g.total_mensagens).toBe(7010);
    expect(g.primeira_resposta_minutos).toBeCloseTo(229 / 60, 4);
  });

  it("aceita média do 1º tempo já em minutos decimais", () => {
    const payload = {
      totals: {
        closedTicketsCount: 1,
        openedTicketsCount: 0,
        averageFirstWaitingTime: 3.82,
      },
    };
    const g = normalizeGeralResponse(payload);
    expect(g.primeira_resposta_minutos).toBeCloseTo(3.82, 4);
  });

  it("prioriza totals.waitingTime mesmo se firstResponseTime for maior (evita 3m54s vs 3m49s)", () => {
    const totals = {
      closedTicketsCount: 1,
      openedTicketsCount: 0,
      waitingTime: 229,
      firstResponseTime: 234,
    };
    expect(totalsPrimeiraRespostaMinutes(totals)).toBeCloseTo(229 / 60, 5);
  });

  it("waitingTime vence firstResponseTimeMinutes (minutos) da API", () => {
    const totals = {
      closedTicketsCount: 1,
      openedTicketsCount: 0,
      waitingTime: 229,
      firstResponseTimeMinutes: 3.9,
    };
    expect(totalsPrimeiraRespostaMinutes(totals)).toBeCloseTo(229 / 60, 5);
  });

  it("payload real Digisac: waitingTime = 1º espera; waitingTimeAvg = espera geral", () => {
    const totals = {
      sentMessagesCount: 3071,
      receivedMessagesCount: 3939,
      totalMessagesCount: 7010,
      openedTicketsCount: 0,
      closedTicketsCount: 244,
      contactsCount: 134,
      totalTicketsCount: 244,
      ticketTime: 3819,
      waitingTime: 229,
      waitingTimeAfterBot: 0,
      waitingTimeAvg: 109,
    };
    expect(totalsPrimeiraRespostaMinutes(totals)).toBeCloseTo(229 / 60, 4);
    expect(totalsTempoEsperaMinutes(totals)).toBeCloseTo(109 / 60, 4);
    const g = normalizeGeralResponse({ totals });
    expect(g.total_chamados).toBe(244);
    expect(g.total_mensagens).toBe(7010);
    expect(g.mensagens_enviadas).toBe(3071);
    expect(g.mensagens_recebidas).toBe(3939);
    expect(g.primeira_resposta_minutos).toBeCloseTo(229 / 60, 4);
    expect(g.tempo_espera_minutos).toBeCloseTo(109 / 60, 4);
    expect(g.tma_geral_minutos).toBeCloseTo(3819 / 60, 4);
  });
});

describe("normalizeAnalistasResponse", () => {
  it("preserva linhas com userId e primeira espera", () => {
    const payload = {
      items: [
        {
          userId: "u1",
          userName: "Anna",
          totalTicketsCount: 5,
          closedTicketsCount: 3,
          openedTicketsCount: 2,
          ticketTime: 300,
          averageFirstWaitingTime: 120,
          totalMessagesCount: 20,
          contactsCount: 4,
        },
      ],
    };
    const rows = normalizeAnalistasResponse(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0].analyst_id).toBe("u1");
    expect(rows[0].primeira_espera_minutos).toBeCloseTo(2, 5);
    expect(rows[0].tma_minutos).toBeCloseTo(5, 5);
    expect(rows[0].total_chamados).toBe(5);
    expect(rows[0].mensagens_enviadas).toBe(0);
    expect(rows[0].mensagens_recebidas).toBe(0);
    expect(rows[0].total_mensagens).toBe(20);
  });

  it("achata stats aninhados para contagem e TMA", () => {
    const payload = {
      items: [
        {
          userId: "x1",
          userName: "Test",
          stats: {
            closedTicketsCount: 7,
            openedTicketsCount: 1,
            ticketTime: 120,
            waitingTime: 60,
            sentMessagesCount: 2,
            receivedMessagesCount: 3,
          },
        },
      ],
    };
    const rows = normalizeAnalistasResponse(payload);
    expect(rows[0].total_chamados).toBe(8);
    expect(rows[0].tma_minutos).toBeCloseTo(2, 5);
    expect(rows[0].primeira_espera_minutos).toBeCloseTo(1, 5);
    expect(rows[0].mensagens_enviadas).toBe(2);
    expect(rows[0].mensagens_recebidas).toBe(3);
    expect(rows[0].total_mensagens).toBe(5);
  });

  it("stats aninhado sobrescreve zeros no nível raiz (contagem / TMA)", () => {
    const payload = {
      items: [
        {
          userId: "x2",
          userName: "Ana",
          closedTicketsCount: 0,
          openedTicketsCount: 0,
          ticketTime: 0,
          stats: {
            closedTicketsCount: 5,
            openedTicketsCount: 2,
            ticketTime: 180,
            waitingTime: 90,
          },
        },
      ],
    };
    const rows = normalizeAnalistasResponse(payload);
    expect(rows[0].total_chamados).toBe(7);
    expect(rows[0].tma_minutos).toBeCloseTo(3, 5);
    expect(rows[0].primeira_espera_minutos).toBeCloseTo(1.5, 5);
  });

  it("total por analista usa fechados+abertos quando vierem explícitos", () => {
    const payload = {
      items: [
        {
          userId: "u2",
          userName: "Anna",
          totalTicketsCount: 10,
          closedTicketsCount: 12,
          openedTicketsCount: 0,
          ticketTime: 60,
        },
      ],
    };
    const rows = normalizeAnalistasResponse(payload);
    expect(rows[0].total_chamados).toBe(12);
  });

  it("ignora chave genérica `open` numérica na linha (só conta openTickets* / openedTickets*)", () => {
    const payload = {
      items: [
        {
          userId: "u3",
          userName: "Bob",
          closedTicketsCount: 5,
          openedTicketsCount: 0,
          open: 999,
          ticketTime: 120,
        },
      ],
    };
    const rows = normalizeAnalistasResponse(payload);
    expect(rows[0].chamados_abertos).toBe(0);
    expect(rows[0].total_chamados).toBe(5);
  });
});
