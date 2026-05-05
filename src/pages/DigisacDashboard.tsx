import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DigisacMappingModal } from "@/components/DigisacMappingModal";
import { digisacApi } from "@/integrations/digisac/api";
import { Clock, Ticket, Users, Filter, MessageSquare, Hourglass, Timer, CheckCircle2, CircleDot } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle } from "lucide-react";

const getTodayDateInputValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function DigisacDashboard() {
  const today = getTodayDateInputValue();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [analystId, setAnalystId] = useState<string>("all");
  const [filters, setFilters] = useState({ start: today, end: today, departmentId: "all", analystId: "all" });

  const { data: departments } = useQuery({
    queryKey: ['digisac-departments'],
    queryFn: () => digisacApi.getDepartments(),
    staleTime: 10 * 60 * 1000,
  });

  // Auto-seleciona "Suporte" como departamento padrão assim que a lista carregar.
  // Garante que dashboard sempre bata com a tela "Estatísticas de atendimento" filtrada por Suporte.
  useEffect(() => {
    if (!departments || departments.length === 0) return;
    if (departmentId !== "all") return;
    const suporte = departments.find((d) => /suporte/i.test(d.name));
    if (suporte) {
      setDepartmentId(suporte.id);
      setFilters((f) => ({ ...f, departmentId: suporte.id }));
    }
  }, [departments]);

  const { data: analystsList } = useQuery({
    queryKey: ['digisac-analysts-list'],
    queryFn: () => digisacApi.getAnalysts(),
    staleTime: 10 * 60 * 1000,
  });

  // PROIBIDO: nunca disparar query com departmentId === "all".
  // Cada chamada precisa carregar dados de UM departamento específico para garantir separação correta.
  const departmentSelected = filters.departmentId && filters.departmentId !== "all";

  const { data: geral, isLoading: isLoadingGeral, isError: isErrorGeral, error: errorGeral } = useQuery({
    queryKey: ['digisac-geral', filters.start, filters.end, filters.departmentId, filters.analystId],
    queryFn: () => digisacApi.getDashboardGeral(filters.start || undefined, filters.end || undefined, filters.departmentId, filters.analystId),
    enabled: !!departmentSelected,
    refetchInterval: 5 * 60 * 1000
  });

  const { data: analistas, isLoading: isLoadingAnalistas, isError: isErrorAnalistas, error: errorAnalistas } = useQuery({
    queryKey: ['digisac-analistas', filters.start, filters.end, filters.departmentId, filters.analystId],
    queryFn: () => digisacApi.getDashboardAnalistas(filters.start || undefined, filters.end || undefined, filters.departmentId, filters.analystId),
    enabled: !!departmentSelected,
    refetchInterval: 5 * 60 * 1000
  });

  const applyFilters = () => {
    if (!departmentId || departmentId === "all") return;
    setFilters({ start: startDate, end: endDate, departmentId, analystId });
  };

  const formatTma = (minutes: number) => {
    if (!minutes || minutes <= 0) return "0m";
    const totalSeconds = Math.round(minutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Logs de debug solicitados
  console.log('[DigisacDashboard] geral recebido:', geral);
  console.log('[DigisacDashboard] analistas recebidos:', analistas);

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
  const mediaTmaMinutos = analistasList.length
    ? analistasList.reduce((acc, a) => acc + (a.tma_minutos || 0), 0) / analistasList.length
    : 0;

  const hasError = isErrorGeral || isErrorAnalistas;
  const hasData = (geral?.total_chamados || 0) > 0 || analistasList.length > 0;
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
          <div className="hidden lg:block w-px h-10 bg-border mx-1"></div>
          <div className="shrink-0"><DigisacMappingModal /></div>
        </div>
      </div>

      {hasError && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <div>
            <p className="font-semibold">Erro ao carregar dados do Digisac</p>
            <p className="text-sm">A integração respondeu com erro tratado. Detalhe: {((errorGeral as any)?.message || (errorAnalistas as any)?.message || 'Erro desconhecido')}</p>
          </div>
        </div>
      )}

      {!departmentSelected && (
        <div className="bg-muted/50 text-muted-foreground p-4 rounded-md flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <div>
            <p className="font-semibold text-foreground">Selecione um departamento</p>
            <p className="text-sm">Os dados do Digisac são carregados separadamente por departamento. Escolha um e clique em Aplicar.</p>
          </div>
        </div>
      )}

      {departmentSelected && showEmptyState && (
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
            <CardTitle className="text-sm font-medium">1ª Resposta</CardTitle>
            <Timer className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : formatTma(geral?.primeira_resposta_minutos || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Tempo médio até 1ª resposta</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoadingGeral ? "..." : geral?.total_mensagens || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Trocadas no período</p>
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
                      <TableHead className="h-9 px-3 w-[28%]">Analista</TableHead>
                      <TableHead className="h-9 px-2 text-right w-[10%]">Total</TableHead>
                      <TableHead className="h-9 px-2 text-right w-[11%]">Fechados</TableHead>
                      <TableHead className="h-9 px-2 text-right w-[10%]">Abertos</TableHead>
                      <TableHead className="h-9 px-2 text-right w-[12%]">Contatos</TableHead>
                      <TableHead className="h-9 px-2 text-right w-[14%]">Mensagens</TableHead>
                      <TableHead className="h-9 px-3 text-right w-[15%]">TMA</TableHead>
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
                        <TableCell className="text-right px-2 py-2 tabular-nums">{analyst.total_mensagens ?? 0}</TableCell>
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
