import { useEffect, useMemo, useState } from 'react';
import { endOfMonth, format, isSameDay, startOfDay, startOfMonth, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronDown, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ConfecPeriodValue =
  | { kind: 'board' }
  | { kind: 'newest' }
  | { kind: 'oldest' }
  | { kind: 'range'; from: string; to: string };

type Draft =
  | { kind: 'none' }
  | { kind: 'newest' }
  | { kind: 'oldest' }
  | { kind: 'range'; from: Date; to?: Date };

type PresetId = 'newest' | 'oldest' | 'current_month' | 'last_7';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'newest', label: 'Mais recentes' },
  { id: 'oldest', label: 'Mais antigos' },
  { id: 'current_month', label: 'Mês atual' },
  { id: 'last_7', label: 'Últimos 7 dias' },
];

function toKey(value: Date) {
  return format(value, 'yyyy-MM-dd');
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatRangeLabel(from: string, to: string) {
  const start = format(parseDateKey(from), 'dd/MM/yyyy');
  const end = format(parseDateKey(to), 'dd/MM/yyyy');
  return start === end ? start : `${start} – ${end}`;
}

export function isCardCreatedInRange(createdAt: string, from: string, to: string) {
  const day = format(new Date(createdAt), 'yyyy-MM-dd');
  return day >= from && day <= to;
}

function valueToDraft(value: ConfecPeriodValue): Draft {
  if (value.kind === 'newest' || value.kind === 'oldest') return { kind: value.kind };
  if (value.kind === 'range') {
    return { kind: 'range', from: parseDateKey(value.from), to: parseDateKey(value.to) };
  }
  return { kind: 'none' };
}

export function ConfecKanbanPeriodFilter({
  value,
  onChange,
}: {
  value: ConfecPeriodValue;
  onChange: (next: ConfecPeriodValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ kind: 'none' });
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const today = useMemo(() => startOfDay(new Date()), []);
  const monthFrom = useMemo(() => startOfMonth(today), [today]);
  const monthTo = useMemo(() => startOfDay(endOfMonth(today)), [today]);
  const last7From = useMemo(() => subDays(today, 6), [today]);

  useEffect(() => {
    if (!open) return;
    const next = valueToDraft(value);
    setDraft(next);
    setVisibleMonth(next.kind === 'range' ? next.from : startOfMonth(today));
  }, [open, today, value]);

  const activePreset = useMemo<PresetId | null>(() => {
    if (draft.kind === 'newest' || draft.kind === 'oldest') return draft.kind;
    if (draft.kind !== 'range' || !draft.to) return null;
    if (isSameDay(draft.from, monthFrom) && isSameDay(draft.to, monthTo)) return 'current_month';
    if (isSameDay(draft.from, last7From) && isSameDay(draft.to, today)) return 'last_7';
    return null;
  }, [draft, last7From, monthFrom, monthTo, today]);

  const triggerLabel = useMemo(() => {
    if (value.kind === 'board') return 'Período';
    if (value.kind === 'newest') return 'Mais recentes';
    if (value.kind === 'oldest') return 'Mais antigos';
    if (value.from === toKey(monthFrom) && value.to === toKey(monthTo)) return 'Mês atual';
    if (value.from === toKey(last7From) && value.to === toKey(today)) return 'Últimos 7 dias';
    return formatRangeLabel(value.from, value.to);
  }, [last7From, monthFrom, monthTo, today, value]);

  const draftLabel = useMemo(() => {
    if (draft.kind === 'newest') return 'Mais recentes';
    if (draft.kind === 'oldest') return 'Mais antigos';
    if (draft.kind === 'range') {
      const from = toKey(draft.from);
      const to = toKey(draft.to ?? draft.from);
      return formatRangeLabel(from, to);
    }
    return 'Selecione um período';
  }, [draft]);

  const selectPreset = (id: PresetId) => {
    if (id === 'newest' || id === 'oldest') {
      setDraft({ kind: id });
      return;
    }
    if (id === 'current_month') {
      setDraft({ kind: 'range', from: monthFrom, to: monthTo });
      setVisibleMonth(monthFrom);
      return;
    }
    setDraft({ kind: 'range', from: last7From, to: today });
    setVisibleMonth(last7From);
  };

  const apply = () => {
    if (draft.kind === 'newest' || draft.kind === 'oldest') {
      onChange({ kind: draft.kind });
    } else if (draft.kind === 'range') {
      const from = draft.from;
      const to = draft.to ?? draft.from;
      const [start, end] = from <= to ? [from, to] : [to, from];
      onChange({ kind: 'range', from: toKey(start), to: toKey(end) });
    } else {
      onChange({ kind: 'board' });
    }
    setOpen(false);
  };

  const calendarSelected: DateRange | undefined =
    draft.kind === 'range' ? { from: draft.from, to: draft.to } : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-8 shrink-0 gap-1.5 px-2.5 text-xs font-normal',
            value.kind !== 'board' && 'border-primary',
          )}
          aria-label={`Período: ${triggerLabel}`}
        >
          <CalendarIcon className="text-muted-foreground" />
          <span>{triggerLabel}</span>
          {value.kind !== 'board' && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar período"
              className="inline-flex text-muted-foreground hover:text-foreground"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange({ kind: 'board' });
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                onChange({ kind: 'board' });
              }}
            >
              <X />
            </span>
          )}
          <ChevronDown className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[calc(100vw-1.5rem)] overflow-hidden p-0" align="start">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-base font-semibold">Período</span>
          <button
            type="button"
            className="rounded-sm text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col gap-1 border-b p-3 sm:w-44 sm:border-b-0 sm:border-r">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  'rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  activePreset === preset.id && 'bg-accent font-medium text-foreground',
                )}
                onClick={() => selectPreset(preset.id)}
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
              selected={calendarSelected}
              onSelect={(next, selectedDay) => {
                if (draft.kind === 'range' && draft.from && draft.to && selectedDay) {
                  setDraft({ kind: 'range', from: selectedDay });
                  return;
                }
                if (!next?.from) {
                  setDraft({ kind: 'none' });
                  return;
                }
                setDraft({ kind: 'range', from: next.from, to: next.to });
              }}
              numberOfMonths={1}
              className="p-0"
              classNames={{
                caption_label: 'text-sm font-semibold',
                day_today:
                  'text-orange-500 font-semibold aria-selected:bg-primary aria-selected:text-primary-foreground',
              }}
              formatters={{
                formatCaption: (month) => {
                  const label = format(month, 'LLLL yyyy', { locale: ptBR });
                  return label.charAt(0).toUpperCase() + label.slice(1);
                },
                formatWeekdayName: (date) => format(date, 'EEEEE', { locale: ptBR }).toUpperCase(),
              }}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">{draftLabel}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={apply}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
