import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Building2,
  FileText,
  Filter,
  Headset,
  Loader2,
  Percent,
  Phone,
  RefreshCw,
  Repeat2,
  Search,
  Users,
  HelpCircle,
  ArrowLeft,
} from 'lucide-react';
import { digisacApi } from '@/integrations/digisac/api';
import { downloadRecurrenceContactsPdf } from '@/lib/recurrenceContactsPdf';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { QueryLoadState } from '@/components/QueryLoadState';
import { PeriodRangePicker } from '@/components/PeriodRangePicker';
import { matchesContactSearch, filterContactsByAnalyst, listAnalystNames, summarizeContacts, RECURRENCE_CLASS_LABEL, type RecurrenceClass, type RecurrenceContactRow } from '@/lib/digisacBuRecurrence';
import {
  parseRecurrenceDepartmentKey,
  RECURRENCE_DEPARTMENT_LABEL,
  type RecurrenceDepartmentKey,
} from '@/lib/digisacRecurrenceDepartments';
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
    return format(new Date(), 'yyyy-MM-dd');
  }
};

const formatDay = (value: string) => {
  try {
    return format(parseISO(value), 'dd/MM/yyyy');
  } catch {
    return value;
  }
};

const formatPct = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;
const formatAvg = (value: number) => value.toFixed(1).replace('.', ',');

const classBadgeClass: Record<RecurrenceClass, string> = {
  unico: 'border-transparent bg-muted text-muted-foreground',
  retorno: 'border-transparent bg-primary/15 text-primary',
  recorrente: 'border-transparent bg-amber-100 text-amber-900',
  alta_recorrencia: 'border-transparent bg-destructive/15 text-destructive',
};

