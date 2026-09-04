import { describe, expect, it } from "vitest";
import {
  buildRecurrence,
  classifyRecurrence,
  contactGroupKey,
  filterContactsByAnalyst,
  listAnalystNames,
  matchesContactSearch,
  formatPhoneDisplay,
  normalizePhoneKey,
  summarizeContacts,
  type RecurrenceTicketInput,
} from "./digisacBuRecurrence";

const ticket = (partial: Partial<RecurrenceTicketInput> & { id: string }): RecurrenceTicketInput => ({
  contactId: partial.contactId ?? `c-${partial.id}`,
  date: partial.date ?? "2026-08-24",
  sortAt: partial.sortAt ?? `${partial.date ?? "2026-08-24"}T10:00:00.000Z`,
  phone: partial.phone ?? "+55 (19) 99999-0001",
  name: partial.name ?? "Maria",
  attendantName: partial.attendantName ?? "Ana",
  attendantUserId: partial.attendantUserId ?? "u1",
  subject: partial.subject ?? "",
  protocol: partial.protocol ?? partial.id,
  unit: partial.unit ?? "B1",
  ...partial,
});

describe("digisacBuRecurrence", () => {
  it("classifica 1, 2, 3-4 e 5+", () => {
    expect(classifyRecurrence(1)).toBe("unico");
    expect(classifyRecurrence(2)).toBe("retorno");
    expect(classifyRecurrence(3)).toBe("recorrente");
    expect(classifyRecurrence(4)).toBe("recorrente");
    expect(classifyRecurrence(5)).toBe("alta_recorrencia");
  });

  it("agrupa o mesmo telefone com e sem 55", () => {
    expect(normalizePhoneKey("+55 (19) 99609-0140")).toBe("19996090140");
    expect(normalizePhoneKey("19996090140")).toBe("19996090140");
    expect(contactGroupKey("+55 (19) 99609-0140", "a")).toBe(contactGroupKey("19996090140", "b"));
  });

  it("formata números crus do Digisac no padrão da tela", () => {
    expect(formatPhoneDisplay("551936049825")).toBe("+55 (19) 3604-9825");
    expect(formatPhoneDisplay("554498068598")).toBe("+55 (44) 9806-8598");
    expect(formatPhoneDisplay("5511999999999")).toBe("+55 (11) 99999-9999");
    expect(formatPhoneDisplay("+55 (19) 98168-9022")).toBe("+55 (19) 98168-9022");
    expect(formatPhoneDisplay("11988887777")).toBe("+55 (11) 98888-7777");
  });

  it("exibe o telefone formatado na linha de recorrência", () => {
    const { contacts } = buildRecurrence([
      ticket({ id: "t1", phone: "551936049825", name: "Jakeline" }),
    ]);
    expect(contacts[0].phone).toBe("+55 (19) 3604-9825");
  });

  it("junta dois contactId do mesmo telefone em uma linha", () => {
    const { contacts, summary } = buildRecurrence([
      ticket({ id: "t1", contactId: "c1", phone: "5511999999999", date: "2026-08-24" }),
      ticket({ id: "t2", contactId: "c2", phone: "(11) 99999-9999", date: "2026-08-25", attendantName: "Bia" }),
    ]);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].atendimentos).toBe(2);
    expect(contacts[0].retornos).toBe(1);
    expect(contacts[0].classification).toBe("retorno");
    expect(contacts[0].lastAtendimento).toBe("2026-08-25");
    expect(contacts[0].analystName).toBe("Bia");
    expect(summary.contatosUnicos).toBe(1);
    expect(summary.contatosRecorrentes).toBe(1);
    expect(summary.totalRetornos).toBe(1);
    expect(summary.taxaRecorrencia).toBe(100);
  });

  it("calcula taxa e média no período", () => {
    const { summary, contacts } = buildRecurrence([
      ticket({ id: "a1", phone: "11911111111", name: "A" }),
      ticket({ id: "b1", phone: "11922222222", name: "B", date: "2026-08-24" }),
      ticket({ id: "b2", phone: "11922222222", name: "B", date: "2026-08-25" }),
      ticket({ id: "b3", phone: "11922222222", name: "B", date: "2026-08-26" }),
    ]);
    expect(summary.totalAtendimentos).toBe(4);
    expect(summary.contatosUnicos).toBe(2);
    expect(summary.contatosRecorrentes).toBe(1);
    expect(summary.totalRetornos).toBe(2);
    expect(summary.taxaRecorrencia).toBe(50);
    expect(summary.mediaAtendimentos).toBe(2);
    expect(contacts[0].name).toBe("B");
    expect(contacts[0].atendimentos).toBe(3);
    expect(contacts[0].classificationLabel).toBe("Recorrente");
  });

  it("usa contactId quando não há telefone", () => {
    const { contacts } = buildRecurrence([
      ticket({ id: "x1", contactId: "cid-1", phone: "" }),
      ticket({ id: "x2", contactId: "cid-2", phone: "" }),
    ]);
    expect(contacts).toHaveLength(2);
  });

  it("pesquisa por nome ou dígitos do telefone", () => {
    const row = { name: "Maria Silva", phone: "+55 (19) 99609-0140" };
    expect(matchesContactSearch(row, "maria")).toBe(true);
    expect(matchesContactSearch(row, "99609")).toBe(true);
    expect(matchesContactSearch(row, "João")).toBe(false);
  });

  it("filtra classificação retorno e alta recorrência", () => {
    const { contacts } = buildRecurrence([
      ticket({ id: "u1", phone: "11911111111", name: "Único" }),
      ticket({ id: "r1", phone: "11922222222", name: "Retorno", date: "2026-08-24" }),
      ticket({ id: "r2", phone: "11922222222", name: "Retorno", date: "2026-08-25" }),
      ticket({ id: "a1", phone: "11933333333", name: "Alta", date: "2026-08-20" }),
      ticket({ id: "a2", phone: "11933333333", name: "Alta", date: "2026-08-21" }),
      ticket({ id: "a3", phone: "11933333333", name: "Alta", date: "2026-08-22" }),
      ticket({ id: "a4", phone: "11933333333", name: "Alta", date: "2026-08-23" }),
      ticket({ id: "a5", phone: "11933333333", name: "Alta", date: "2026-08-24" }),
    ]);
    const retornos = contacts.filter((row) => row.classification === "retorno");
    expect(retornos).toHaveLength(1);
    expect(retornos[0].classificationLabel).toBe("Retorno");
    const altas = contacts.filter((row) => row.classification === "alta_recorrencia");
    expect(altas).toHaveLength(1);
    expect(altas[0].name).toBe("Alta");
  });
});
