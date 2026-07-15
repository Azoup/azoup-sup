import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractTicketContact } from "./digisacTicketContact.ts";

Deno.test("extractTicketContact lê contato aninhado", () => {
  const ref = extractTicketContact({
    contact: { name: "Maria Silva", number: "5511999999999" },
  });
  assertEquals(ref, { name: "Maria Silva", contact: "5511999999999" });
});

Deno.test("extractTicketContact lê campos planos", () => {
  const ref = extractTicketContact({
    contactName: "João",
    contactNumber: "11988887777",
  });
  assertEquals(ref, { name: "João", contact: "11988887777" });
});

Deno.test("extractTicketContact retorna null sem dados", () => {
  assertEquals(extractTicketContact({}), null);
});
