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
