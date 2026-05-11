import { describe, expect, it } from "vitest";
import {
  normalizeGeralResponse,
  normalizeAnalistasResponse,
  pickFirstPositiveByKeys,
  totalsPrimeiraRespostaMinutes,
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
  });
});
