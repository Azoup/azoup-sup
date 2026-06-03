import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapDigisacAnswersOverview } from "./digisacAnswersOverview.ts";

Deno.test("mapDigisacAnswersOverview promotores PT", () => {
  const r = mapDigisacAnswersOverview({
    promotores: { quantidade: 119, porcentagem: 95.97 },
    neutros: { quantidade: 2, porcentagem: 1.61 },
    detratores: { quantidade: 3, porcentagem: 2.42 },
  });
  assertEquals(r.total, 124);
  assertEquals(r.promoters.count, 119);
});

Deno.test("mapDigisacAnswersOverview ignora lista answers vazia e lê totais", () => {
  const r = mapDigisacAnswersOverview({
    data: {
      promotores: { quantidade: 119, porcentagem: 95.97 },
      neutros: { quantidade: 2, porcentagem: 1.61 },
      detratores: { quantidade: 3, porcentagem: 2.42 },
      answers: Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        text: "",
        questionId: "q1",
        ticketId: "t1",
      })),
    },
  });
  assertEquals(r.total, 124);
});

Deno.test("mapDigisacAnswersOverview formato vetor data.nps Digisac", () => {
  const r = mapDigisacAnswersOverview({
    total: { nps: 124, csat: 0 },
    data: { nps: [119, 2, 3, 0, 0], csat: {} },
  });
  assertEquals(r.total, 124);
  assertEquals(r.promoters.count, 119);
  assertEquals(r.neutrals.count, 2);
  assertEquals(r.detractors.count, 3);
});

Deno.test("mapDigisacAnswersOverview aceita contagem numérica direta", () => {
  const r = mapDigisacAnswersOverview({
    promoters: 80,
    neutrals: 10,
    detractors: 10,
  });
  assertEquals(r.total, 100);
  assertEquals(r.promoters.count, 80);
});
