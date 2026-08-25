import { describe, expect, it } from "vitest";
import {
  listClippedMonSatWeeks,
  listClippedMonths,
  mondayOfWeek,
  saturdayOfWeek,
} from "./digisacBuPeriods";

describe("digisacBuPeriods", () => {
  it("semana de 17/08/2026 é segunda a sábado", () => {
    expect(mondayOfWeek("2026-08-17")).toBe("2026-08-17");
    expect(saturdayOfWeek("2026-08-17")).toBe("2026-08-22");
    expect(listClippedMonSatWeeks("2026-08-17", "2026-08-22")).toEqual([
      { startDate: "2026-08-17", endDate: "2026-08-22", label: "17/08" },
    ]);
  });

  it("recorta semanas parciais no mês", () => {
    const weeks = listClippedMonSatWeeks("2026-08-01", "2026-08-31");
    expect(weeks[0]).toEqual({ startDate: "2026-08-01", endDate: "2026-08-01", label: "01/08" });
    expect(weeks.some((w) => w.startDate === "2026-08-17" && w.endDate === "2026-08-22")).toBe(true);
    expect(weeks.at(-1)?.endDate).toBe("2026-08-31");
  });

  it("lista o mês recortado no período", () => {
    expect(listClippedMonths("2026-08-17", "2026-08-22")).toEqual([
      { startDate: "2026-08-17", endDate: "2026-08-22", label: "2026-08" },
    ]);
  });
});