const ContactRecurrence = () => {
  const todayStr = getTodayDateStringBrazil();
  const today = parseISO(todayStr);
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [monthFilter, setMonthFilter] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState<'all' | 'B1' | 'B2'>('all');
  const [analystFilter, setAnalystFilter] = useState('all');
  const [departmentKey, setDepartmentKey] = useState<RecurrenceDepartmentKey>('suporte');
  const [classFilter, setClassFilter] = useState<'all' | RecurrenceClass>('all');
  const [selected, setSelected] = useState<RecurrenceContactRow | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const applyMonthFilter = (month: string) => {
    setMonthFilter(month);
    if (month) {
      const d = parseISO(month + '-01');
      setDateFrom(format(startOfMonth(d), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(d), 'yyyy-MM-dd'));
    }
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bu-digisac-recurrence', dateFrom, dateTo, departmentKey, refreshTick],
    queryFn: () => digisacApi.getBuRecurrence({
      startDate: dateFrom,
      endDate: dateTo,
      departmentKey,
    }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const applyDepartmentFilter = (value: string) => {
    const next = parseRecurrenceDepartmentKey(value);
    setDepartmentKey(next);
    setAnalystFilter('all');
    setSelected(null);
  };

  const months = useMemo(() => {
    const result = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(today, i);
      result.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: ptBR }) });
    }
    return result;
  }, [today]);

  const scopedContacts = useMemo(() => {
    const byAnalyst = filterContactsByAnalyst(data?.contacts ?? [], analystFilter);
    return byAnalyst.filter((row) => {
      if (unitFilter !== 'all' && !row.units.includes(unitFilter)) return false;
      if (classFilter !== 'all' && row.classification !== classFilter) return false;
      return true;
    });
  }, [data, analystFilter, unitFilter, classFilter]);

  const filteredContacts = useMemo(() => {
    return scopedContacts.filter((row) => matchesContactSearch(row, search));
  }, [scopedContacts, search]);

  const summary = useMemo(() => summarizeContacts(scopedContacts), [scopedContacts]);
  const analystNames = useMemo(() => listAnalystNames(data?.contacts ?? []), [data]);

  const handleGeneratePdf = useCallback(() => {
    if (isLoading) return;
    setPdfGenerating(true);
    try {
      downloadRecurrenceContactsPdf({
        contacts: filteredContacts,
        filters: {
          dateFrom,
          dateTo,
          departmentKey,
          departmentLabel: RECURRENCE_DEPARTMENT_LABEL[departmentKey],
          unitFilter,
          classFilter,
          analystFilter,
          search,
        },
      });
      if (filteredContacts.length === 0) {
        toast.message('PDF gerado sem contatos no resultado filtrado.');
      } else {
        toast.success(`PDF gerado com ${filteredContacts.length} contato(s).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? `Erro ao gerar PDF: ${e.message}` : 'Erro ao gerar PDF.');
    } finally {
      setPdfGenerating(false);
    }
  }, [
    analystFilter,
    classFilter,
    dateFrom,
    dateTo,
    departmentKey,
    filteredContacts,
    isLoading,
    search,
    unitFilter,
  ]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Recorrências</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Headset className="h-4 w-4" />
            Recorrência por telefone — {RECURRENCE_DEPARTMENT_LABEL[departmentKey]}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard-bu">
              <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard B.U.
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setRefreshTick((n) => n + 1); void refetch(); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || pdfGenerating}
            onClick={handleGeneratePdf}
          >
            {pdfGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Gerar PDF
          </Button>
        </div>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex flex-col shrink-0">
              <span className="text-xs mb-1 block invisible select-none" aria-hidden="true">&nbsp;</span>
              <div className="flex h-10 items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="h-4 w-4" /> Filtros
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 flex-1 w-full min-w-0">
              <PeriodRangePicker
                className="sm:w-[15.75rem] shrink-0"
                from={dateFrom}
                to={dateTo}
                today={todayStr}
                onChange={(nextFrom, nextTo) => {
                  setDateFrom(nextFrom);
                  setDateTo(nextTo);
                  setMonthFilter('');
                }}
              />
              <div className="sm:w-48 shrink-0">
                <label className="text-xs text-muted-foreground mb-1 block">Departamento</label>
                <Select value={departmentKey} onValueChange={applyDepartmentFilter}>
                  <SelectTrigger><SelectValue placeholder="Departamento" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="suporte">{RECURRENCE_DEPARTMENT_LABEL.suporte}</SelectItem>
                    <SelectItem value="confec">{RECURRENCE_DEPARTMENT_LABEL.confec}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:w-44 shrink-0">
                <label className="text-xs text-muted-foreground mb-1 block">Mês</label>
                <Select value={monthFilter || undefined} onValueChange={applyMonthFilter}>
                  <SelectTrigger><SelectValue placeholder="Selecionar mês" /></SelectTrigger>
                  <SelectContent>
                    {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:w-64 shrink-0">
                <label className="text-xs text-muted-foreground mb-1 block">Analista responsável</label>
                <Select value={analystFilter} onValueChange={setAnalystFilter}>
                  <SelectTrigger><SelectValue placeholder="Todos os analistas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os analistas</SelectItem>
                    {analystNames.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 whitespace-pre-line">
            {`Filtros de estatística integrados com Digisac.
Departamentos Suporte e Azoup Confec, com tags de contato B1/B2.`}
          </p>
        </CardContent>
      </Card>

      <QueryLoadState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        errorMessage={error instanceof Error ? error.message : 'Não foi possível carregar a recorrência no Digisac.'}
        loadingClassName="py-12"
      >
        <>
          {(data?.warnings?.length ?? 0) > 0 && (
            <p className="text-sm text-amber-700">{data?.warnings?.join(' ')}</p>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={<HelpCircle className="h-5 w-5 text-primary" />} label="Total de atendimentos" value={summary?.totalAtendimentos ?? 0} />
            <Kpi icon={<Phone className="h-5 w-5 text-accent" />} label="Contatos únicos" value={summary?.contatosUnicos ?? 0} />
            <Kpi icon={<Repeat2 className="h-5 w-5 text-primary" />} label="Contatos recorrentes" value={summary?.contatosRecorrentes ?? 0} />
            <Kpi icon={<Users className="h-5 w-5 text-accent" />} label="Total de retornos" value={summary?.totalRetornos ?? 0} />
            <Kpi icon={<Percent className="h-5 w-5 text-primary" />} label="Taxa de recorrência" value={formatPct(summary?.taxaRecorrencia ?? 0)} />
            <Kpi icon={<Building2 className="h-5 w-5 text-accent" />} label="Média por contato" value={formatAvg(summary?.mediaAtendimentos ?? 0)} />
          </div>

          <Card className="border shadow-sm">
            <CardContent className="py-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Pesquisar por nome ou telefone"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={unitFilter} onValueChange={(v) => setUnitFilter(v as 'all' | 'B1' | 'B2')}>
                  <SelectTrigger className="sm:w-40"><SelectValue placeholder="Unidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">B1 e B2</SelectItem>
                    <SelectItem value="B1">B1</SelectItem>
                    <SelectItem value="B2">B2</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={classFilter} onValueChange={(v) => setClassFilter(v as 'all' | RecurrenceClass)}>
                  <SelectTrigger className="sm:w-44"><SelectValue placeholder="Classificações" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Classificações</SelectItem>
                    {(Object.keys(RECURRENCE_CLASS_LABEL) as RecurrenceClass[]).map((key) => (
                      <SelectItem key={key} value={key}>{RECURRENCE_CLASS_LABEL[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="default"
                  className="sm:w-auto"
                  disabled={isLoading || pdfGenerating}
                  onClick={handleGeneratePdf}
                >
                  {pdfGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  Gerar PDF
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-right">Atendimentos</TableHead>
                      <TableHead className="text-right">Retornos</TableHead>
                      <TableHead>Classificação</TableHead>
                      <TableHead>Primeiro</TableHead>
                      <TableHead>Último</TableHead>
                      <TableHead>Analista</TableHead>
                      <TableHead>Assunto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          Nenhum contato no período filtrado.
                        </TableCell>
                      </TableRow>
                    ) : filteredContacts.map((row) => (
                      <TableRow
                        key={row.key}
                        className="cursor-pointer"
                        onClick={() => setSelected(row)}
                      >
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.phone}</TableCell>
                        <TableCell className="text-right">{row.atendimentos}</TableCell>
                        <TableCell className="text-right">{row.retornos}</TableCell>
                        <TableCell>
                          <Badge className={cn(classBadgeClass[row.classification])}>{row.classificationLabel}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDay(row.firstAtendimento)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDay(row.lastAtendimento)}</TableCell>
                        <TableCell>{row.analystName}</TableCell>
                        <TableCell className="max-w-[220px] truncate" title={row.subject}>
                          {[...row.history].reverse().find((item) => item.subject && item.subject !== "—")?.subject || row.subject}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Clique em um contato para ver o histórico no período. Assunto e protocolo vêm da finalização do ticket no Digisac.
                O PDF usa o período, a unidade, a classificação, o analista e a pesquisa atuais.
              </p>
            </CardContent>
          </Card>
        </>
      </QueryLoadState>

      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.phone} · {selected.atendimentos} atendimento(s) · {selected.classificationLabel}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                {selected.history.map((item) => (
                  <div key={item.ticketId} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{formatDay(item.date)}</p>
                      <Badge variant="outline">{item.unit}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Analista: {item.analystName}</p>
                    <p className="text-sm text-muted-foreground">
                      Protocolo: {item.protocol && item.protocol !== "—" ? item.protocol : "—"}
                    </p>
                    <p className="text-sm">
                      Assunto: {item.subject && item.subject !== "—" ? item.subject : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="py-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          <p className="text-xl font-heading font-bold mt-0.5">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default ContactRecurrence;
