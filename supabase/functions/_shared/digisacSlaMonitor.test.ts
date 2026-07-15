import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ESCALATE_THRESHOLD_MINUTES,
  WARN_THRESHOLD_MINUTES,
  extractTicketProtocol,
  extractTicketStartTime,
  formatDurationMinutes,
  isTicketOpen,
  minutesBetween,
  normalizeOpenTicket,
} from "./digisacSlaMonitor.ts";

Deno.test("extractTicketProtocol lê protocolo ou fallback", () => {
  assertEquals(extractTicketProtocol({ protocol: "20240611001" }), "20240611001");
  assertEquals(extractTicketProtocol({ protocolNumber: "ABC-99" }), "ABC-99");
  assertEquals(extractTicketProtocol({ id: "ticket-uuid-123" }), "#ticket-u");
});

Deno.test("isTicketOpen detecta status aberto e fechado", () => {
  assertEquals(isTicketOpen({ status: "open" }), true);
  assertEquals(isTicketOpen({ status: "in_progress" }), true);
  assertEquals(isTicketOpen({ status: "closed" }), false);
  assertEquals(isTicketOpen({ closedAt: "2024-01-01T10:00:00Z" }), false);
  assertEquals(isTicketOpen({ isOpen: true }), true);
});

Deno.test("normalizeOpenTicket ignora tickets abaixo de 40 min", () => {
  const now = new Date("2024-06-11T12:00:00Z");
  const recent = normalizeOpenTicket({
    id: "t1",
    status: "open",
    protocol: "P001",
    createdAt: "2024-06-11T11:30:00Z",
    lastUser: { id: "u1", name: "Ana" },
  }, now);
  assertEquals(recent, null);

  const old = normalizeOpenTicket({
    id: "t2",
    status: "open",
    protocol: "P002",
    createdAt: "2024-06-11T10:00:00Z",
    lastUser: { id: "u2", name: "Bruno" },
  }, now);
  assertEquals(old?.protocol, "P002");
  assertEquals(old?.analystName, "Bruno");
  assertEquals(old?.durationMinutes, 120);
});

Deno.test("minutesBetween e formatDurationMinutes", () => {
  const start = new Date("2024-06-11T10:00:00Z");
  const end = new Date("2024-06-11T11:05:00Z");
  assertEquals(minutesBetween(start, end), 65);
  assertEquals(formatDurationMinutes(65), "1h 5min");
  assertEquals(formatDurationMinutes(30), "30 min");
});

Deno.test("limiares SLA", () => {
  assertEquals(WARN_THRESHOLD_MINUTES, 40);
  assertEquals(ESCALATE_THRESHOLD_MINUTES, 40);
});

Deno.test("extractTicketStartTime tenta múltiplos campos", () => {
  const d = extractTicketStartTime({ openedAt: "2024-01-15T08:00:00Z" });
  assertEquals(d?.toISOString(), "2024-01-15T08:00:00.000Z");
});
