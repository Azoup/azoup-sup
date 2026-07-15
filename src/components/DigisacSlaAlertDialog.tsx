import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, User, Phone, Hash, Calendar } from 'lucide-react';
import type { DigisacSlaNotification } from '@/integrations/digisac/slaTypes';
import { slaNotificationFields, slaNotificationTitle } from '@/integrations/digisac/slaNormalize';

const FIELD_ICONS: Record<string, typeof Hash> = {
  Protocolo: Hash,
  Cliente: User,
  Contato: Phone,
  Analista: User,
  'Início do atendimento': Calendar,
  'Tempo de atendimento': Clock,
};

interface DigisacSlaAlertDialogProps {
  notification: DigisacSlaNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDashboard?: () => void;
}

export function DigisacSlaAlertDialog({
  notification,
  open,
  onOpenChange,
  onOpenDashboard,
}: DigisacSlaAlertDialogProps) {
  if (!notification) return null;

  const fields = slaNotificationFields(notification);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-amber-500/40 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {slaNotificationTitle(notification)}
          </DialogTitle>
          <DialogDescription>
            Atendimento aberto há mais de 40 minutos no Digisac.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-3 rounded-lg border bg-muted/30 p-4">
          {fields.map((field) => {
            const Icon = FIELD_ICONS[field.label] ?? Hash;
            return (
              <div key={field.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 text-sm">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {field.label}
                </dt>
                <dd className="font-medium break-words [overflow-wrap:anywhere] text-right">
                  {field.value}
                </dd>
              </div>
            );
          })}
        </dl>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {onOpenDashboard && (
            <Button type="button" onClick={onOpenDashboard}>
              Abrir Dashboard Digisac
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
