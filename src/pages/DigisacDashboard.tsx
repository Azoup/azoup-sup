import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DigisacMappingModal } from "@/components/DigisacMappingModal";
import {
  digisacApi,
  DIGISAC_DASHBOARD_FILTER_DEFAULTS,
  type DigisacDashboardQueryFilters,
} from "@/integrations/digisac/api";
import { Clock, Ticket, Users, Filter, MessageSquare, Hourglass, Timer, CheckCircle2, CircleDot, RefreshCw, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Data "hoje" alinhada ao calendário do Digisac (America/Sao_Paulo), evitando dia errado em outros fusos. */
const getTodayDateStringBrazil = () => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
};

export default function DigisacDashboard() {
  const today = getTodayDateStringBrazil();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [analystId, setAnalystId] = useState<string>("all");
  const [periodType, setPeriodType] = useState<DigisacDashboardQueryFilters["periodType"]>(
    DIGISAC_DASHBOARD_FILTER_DEFAULTS.periodType,
  );
  const [ticketStatus, setTicketStatus] = useState<DigisacDashboardQueryFilters["status"]>(
    DIGISAC_DASHBOARD_FILTER_DEFAULTS.status,
  );
  const [userParticipation, setUserParticipation] = useState<DigisacDashboardQueryFilters["userParticipation"]>(
    DIGISAC_DASHBOARD_FILTER_DEFAULTS.userParticipation,
  );
  const [departmentParticipation, setDepartmentParticipation] = useState<
    DigisacDashboardQueryFilters["departmentParticipation"]
  >(DIGISAC_DASHBOARD_FILTER_DEFAULTS.departmentParticipation);
  const [serviceId, setServiceId] = useState("");
  const [filters, setFilters] = useState<DigisacDashboardQueryFilters>({
    startDate: today,
    endDate: today,
    departmentId: "all",
    userId: "all",
    ...DIGISAC_DASHBOARD_FILTER_DEFAULTS,
  });
  const [refreshTick, setRefreshTick] = useState(0);

  const buildQueryFilters = (): DigisacDashboardQueryFilters => ({
    startDate: filters.startDate,
    endDate: filters.endDate,
    departmentId: filters.departmentId,
    userId: filters.userId,
    periodType: filters.periodType,
    status: filters.status,
    userParticipation: filters.userParticipation,
    departmentParticipation: filters.departmentParticipation,
    serviceId: filters.serviceId,
    grouping: filters.grouping,
  });

  const { data: departments } = useQuery({
    queryKey: ['digisac-departments'],
    queryFn: () => digisacApi.getDepartments(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: analystsList } = useQuery({
    queryKey: ['digisac-analysts-list'],
    queryFn: () => digisacApi.getAnalysts(),
    staleTime: 10 * 60 * 1000,
  });

  const shouldLoadDashboard = true;

  const { data: geral, isLoading: isLoadingGeral, isError: isErrorGeral, error: errorGeral } = useQuery({
    queryKey: ['digisac-geral', filters, refreshTick],
    queryFn: () => digisacApi.getDashboardGeral(buildQueryFilters()),
    enabled: shouldLoadDashboard,
    staleTime: 0,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const { data: analistas, isLoading: isLoadingAnalistas, isError: isErrorAnalistas, error: errorAnalistas } = useQuery({
    queryKey: ['digisac-analistas', filters, refreshTick],
    queryFn: () => digisacApi.getDashboardAnalistas(buildQueryFilters()),
    enabled: shouldLoadDashboard,
    staleTime: 0,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const syncFiltersFromControls = (): DigisacDashboardQueryFilters => ({
    startDate,
    endDate,
    departmentId,
    userId: analystId,
    periodType,
    status: ticketStatus,
    userParticipation,
    departmentParticipation,
    serviceId: serviceId.trim() || undefined,
    grouping: "",
  });

  const refreshDigisacDashboard = () => {
    setFilters(syncFiltersFromControls());
    setRefreshTick((prev) => prev + 1);
  };

  const applyFilters = () => {
    setFilters(syncFiltersFromControls());
  };

  /** Mesmo formato do painel Digisac (HH:MM:SS). */
  const formatTma = (minutes: number) => {
    if (!minutes || minutes <= 0 || !Number.isFinite(minutes)) return "00:00:00";
    const totalSeconds = Math.round(minutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const analistasList = analistas ?? [];

  // Gráfico TMA por analista (ordenado do MAIOR para o MENOR)
  const tmaChartData = [...analistasList]
    .sort((a, b) => b.tma_minutos - a.tma_minutos)
    .map(a => ({
      name: a.name,
      tma: Math.round(a.tma_minutos * 60), // segundos para tooltip preciso
      tmaMin: a.tma_minutos,
      label: formatTma(a.tma_minutos),
    }));

  // Gráfico Chamados por analista (ordenado do MAIOR para o MENOR de fechados)
  const chamadosChartData = [...analistasList]
    .sort((a, b) => (b.chamados_fechados ?? 0) - (a.chamados_fechados ?? 0))
    .map(a => ({
      name: a.name,
      Fechados: a.chamados_fechados ?? 0,
      Abertos: a.chamados_abertos ?? 0,
    }));

  const totalChamadosFechados = chamadosChartData.reduce((acc, a) => acc + a.Fechados, 0);
  const mediaTmaMinutos = geral?.tma_geral_minutos || 0;

  const hasError = isErrorGeral || isErrorAnalistas;
  const hasData =
    (geral?.total_chamados || 0) > 0 ||
    (geral?.total_mensagens || 0) > 0 ||
    analistasList.length > 0;
  const showEmptyState = !hasError && !isLoadingGeral && !isLoadingAnalistas && !hasData;

  return (
    <div className="container mx-auto py-8 space-y-8 fade-in max-w-full overflow-x-hidden">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 w-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Digisac</h1>
          <p className="text-muted-foreground mt-1">
            Métricas de atendimento integradas com o sistema de chamados.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          <div className="flex flex-col gap-1 min-w-[130px] flex-1 sm:flex-none">
            <span className="text-xs text-muted-foreground">Data Inicial</span>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full sm:w-[140px] h-9" />
          </div>
          <div className="flex flex-col gap-1 min-w-[130px] flex-1 sm:flex-none">
            <span className="text-xs text-muted-foreground">Data Final</span>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full sm:w-[140px] h-9" />
          </div>
          <div className="flex flex-col gap-1 min-w-[160px] flex-1 basis-full sm:basis-auto sm:flex-none">
            <span className="text-xs text-muted-foreground">Departamento</span>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-full sm:w-[180px] max-w-full h-9 truncate">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="max-w-[90vw]">
                <SelectItem value="all">Todos os departamentos</SelectItem>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 min-w-[160px] flex-1 basis-full sm:basis-auto sm:flex-none">
            <span className="text-xs text-muted-foreground">Analista</span>
            <Select value={analystId} onValueChange={setAnalystId}>
              <SelectTrigger className="w-full sm:w-[180px] max-w-full h-9 truncate">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="max-w-[90vw]">
                <SelectItem value="all">Todos os analistas</SelectItem>
                {analystsList?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={applyFilters} className="h-9 gap-2 shrink-0">
            <Filter className="w-4 h-4" />
            Aplicar
          </Button>
          <Button type="button" variant="outline" onClick={refreshDigisacDashboard} className="h-9 gap-2 shrink-0" title="Buscar de novo na Digisac">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
          <div className="hidden lg:block w-px h-10 bg-border mx-1"></div>
          <div className="shrink-0"><DigisacMappingModal /></div>
        </div>
      </div>

      <Card className="glass-card border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros Digisac (estatísticas de atendimento)</CardTitle>
          <CardDescription>
            Mesmos parâmetros do endpoint <code className="text-xs">/api/v1/dashboard/general</code> usado no painel Digisac.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Tipo de período</span>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as DigisacDashboardQueryFilters["periodType"])}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openDate">Data de abertura</SelectItem>
                  <SelectItem value="closeDate">Data de fechamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Status do chamado</span>
              <Select value={ticketStatus} onValueChange={(v) => setTicketStatus(v as DigisacDashboardQueryFilters["status"])}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Abertos</SelectItem>
                  <SelectItem value="close">Fechados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Participação do usuário</span>
              <Select
                value={userParticipation}
                onValueChange={(v) => setUserParticipation(v as DigisacDashboardQueryFilters["userParticipation"])}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last">Último (last)</SelectItem>
                  <SelectItem value="middle">Meio (middle)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Participação do departamento</span>
              <Select
                value={departmentParticipation}
                onValueChange={(v) =>
                  setDepartmentParticipation(v as DigisacDashboardQueryFilters["departmentParticipation"])
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last">Último (last)</SelectItem>
                  <SelectItem value="middle">Meio (middle)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
              <span className="text-xs text-muted-foreground">ID do serviço (opcional)</span>
              <Input
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                placeholder="serviceId"
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {hasError && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <div>
            <p className="font-semibold">Erro ao carregar dados do Digisac</p>
            <p className="text-sm">A integração respondeu com erro tratado. Detalhe: {((errorGeral as any)?.message || (errorAnalistas as any)?.message || 'Erro desconhecido')}</p>
          </div>
        </div>
      )}

      {showEmptyState && (
        <div className="bg-muted/50 text-muted-foreground p-4 rounded-md flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <div>
            <p className="font-semibold text-foreground">Nenhum dado encontrado para o período selecionado</p>
            <p className="text-sm">Ajuste os filtros ou confirme se existem chamados fechados e analistas mapeados.</p>
          </div>
        </div>
      )}

      {/* Indicadores Gerais — espelham a tela "Estatísticas de atendimento" do Digisac */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Chamados</CardTitle>
            <Ticket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : geral?.total_chamados || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Abertos + fechados no período</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chamados Fechados</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : geral?.total_fechados || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Status: finalizado</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chamados Abertos</CardTitle>
            <CircleDot className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : geral?.total_abertos || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Em andamento</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contatos Únicos</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : geral?.total_contatos || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Clientes distintos</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">TMA Geral</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : formatTma(geral?.tma_geral_minutos || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Tempo médio de atendimento</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio de Espera</CardTitle>
            <Hourglass className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : formatTma(geral?.tempo_espera_minutos || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Espera total do cliente</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">1º tempo de espera</CardTitle>
            <Timer className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : formatTma(geral?.primeira_resposta_minutos || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Média do 1º tempo de espera (campo waitingTime da Digisac)</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : geral?.total_mensagens || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Total de mensagens do período</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Gráfico TMA por Analista */}
        <Card className="glass-card border-none shadow-sm col-span-1">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Tempo médio por analista</CardTitle>
                <CardDescription>Ordenado do maior para o menor (TMA)</CardDescription>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Média geral</div>
                <div className="text-sm font-semibold">{formatTma(mediaTmaMinutos)}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[350px]">
            {isLoadingAnalistas ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">Carregando gráfico...</div>
            ) : tmaChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tmaChartData} layout="vertical" margin={{ top: 10, right: 60, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatTma(v / 60)} />
                  <YAxis type="category" dataKey="name" fontSize={11} tickLine={false} axisLine={false} width={120} />
                  <RechartsTooltip
                    cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(_v: any, _n: any, item: any) => [formatTma(item?.payload?.tmaMin ?? 0), 'TMA']}
                  />
                  <Bar dataKey="tma" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList dataKey="label" position="right" fontSize={11} fill="hsl(var(--foreground))" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Nenhum dado encontrado para o período selecionado.</div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico Chamados por Analista */}
        <Card className="glass-card border-none shadow-sm col-span-1">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Chamados por analista</CardTitle>
                <CardDescription>Distribuição de chamados fechados x abertos</CardDescription>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total fechados</div>
                <div className="text-sm font-semibold">{totalChamadosFechados}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[350px]">
            {isLoadingAnalistas ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">Carregando gráfico...</div>
            ) : chamadosChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chamadosChartData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" fontSize={11} tickLine={false} axisLine={false} width={120} />
                  <RechartsTooltip
                    cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend />
                  <Bar dataKey="Fechados" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="Abertos" stackId="a" fill="hsl(var(--muted-foreground)/0.5)" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Nenhum dado encontrado para o período selecionado.</div>
            )}
          </CardContent>
        </Card>

        {/* Tabela de Analistas — compacta, ocupa toda a largura */}
        <Card className="glass-card border-none shadow-sm md:col-span-2 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Desempenho da Equipe</CardTitle>
            <CardDescription>Métricas detalhadas por analista (dados oficiais Digisac)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingAnalistas ? (
               <div className="p-6 text-center text-muted-foreground">Carregando dados...</div>
            ) : (
              <div className="w-full overflow-hidden">
                <Table className="w-full table-fixed text-xs">
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="h-9 px-3 w-[18%]">Analista</TableHead>
                      <TableHead className="h-9 px-1 text-right w-[7%]">Total</TableHead>
                      <TableHead className="h-9 px-1 text-right w-[7%]">Fech.</TableHead>
                      <TableHead className="h-9 px-1 text-right w-[7%]">Aber.</TableHead>
                      <TableHead className="h-9 px-1 text-right w-[8%]">Cont.</TableHead>
                      <TableHead className="h-9 px-1 text-right w-[9%]">1º esp.</TableHead>
                      <TableHead className="h-9 px-2 text-right w-[10%]">TMA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analistas?.length ? analistas.map((analyst) => (
                      <TableRow key={analyst.analyst_id} className="hover:bg-muted/30">
                        <TableCell className="font-medium px-3 py-2 truncate" title={analyst.name}>
                          {analyst.name}
                          {analyst.mapped === false && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(não mapeado)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right px-2 py-2 tabular-nums">{analyst.total_chamados}</TableCell>
                        <TableCell className="text-right px-2 py-2 tabular-nums">{analyst.chamados_fechados ?? 0}</TableCell>
                        <TableCell className="text-right px-2 py-2 tabular-nums">{analyst.chamados_abertos ?? 0}</TableCell>
                        <TableCell className="text-right px-2 py-2 tabular-nums">{analyst.total_contatos ?? 0}</TableCell>
                        <TableCell className="text-right px-2 py-2 tabular-nums">{formatTma(analyst.primeira_espera_minutos ?? 0)}</TableCell>
                        <TableCell className="text-right px-3 py-2 tabular-nums font-semibold">{formatTma(analyst.tma_minutos)}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                           Nenhum dado encontrado para o período selecionado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
