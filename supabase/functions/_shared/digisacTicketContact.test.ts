import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractTicketContact,
  extractTicketContactId,
  formatPhoneDisplay,
  parseDigisacContactRecord,
  unwrapDigisacRecord,
} from "./digisacTicketContact.ts";

Deno.test("unwrapDigisacRecord mantém contato no root e data.number aninhado", () => {
  const contact = {
    id: "c1",
    name: "Maria Silva",
    internalName: "Maria - Loja",
    data: { number: "5511999999999", jidId: "5511999999999@c.us" },
  };
  const unwrapped = unwrapDigisacRecord(contact);
  assertEquals(unwrapped?.name, "Maria Silva");
  assertEquals(unwrapped?.internalName, "Maria - Loja");
  assertEquals((unwrapped?.data as Record<string, string>)?.number, "5511999999999");
});

Deno.test("unwrapDigisacRecord não troca contato por data.number apenas", () => {
  // Caso real: GET /contacts/{id} devolve name no root e number em data
  const apiResponse = {
    id: "ec190c63-b244-4b59-8626-246f5ca94f29",
    name: "Adriel Schimack",
    internalName: "Adriel - Avicultura Brasil",
    data: {
      jidId: "5519996090140@c.us",
      number: "5519996090140",
    },
  };
  const parsed = parseDigisacContactRecord(unwrapDigisacRecord(apiResponse)!);
  assertEquals(parsed, {
    name: "Adriel - Avicultura Brasil",
    contact: "+55 (19) 99609-0140",
  });
});

Deno.test("parseDigisacContactRecord prioriza internalName e número em data", () => {
  const ref = parseDigisacContactRecord({
    name: "Maria Silva",
    internalName: "Maria - Loja X",
    data: { number: "5511987654321" },
  });
  assertEquals(ref, { name: "Maria - Loja X", contact: "+55 (11) 98765-4321" });
});

Deno.test("extractTicketContactId lê contactId do ticket", () => {
  assertEquals(extractTicketContactId({ contactId: "abc-123" }), "abc-123");
});

Deno.test("extractTicketContact lê contato aninhado", () => {
  const ref = extractTicketContact({
    contact: { name: "João", number: "11988887777" },
  });
  assertEquals(ref?.name, "João");
});

Deno.test("formatPhoneDisplay formata celular BR", () => {
  assertEquals(formatPhoneDisplay("5511999999999"), "+55 (11) 99999-9999");
});
