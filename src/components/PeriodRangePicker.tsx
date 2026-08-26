import { useEffect, useMemo, useState } from "react";
import { endOfMonth, format, isSameDay, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PeriodPreset = {
  id: string;
  label: string;
  from: Date;
  to: Date;
};

type PeriodRangePickerProps = {
  from: string;
  to: string;
  today: string;
  onChange: (from: string, to: string) => void;
  className?: string;
};

const toKey = (value: Date) => format(value, "yyyy-MM-dd");

const formatRangeLabel = (from: string, to: string) => {
  const start = format(parseISO(from), "dd/MM/yyyy");
  const end = format(parseISO(to), "dd/MM/yyyy");
  return `${start} – ${end}`;
};

function buildPresets(today: Date): PeriodPreset[] {
  return [
    { id: "today", label: "Hoje", from: today, to: today },
    { id: "current_month", label: "Mês atual", from: startOfMonth(today), to: endOfMonth(today) },
    { id: "previous_month", label: "Mês anterior", from: startOfMonth(subMonths(today, 1)), to: endOfMonth(subMonths(today, 1)) },
    { id: "last_7", label: "Últimos 7 dias", from: subDays(today, 6), to: today },
    { id: "last_30", label: "Últimos 30 dias", from: subDays(today, 29), to: today },
    { id: "last_90", label: "Últimos 90 dias", from: subDays(today, 89), to: today },
  ];
}

export function PeriodRangePicker({ from, to, today, onChange, className }: PeriodRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const [visibleMonth, setVisibleMonth] = useState<Date>(parseISO(from));

  const todayDate = useMemo(() => parseISO(today), [today]);
  const presets = useMemo(() => buildPresets(todayDate), [todayDate]);

  useEffect(() => {
    if (!open) return;
    const start = parseISO(from);
    const end = parseISO(to);
    setDraft({ from: start, to: end });
    setVisibleMonth(start);
  }, [open, from, to]);

  const activePresetId = presets.find((preset) => toKey(preset.from) === from && toKey(preset.to) === to)?.id;
  const displayFrom = draft?.from ? toKey(draft.from) : from;
  const displayTo = draft?.to ? toKey(draft.to) : draft?.from ? toKey(draft.from) : to;

  const applyRange = (start: Date, end: Date, close = true) => {
    const [rangeFrom, rangeTo] = start <= end ? [start, end] : [end, start];
    setDraft({ from: rangeFrom, to: rangeTo });
    setVisibleMonth(rangeFrom);
    onChange(toKey(rangeFrom), toKey(rangeTo));
    if (close) setOpen(false);
  };

  return (
    <div className={cn("min-w-0", className)}>
      <label className="text-xs text-muted-foreground mb-1 block">Período</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-10 w-full justify-between px-3 font-normal text-left",
              open && "border-primary",
            )}
            aria-label={`Período ${formatRangeLabel(from, to)}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate tabular-nums">{formatRangeLabel(from, to)}</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-1.5rem)] overflow-hidden p-0" align="start">
          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-col gap-1 border-b p-3 sm:w-48 sm:border-b-0 sm:border-r">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={cn(
                    "h-9 rounded-md px-3 text-left text-sm text-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
                    activePresetId === preset.id && "bg-primary/10 font-medium text-foreground",
                  )}
                  onClick={() => applyRange(preset.from, preset.to)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="p-3">
              <Calendar
                mode="range"
                locale={ptBR}
                month={visibleMonth}
                onMonthChange={setVisibleMonth}
                selected={draft}
                onSelect={(next, selectedDay) => {
                  if (draft?.from && draft.to && selectedDay) {
                    setDraft({ from: selectedDay, to: undefined });
                    return;
                  }
                  setDraft(next);
                  if (next?.from && next.to) {
                    applyRange(next.from, next.to, false);
                  }
                }}
                numberOfMonths={1}
                defaultMonth={parseISO(from)}
                className="p-0"
              />
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {draft?.from && draft.to && isSameDay(draft.from, draft.to)
                  ? format(draft.from, "dd/MM/yyyy")
                  : formatRangeLabel(displayFrom, displayTo)}
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
