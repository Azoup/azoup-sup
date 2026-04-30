import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DigisacMappingModal } from "@/components/DigisacMappingModal";
import { digisacApi } from "@/integrations/digisac/api";
import { Clock, Ticket, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function DigisacDashboard() {
  const { data: geral, isLoading: isLoadingGeral } = useQuery({
    queryKey: ['digisac-geral'],
    queryFn: digisacApi.getDashboardGeral,
    refetchInterval: 5 * 60 * 1000 // Refetch every 5 minutes
  });

  const { data: analistas, isLoading: isLoadingAnalistas } = useQuery({
    queryKey: ['digisac-analistas'],
    queryFn: digisacApi.getDashboardAnalistas,
    refetchInterval: 5 * 60 * 1000
  });

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

  return (
    <div className="container mx-auto py-8 space-y-8 fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Digisac</h1>
          <p className="text-muted-foreground mt-1">
            Métricas de atendimento integradas com o sistema de chamados.
          </p>
        </div>
        <DigisacMappingModal />
      </div>

      {/* Indicadores Gerais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Chamados</CardTitle>
            <Ticket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingGeral ? "..." : geral?.total_chamados || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Chamados totais no período (API)
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">TMA Geral</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingGeral ? "..." : formatTma(geral?.tma_geral_minutos || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tempo Médio de Atendimento
            </p>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Analistas Mapeados</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingAnalistas ? "..." : analistas?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Usuários ativos com tickets
            </p>
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
               <div className="flex h-full items-center justify-center text-muted-foreground">Nenhum dado disponível. Realize o mapeamento.</div>
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
                    <TableHead className="text-right">Chamados</TableHead>
                    <TableHead className="text-right">TMA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analistas?.length ? analistas.map((analyst) => (
                    <TableRow key={analyst.analyst_id}>
                      <TableCell className="font-medium">{analyst.name}</TableCell>
                      <TableCell className="text-right">{analyst.total_chamados}</TableCell>
                      <TableCell className="text-right">{formatTma(analyst.tma_minutos)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                        Nenhum analista com dados. Verifique o mapeamento.
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
