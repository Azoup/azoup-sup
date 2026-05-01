import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DigisacMappingModal } from "@/components/DigisacMappingModal";
import { digisacApi } from "@/integrations/digisac/api";
import { Clock, Ticket, Users, Filter, MessageSquare, Hourglass, Timer, CheckCircle2, CircleDot } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
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
  const [filters, setFilters] = useState({ start: today, end: today });

  const { data: geral, isLoading: isLoadingGeral, isError: isErrorGeral, error: errorGeral } = useQuery({
    queryKey: ['digisac-geral', filters.start, filters.end],
    queryFn: () => digisacApi.getDashboardGeral(filters.start || undefined, filters.end || undefined),
    refetchInterval: 5 * 60 * 1000
  });

  const { data: analistas, isLoading: isLoadingAnalistas, isError: isErrorAnalistas, error: errorAnalistas } = useQuery({
    queryKey: ['digisac-analistas', filters.start, filters.end],
    queryFn: () => digisacApi.getDashboardAnalistas(filters.start || undefined, filters.end || undefined),
    refetchInterval: 5 * 60 * 1000
  });

  const applyFilters = () => {
    setFilters({ start: startDate, end: endDate });
  };

  const formatTma = (minutes: number) => {
    if (!minutes) return "0h 0m";
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${h}h ${m}m`;
  };

  const chartData = analistas?.map(a => ({
    name: a.name,
    'Chamados': a.total_chamados,
    'TMA (min)': Math.round(a.tma_minutos)
  })) || [];

  const hasError = isErrorGeral || isErrorAnalistas;
  const hasData = (geral?.total_chamados || 0) > 0 || chartData.length > 0;
  const showEmptyState = !hasError && !isLoadingGeral && !isLoadingAnalistas && !hasData;

  return (
    <div className="container mx-auto py-8 space-y-8 fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Digisac</h1>
          <p className="text-muted-foreground mt-1">
            Métricas de atendimento integradas com o sistema de chamados.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Data Inicial</span>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-[140px] h-9" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Data Final</span>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-[140px] h-9" />
            </div>
            <div className="flex flex-col gap-1 justify-end h-full">
              <span className="text-xs opacity-0">.</span>
              <Button onClick={applyFilters} className="h-9 gap-2">
                <Filter className="w-4 h-4" />
                Aplicar
              </Button>
            </div>
          </div>
          <div className="hidden sm:block w-px h-10 bg-border mx-1"></div>
          <div className="flex flex-col gap-1 justify-end h-full">
            <span className="text-xs opacity-0">.</span>
            <DigisacMappingModal />
          </div>
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
        {/* Gráfico */}
        <Card className="glass-card border-none shadow-sm col-span-1">
          <CardHeader>
            <CardTitle>Chamados por Analista</CardTitle>
            <CardDescription>Distribuição de chamados finalizados</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {isLoadingAnalistas ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">Carregando gráfico...</div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend />
                  <Bar dataKey="Chamados" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
             ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">Nenhum dado encontrado para o período selecionado.</div>
            )}
          </CardContent>
        </Card>

        {/* Tabela de Analistas */}
        <Card className="glass-card border-none shadow-sm col-span-1 overflow-hidden">
          <CardHeader>
            <CardTitle>Desempenho da Equipe</CardTitle>
            <CardDescription>Métricas detalhadas por analista</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingAnalistas ? (
               <div className="p-6 text-center text-muted-foreground">Carregando dados...</div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Analista</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Fechados</TableHead>
                    <TableHead className="text-right">Abertos</TableHead>
                    <TableHead className="text-right">TMA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analistas?.length ? analistas.map((analyst) => (
                    <TableRow key={analyst.analyst_id}>
                      <TableCell className="font-medium">
                        {analyst.name}
                        {analyst.mapped === false && (
                          <span className="ml-2 text-xs text-muted-foreground">(não mapeado)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{analyst.total_chamados}</TableCell>
                      <TableCell className="text-right">{analyst.chamados_fechados ?? 0}</TableCell>
                      <TableCell className="text-right">{analyst.chamados_abertos ?? 0}</TableCell>
                      <TableCell className="text-right">{formatTma(analyst.tma_minutos)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                         Nenhum dado encontrado para o período selecionado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
