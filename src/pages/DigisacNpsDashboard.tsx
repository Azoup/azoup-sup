import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DigisacDateTimeField } from "@/components/DigisacDateTimeField";
import {
  digisacApi,
  mergeDigisacNpsFilters,
  type DigisacNpsQueryFilters,
} from "@/integrations/digisac/api";
import { pickSuporteDepartment, pickSuporteDepartmentId } from "@/lib/digisacSuporteDepartment";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, Filter, RefreshCw, Star, Users } from "lucide-react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

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
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
};

const getMonthStartBrazil = () => {
  const today = getTodayDateStringBrazil();
  return `${today.slice(0, 7)}-01`;
};

const NPS_COLORS = {
  promoters: "#1e3a8a",
  neutrals: "#2563eb",
  detractors: "#94a3b8",
};

export default function DigisacNpsDashboard() {
  const today = getTodayDateStringBrazil();
  const monthStart = getMonthStartBrazil();
  const [periodStart, setPeriodStart] = useState({ date: monthStart, time: "00:00" });
  const [periodEnd, setPeriodEnd] = useState({ date: today, time: "23:59" });
  const [analystId, setAnalystId] = useState<string>("all");
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState<DigisacNpsQueryFilters>(() =>
    mergeDigisacNpsFilters({
      startDate: monthStart,
      endDate: today,
      userId: "all",
    }),
  );
  const [refreshTick, setRefreshTick] = useState(0);

  const { data: departments } = useQuery({
    queryKey: ["digisac-departments"],
    queryFn: () => digisacApi.getDepartments(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: analystsList } = useQuery({
    queryKey: ["digisac-analysts-list"],
    queryFn: () => digisacApi.getAnalysts(),
    staleTime: 10 * 60 * 1000,
  });

  const suporteDepartment = useMemo(
    () => pickSuporteDepartment(departments),
    [departments],
  );

  useEffect(() => {
    const id = pickSuporteDepartmentId(departments);
    if (id) setDepartmentId(id);
  }, [departments]);

  useEffect(() => {
    if (!departmentId) return;
    setFilters(
      mergeDigisacNpsFilters({
        startDate: periodStart.date,
        endDate: periodEnd.date,
        startTime: periodStart.time,
        endTime: periodEnd.time,
        departmentId,
        departmentName: suporteDepartment?.name,
        userId: analystId,
        evaluationType: "nps",
        periodType: "all",
      }),
    );
  }, [departmentId, suporteDepartment?.name]);

  const syncFiltersFromControls = (): DigisacNpsQueryFilters =>
    mergeDigisacNpsFilters({
      startDate: periodStart.date,
      endDate: periodEnd.date,
      startTime: periodStart.time,
      endTime: periodEnd.time,
      departmentId: departmentId ?? suporteDepartment?.id,
      departmentName: suporteDepartment?.name,
      userId: analystId,
      evaluationType: "nps",
      periodType: "all",
    });

  const applyFilters = () => setFilters(syncFiltersFromControls());
  const refreshDashboard = () => {
    setFilters(syncFiltersFromControls());
    setRefreshTick((n) => n + 1);
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["digisac-nps", filters, refreshTick, departmentId],
    queryFn: () => digisacApi.getNpsDashboard(filters),
    enabled: !!filters.startDate && !!filters.endDate && !!departmentId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const overview = data?.overview;
  const analysts = data?.analysts ?? [];

  const pieData = useMemo(() => {
    if (!overview || overview.total <= 0) return [];
    return [
      { name: "Promotores", value: overview.promoters.count, color: NPS_COLORS.promoters },
      { name: "Neutros", value: overview.neutrals.count, color: NPS_COLORS.neutrals },
      { name: "Detratores", value: overview.detractors.count, color: NPS_COLORS.detractors },
    ].filter((d) => d.value > 0);
  }, [overview]);

  const hasData = (overview?.total ?? 0) > 0 || analysts.some((a) => a.total > 0);
  const showEmpty = !isLoading && !isError && !hasData;

  return (
    <div className="container mx-auto py-8 space-y-8 fade-in max-w-full overflow-x-hidden">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 w-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard NPS</h1>
          <p className="text-muted-foreground mt-1">
            Estatísticas de avaliações NPS do Digisac — departamento{" "}
            <span className="font-medium text-foreground">
              {data?.departmentName ?? suporteDepartment?.name ?? "Suporte"}
            </span>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          <DigisacDateTimeField
            label="De"
            value={periodStart}
            onChange={setPeriodStart}
            className="min-w-[160px] flex-1 sm:flex-none"
          />
          <DigisacDateTimeField
            label="Até"
            value={periodEnd}
            onChange={setPeriodEnd}
            className="min-w-[160px] flex-1 sm:flex-none"
          />
          <div className="flex flex-col gap-1 min-w-[160px] flex-1 basis-full sm:basis-auto sm:flex-none">
            <span className="text-xs text-muted-foreground">Analista</span>
            <Select value={analystId} onValueChange={setAnalystId}>
              <SelectTrigger className="w-full sm:w-[200px] max-w-full h-9 truncate">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="max-w-[90vw]">
                <SelectItem value="all">Todos os analistas</SelectItem>
                {analystsList?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={applyFilters} className="h-9 gap-2 shrink-0">
            <Filter className="w-4 h-4" />
            Aplicar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={refreshDashboard}
            className="h-9 gap-2 shrink-0"
            title="Buscar de novo na Digisac"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {isError && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Erro ao carregar avaliações</p>
            <p className="text-sm">{(error as Error)?.message ?? "Erro desconhecido"}</p>
          </div>
        </div>
      )}

      {showEmpty && (
        <div className="bg-muted/50 text-muted-foreground p-4 rounded-md flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>Nenhuma avaliação NPS no período selecionado.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              NPS
            </CardTitle>
            <CardDescription>
              Distribuição no período
              {overview?.npsScore != null && (
                <span className="ml-2 font-semibold text-foreground">
                  Score: {overview.npsScore.toFixed(2)}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
            ) : pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Sem dados para o gráfico.</p>
            ) : (
              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="w-full md:w-1/2 h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={1}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(v: number) => [`${v} avaliações`, ""]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full md:w-1/2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Nota</TableHead>
                        <TableHead className="text-right">Qtd.</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[overview!.promoters, overview!.neutrals, overview!.detractors].map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{row.scoreRange}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right">{row.percent.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-semibold">{overview!.total}</TableCell>
                        <TableCell className="text-right">100%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Avaliações por analista
            </CardTitle>
            <CardDescription>
              Contagem individual no período (como no export TXT do Digisac).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : analysts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum analista mapeado.</p>
            ) : (
              <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {analysts.map((a) => (
                  <li
                    key={a.userId}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="font-medium truncate pr-2">{a.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {a.total === 1 ? "1 avaliação" : `${a.total} avaliações`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {analysts.length > 0 && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhe por analista</CardTitle>
            <CardDescription>Promotores, neutros e detratores de cada atendente.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Analista</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Promotores</TableHead>
                  <TableHead className="text-right">Neutros</TableHead>
                  <TableHead className="text-right">Detratores</TableHead>
                  <TableHead className="text-right">NPS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysts.map((a) => (
                  <TableRow key={a.userId}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-right">{a.total}</TableCell>
                    <TableCell className="text-right">{a.overview.promoters.count}</TableCell>
                    <TableCell className="text-right">{a.overview.neutrals.count}</TableCell>
                    <TableCell className="text-right">{a.overview.detractors.count}</TableCell>
                    <TableCell className="text-right">
                      {a.overview.npsScore != null ? a.overview.npsScore.toFixed(2) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
