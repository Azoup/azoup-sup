export function addCalendarDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function mondayOfWeek(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  return addCalendarDays(dateStr, mondayOffset);
}

export function saturdayOfWeek(monday: string): string {
  return addCalendarDays(monday, 5);
}

export function clipDate(dateStr: string, min: string, max: string): string {
  if (dateStr < min) return min;
  if (dateStr > max) return max;
  return dateStr;
}

export type DigisacBuDateBucket = {
  startDate: string;
  endDate: string;
  label: string;
};

function formatDayMonth(dateStr: string): string {
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
}

/** Semanas de trabalho segunda–sábado recortadas no intervalo filtrado. */
export function listClippedMonSatWeeks(
  startDate: string,
  endDate: string,
  max = 8,
): DigisacBuDateBucket[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const buckets: DigisacBuDateBucket[] = [];
  let monday = mondayOfWeek(startDate);
  while (monday <= endDate && buckets.length < max) {
    const saturday = saturdayOfWeek(monday);
    const from = clipDate(monday, startDate, endDate);
    const to = clipDate(saturday, startDate, endDate);
    if (from <= to) {
      buckets.push({
        startDate: from,
        endDate: to,
        label: formatDayMonth(from),
      });
    }
    monday = addCalendarDays(monday, 7);
  }
  return buckets;
}

export function listClippedMonths(
  startDate: string,
  endDate: string,
  max = 6,
): DigisacBuDateBucket[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const buckets: DigisacBuDateBucket[] = [];
  let year = Number(startDate.slice(0, 4));
  let month = Number(startDate.slice(5, 7));
  while (buckets.length < max) {
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const monthEnd = addCalendarDays(nextMonth, -1);
    if (monthStart.slice(0, 7) > endDate.slice(0, 7)) break;
    const from = clipDate(monthStart, startDate, endDate);
    const to = clipDate(monthEnd, startDate, endDate);
    if (from <= to) {
      buckets.push({
        startDate: from,
        endDate: to,
        label: monthStart.slice(0, 7),
      });
    }
    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }
  return buckets;
}
