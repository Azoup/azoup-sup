import { formatDevTicketNumber } from '@/lib/devKanbanTicketNumber';
import { cn } from '@/lib/utils';

type DevTicketNumberBadgeProps = {
  ticketNumber: number | null | undefined;
  /** compact = só o número; default = com rótulo "Ticket" */
  variant?: 'default' | 'compact' | 'field';
  className?: string;
};

/** Exibe o número do ticket DEV de forma destacada para busca e identificação. */
export function DevTicketNumberBadge({
  ticketNumber,
  variant = 'default',
  className,
}: DevTicketNumberBadgeProps) {
  const formatted = formatDevTicketNumber(ticketNumber);
  if (!formatted) return null;

  if (variant === 'compact') {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-primary',
          className,
        )}
        title={`Ticket ${formatted}`}
      >
        {formatted}
      </span>
    );
  }

  if (variant === 'field') {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2',
          className,
        )}
      >
        <span className="text-xs font-medium text-muted-foreground">Nº do ticket</span>
        <span className="font-mono text-sm font-bold tabular-nums text-primary">{formatted}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-primary/35 bg-primary/10 px-2 py-1',
        className,
      )}
      title={`Número do ticket: ${formatted}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Ticket
      </span>
      <span className="font-mono text-xs font-bold tabular-nums text-primary">{formatted}</span>
    </div>
  );
}
