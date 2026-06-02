import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

export type DigisacDateTimeValue = {
  date: string;
  time: string;
};

export function formatDigisacDateTimeDisplay(value: DigisacDateTimeValue): string {
  const parsed = parse(value.date, "yyyy-MM-dd", new Date());
  if (!isValid(parsed)) return `${value.date} ${value.time}`;
  return `${format(parsed, "dd/MM/yyyy", { locale: ptBR })} ${value.time}`;
}

export function toDateFromDigisacValue(value: DigisacDateTimeValue): Date {
  const parsed = parse(value.date, "yyyy-MM-dd", new Date());
  const [h, m] = value.time.split(":").map(Number);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), h || 0, m || 0, 0, 0);
}

export function digisacValueFromDate(date: Date, time?: string): DigisacDateTimeValue {
  return {
    date: format(date, "yyyy-MM-dd"),
    time: time ?? format(date, "HH:mm"),
  };
}
