import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aggregateAnswerRows,
  extractAnswerScore,
  flattenAnswersPayload,
} from "./digisacNpsAggregate.ts";

Deno.test("extractAnswerScore ignora type=nps e lê notaAtribuida", () => {
  assertEquals(extractAnswerScore({ type: "nps", notaAtribuida: 9 }), 9);
  assertEquals(extractAnswerScore({ type: "nps", nota: "10" }), 10);
  assertEquals(extractAnswerScore({ type: "nps", classificacao: "Promotor" }), 10);
});

Deno.test("aggregateAnswerRows soma linhas da API", () => {
  const rows = [
    { type: "nps", notaAtribuida: 10, userId: "a" },
    { type: "nps", notaAtribuida: 8, userId: "b" },
    { type: "nps", notaAtribuida: 3, userId: "c" },
  ];
  const c = aggregateAnswerRows(rows);
  assertEquals(c.total, 3);
  assertEquals(c.promoters, 1);
  assertEquals(c.neutrals, 1);
  assertEquals(c.detractors, 1);
});

Deno.test("flattenAnswersPayload aninha data.records", () => {
  const rows = flattenAnswersPayload({
    data: { records: [{ id: "1", nota: 9 }, { id: "2", nota: 7 }] },
  });
  assertEquals(rows.length, 2);
});
