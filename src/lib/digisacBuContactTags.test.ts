import { describe, expect, it } from "vitest";
import { isExactDigisacBuContactTag, pickExactDigisacBuContactTags } from "./digisacBuContactTags";

describe("isExactDigisacBuContactTag", () => {
  it("aceita B1/B2 exatos, ignorando caixa e espaços", () => {
    expect(isExactDigisacBuContactTag("B1", "B1")).toBe(true);
    expect(isExactDigisacBuContactTag(" b2 ", "B2")).toBe(true);
  });

  it("não confunde com etiquetas compostas", () => {
    expect(isExactDigisacBuContactTag("B1 - Confecção", "B1")).toBe(false);
    expect(isExactDigisacBuContactTag("B2 - Indústrias", "B2")).toBe(false);
  });
});

describe("pickExactDigisacBuContactTags", () => {
  it("escolhe só as etiquetas B1 e B2", () => {
    const picked = pickExactDigisacBuContactTags([
      { id: "1", name: "B1 - Loja de Roupas" },
      { id: "2", name: "B1" },
      { id: "3", name: "B2" },
      { id: "4", name: "B2 - Comércio em Geral" },
    ]);
    expect(picked.B1?.id).toBe("2");
    expect(picked.B2?.id).toBe("3");
  });
});
