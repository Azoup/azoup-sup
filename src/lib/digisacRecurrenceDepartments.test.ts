import { describe, expect, it } from "vitest";
import {
  parseRecurrenceDepartmentKey,
  pickConfecDepartment,
  pickRecurrenceDepartment,
  pickRecurrenceDepartmentId,
  RECURRENCE_DEPARTMENT_LABEL,
} from "./digisacRecurrenceDepartments";

const departments = [
  { id: "com", name: "Comercial" },
  { id: "sup", name: "Suporte" },
  { id: "conf", name: "Azoup Confec" },
];

describe("digisacRecurrenceDepartments", () => {
  it("aceita só suporte e confec, com suporte como padrão", () => {
    expect(parseRecurrenceDepartmentKey("confec")).toBe("confec");
    expect(parseRecurrenceDepartmentKey("suporte")).toBe("suporte");
    expect(parseRecurrenceDepartmentKey("all")).toBe("suporte");
    expect(parseRecurrenceDepartmentKey(undefined)).toBe("suporte");
    expect(RECURRENCE_DEPARTMENT_LABEL.confec).toBe("Azoup Confec");
  });

  it("encontra Azoup Confec pelo nome exato ou variação", () => {
    expect(pickConfecDepartment(departments)?.id).toBe("conf");
    expect(
      pickConfecDepartment([
        { id: "1", name: "Suporte" },
        { id: "2", name: "Azoup Confecção" },
      ])?.id,
    ).toBe("2");
  });

  it("não confunde etiqueta B1 - Confecção com departamento quando há Azoup Confec", () => {
    expect(
      pickConfecDepartment([
        { id: "tag-like", name: "B1 - Confecção" },
        { id: "real", name: "Azoup Confec" },
      ])?.id,
    ).toBe("real");
  });

  it("resolve o departamento da recorrência pela chave", () => {
    expect(pickRecurrenceDepartment(departments, "suporte")?.name).toBe("Suporte");
    expect(pickRecurrenceDepartmentId(departments, "confec")).toBe("conf");
  });
});
