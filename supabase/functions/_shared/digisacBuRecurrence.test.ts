import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRecurrence,
  classifyRecurrence,
  contactGroupKey,
  extractTicketSubject,
  extractTicketProtocol,
  type RecurrenceTicketInput,
} from "./digisacBuRecurrence.ts";

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

Deno.test("classifica recorrência 1 / 2 / 3-4 / 5+", () => {
  assertEquals(classifyRecurrence(1), "unico");
  assertEquals(classifyRecurrence(2), "retorno");
  assertEquals(classifyRecurrence(4), "recorrente");
  assertEquals(classifyRecurrence(5), "alta_recorrencia");
});

Deno.test("agrupa o mesmo telefone e calcula taxa", () => {
  const { contacts, summary } = buildRecurrence([
    ticket({ id: "t1", contactId: "c1", phone: "5511999999999" }),
    ticket({ id: "t2", contactId: "c2", phone: "(11) 99999-9999", date: "2026-08-25" }),
    ticket({ id: "t3", phone: "11988887777", name: "Outro" }),
  ]);
  assertEquals(contactGroupKey("5511999999999", "a"), contactGroupKey("(11) 99999-9999", "b"));
  assertEquals(contacts.length, 2);
  assertEquals(contacts[0].atendimentos, 2);
  assertEquals(summary.contatosRecorrentes, 1);
  assertEquals(summary.taxaRecorrencia, 50);
});

Deno.test("extractTicketSubject lê assunto de chamado (tópico) e resumo", () => {
  assertEquals(extractTicketSubject({ ticketTopics: [{ name: "Troca de peça" }] }), "Troca de peça");
  assertEquals(extractTicketSubject({ comments: "Cliente pediu troca" }), "Cliente pediu troca");
  assertEquals(
    extractTicketSubject({ ticketTopics: [{ name: "Troca" }], comments: "Peça com defeito" }),
    "Troca — Peça com defeito",
  );
  const catalog = new Map([["topic-1", "2 DADOS EM CONFLITO NO USO DO SISTEMA"]]);
  assertEquals(
    extractTicketSubject({ ticketTopics: [{ ticketTopicId: "topic-1" }] }, catalog),
    "2 DADOS EM CONFLITO NO USO DO SISTEMA",
  );
});

Deno.test("extractTicketProtocol usa o protocolo da plataforma e ignora UUID", () => {
  assertEquals(extractTicketProtocol({ protocol: "2025120247" }), "2025120247");
  assertEquals(extractTicketProtocol({ number: "2025120247" }), "2025120247");
  assertEquals(extractTicketProtocol({ id: "fd4db4df-aaaa-bbbb-cccc-dddddddddddd" }), "");
  assertEquals(extractTicketProtocol({ protocol: "#fd4db4df" }), "");
});
