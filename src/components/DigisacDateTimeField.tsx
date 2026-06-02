import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatDigisacDateTimeDisplay,
  toDateFromDigisacValue,
  type DigisacDateTimeValue,
} from "@/lib/digisacDateTimeField";

type DigisacDateTimeFieldProps = {
  label: string;
  value: DigisacDateTimeValue;
  onChange: (value: DigisacDateTimeValue) => void;
  className?: string;
};

export function DigisacDateTimeField({ label, value, onChange, className }: DigisacDateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = toDateFromDigisacValue(value);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-9 w-full sm:w-[200px] justify-start px-3 font-normal text-left",
              !value.date && "text-muted-foreground",
            )}
          >
            <Clock className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate tabular-nums">{formatDigisacDateTimeDisplay(value)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(day) => {
              if (!day) return;
              onChange({
                date: format(day, "yyyy-MM-dd"),
                time: value.time,
              });
            }}
            locale={ptBR}
            initialFocus
          />
          <div className="flex items-center justify-center gap-2 border-t bg-muted/30 px-3 py-2.5">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              type="time"
              value={value.time}
              onChange={(e) => onChange({ ...value, time: e.target.value || "00:00" })}
              className="h-8 w-[7.5rem] border-muted-foreground/20 bg-background text-center tabular-nums"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
