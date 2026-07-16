import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock,
  Copy,
  Filter,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { usePermissions } from '@/hooks/usePermissions';
import { DigisacSlaAlertDialog } from '@/components/DigisacSlaAlertDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  describeSlaSyncResult,
  slaSyncPreviewLines,
  syncDigisacSlaAlerts,
} from '@/integrations/digisac/slaSync';
import {
  formatSlaDuration,
  formatSlaStartedAt,
  slaAlertToNotification,
  slaClientContact,
  slaClientName,
} from '@/integrations/digisac/slaNormalize';
import type { DigisacSlaAlert } from '@/integrations/digisac/slaTypes';
import { cn } from '@/lib/utils';

const getTodayDateStringBrazil = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
};

const getMonthStartBrazil = () => {
  const today = getTodayDateStringBrazil();
  return `${today.slice(0, 7)}-01`;
};

type StatusFilter = 'all' | 'active' | 'resolved';

/** Limites do dia em America/Sao_Paulo (UTC−3 sem DST). */
function brazilDayBounds(dateYmd: string): { startIso: string; endIso: string } {
  return {
    startIso: `${dateYmd}T00:00:00.000-03:00`,
    endIso: `${dateYmd}T23:59:59.999-03:00`,
  };
}

export default function DigisacSlaHistory() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const { canView } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const today = getTodayDateStringBrazil();
  const monthStart = getMonthStartBrazil();

  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [analystFilter, setAnalystFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [applied, setApplied] = useState({
    dateFrom: monthStart,
    dateTo: today,
    analyst: 'all',
    status: 'all' as StatusFilter,
  });
  const [slaSyncing, setSlaSyncing] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<DigisacSlaAlert | null>(null);

  const { data: alerts = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['digisac-sla-alerts-history', applied.dateFrom, applied.dateTo],
    queryFn: async () => {
      const { startIso } = brazilDayBounds(applied.dateFrom);
      const { endIso } = brazilDayBounds(applied.dateTo);
      const { data, error } = await supabase
        .from('digisac_sla_alerts')
        .select('*')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as DigisacSlaAlert[];
    },
    enabled: !!user && isAdmin,
    staleTime: 30 * 1000,
  });

  const analystOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of alerts) {
      const name = a.analyst_name?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [alerts]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (applied.analyst !== 'all' && (a.analyst_name || 'Sem atendente') !== applied.analyst) {
        return false;
      }
      if (applied.status === 'active' && a.resolved_at) return false;
      if (applied.status === 'resolved' && !a.resolved_at) return false;
      return true;
    });
  }, [alerts, applied]);

  const stats = useMemo(() => {
    const active = filtered.filter((a) => !a.resolved_at).length;
    return {
      total: filtered.length,
      active,
      resolved: filtered.length - active,
    };
  }, [filtered]);

  const applyFilters = () => {
    setApplied({
      dateFrom,
      dateTo,
      analyst: analystFilter,
      status: statusFilter,
    });
  };

  const runSlaSync = async () => {
    if (!isAdmin) return;
    setSlaSyncing(true);
    try {
      const result = await syncDigisacSlaAlerts();
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['digisac-sla-notifications', user.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['digisac-sla-alerts-history'] });
      const preview = slaSyncPreviewLines(result);
      if (result.errors?.length) {
        toast.error('Erro ao verificar SLA', { description: result.errors.join(' · ') });
      } else if (result.notified > 0) {
        toast.warning('Notificações SLA enviadas', {
          description: `${describeSlaSyncResult(result)}${preview.length ? `\n${preview.join('\n')}` : ''}`,
          duration: 15_000,
        });
      } else {
        toast.info('Chamados abertos verificados', {
          description: preview.length
            ? `${describeSlaSyncResult(result)}\n${preview.join('\n')}`
            : describeSlaSyncResult(result),
          duration: 12_000,
        });
      }
    } catch (e) {
      toast.error('Falha na sincronização SLA', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSlaSyncing(false);
    }
  };

  const copyProtocol = async (protocol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(protocol);
      toast.success('Protocolo copiado');
    } catch {
      toast.error('Não foi possível copiar o protocolo');
    }
  };

  const openDashboard = () => {
    setSelectedAlert(null);
    if (canView('digisac_dashboard')) {
      navigate('/digisac-dashboard');
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-heading font-bold">Histórico SLA</h1>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            O histórico de alertas SLA Digisac está disponível apenas para administradores.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Histórico SLA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Atendimentos Digisac que ultrapassaram 40 minutos e geraram alerta no sistema.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 gap-2"
            title="Atualizar listagem"
          >
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            Atualizar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={runSlaSync}
            disabled={slaSyncing}
            className="h-9 gap-2 border-amber-500/50 text-amber-700 dark:text-amber-400"
            title="Verificar chamados abertos e gerar alertas SLA"
          >
            <AlertTriangle className={cn('w-4 h-4', slaSyncing && 'animate-pulse')} />
            {slaSyncing ? 'Verificando…' : 'Verificar SLA'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Total no filtro</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <CircleDot className="h-3.5 w-3.5 text-amber-600" />
              Em aberto
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums text-amber-700 dark:text-amber-400">
              {stats.active}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Resolvidos
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums text-emerald-700 dark:text-emerald-400">
              {stats.resolved}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Filtre por período do alerta, analista e status do chamado.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">De</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-auto"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Até</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-auto"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <span className="text-xs text-muted-foreground">Analista</span>
              <Select value={analystFilter} onValueChange={setAnalystFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os analistas</SelectItem>
                  {analystOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  {alerts.some((a) => !a.analyst_name?.trim()) && (
                    <SelectItem value="Sem atendente">Sem atendente</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <span className="text-xs text-muted-foreground">Status</span>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Em aberto</SelectItem>
                  <SelectItem value="resolved">Resolvidos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={applyFilters} className="h-9 gap-2">
              <Filter className="w-4 h-4" />
              Aplicar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Registros</CardTitle>
          <CardDescription>
            Clique em um registro para ver os detalhes do alerta (mesmo conteúdo da notificação).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              Nenhum alerta SLA encontrado para os filtros selecionados.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Protocolo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Analista</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Tempo</TableHead>
                    <TableHead>Alerta em</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((alert) => (
                    <TableRow
                      key={alert.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedAlert(alert)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium tabular-nums">{alert.protocol}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground"
                            title="Copiar protocolo"
                            onClick={(e) => copyProtocol(alert.protocol, e)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {slaClientName(alert)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-muted-foreground">
                        {slaClientContact(alert)}
                      </TableCell>
                      <TableCell>{alert.analyst_name || 'Sem atendente'}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatSlaStartedAt(alert.started_at)}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                          <Clock className="h-3.5 w-3.5" />
                          {formatSlaDuration(alert.duration_minutes)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(new Date(alert.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {alert.resolved_at ? (
                          <Badge variant="secondary" className="gap-1 font-normal">
                            <CheckCircle2 className="h-3 w-3" />
                            Resolvido
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 font-normal border-amber-500/50 text-amber-700 dark:text-amber-400"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Aberto
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DigisacSlaAlertDialog
        notification={selectedAlert ? slaAlertToNotification(selectedAlert) : null}
        open={!!selectedAlert}
        onOpenChange={(open) => { if (!open) setSelectedAlert(null); }}
        onOpenDashboard={canView('digisac_dashboard') ? openDashboard : undefined}
      />
    </div>
  );
}
