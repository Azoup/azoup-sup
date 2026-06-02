/** Converte data + hora (Brasília) para ISO UTC no formato Digisac. */
const BRAZIL_UTC_OFFSET_HOURS = 3;

export function formatDigisacDateOnly(value?: string): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}

export function parseTimeParts(time?: string): { hour: number; minute: number; second: number } | undefined {
  if (!time?.trim()) return undefined;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] != null ? Number(match[3]) : 0;
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  return { hour, minute, second };
}

export function toDigisacPeriodIso(
  dateOnly: string | undefined,
  boundary: "start" | "end",
  time?: string,
): string | undefined {
  const normalized = formatDigisacDateOnly(dateOnly);
  if (!normalized) return undefined;

  const [year, month, day] = normalized.split("-").map(Number);
  const custom = parseTimeParts(time);

  if (!custom) {
    if (boundary === "start") {
      return new Date(Date.UTC(year, month - 1, day, BRAZIL_UTC_OFFSET_HOURS, 0, 0, 0)).toISOString();
    }
    return new Date(Date.UTC(year, month - 1, day + 1, BRAZIL_UTC_OFFSET_HOURS - 1, 59, 59, 999)).toISOString();
  }

  const { hour, minute, second } = custom;
  const isEndHmOnly = boundary === "end" && !!time?.match(/^\d{1,2}:\d{2}$/);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour + BRAZIL_UTC_OFFSET_HOURS,
      minute,
      isEndHmOnly ? 59 : second,
      isEndHmOnly ? 999 : 0,
    ),
  ).toISOString();
}
