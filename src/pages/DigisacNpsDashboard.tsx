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
import { EMPTY_NPS_OVERVIEW, type NpsAnalystRow, type NpsOverview } from "@/integrations/digisac/npsNormalize";
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
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

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

const NPS_CARD_MIN_H = "min-h-[420px]";

function NpsBreakdownRow({
  label,
  scoreRange,
  count,
  percent,
  color,
}: {
  label: string;
  scoreRange: string;
  count: number;
  percent: number;
  color: string;
}) {
  return (
    <div className="flex w-full items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground">{scoreRange}</p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p className="text-sm font-semibold">{count}</p>
        <p className="text-xs text-muted-foreground">{percent.toFixed(2)}%</p>
      </div>
    </div>
  );
}

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

  const filterAnalystView = (overview: NpsOverview, rows: NpsAnalystRow[]) => {
    if (analystId === "all") return { overview, analysts: rows };
    const one = rows.find((a) => a.userId === analystId);
    if (one) return { overview: one.overview, analysts: [one] };
    return { overview: EMPTY_NPS_OVERVIEW, analysts: [] };
  };

  const apiAnalysts =
    data?.analysts && data.analysts.length > 0
      ? data.analysts
      : (analystsList ?? []).map((a) => ({
          userId: a.id,
          name: a.name,
          total: 0,
          overview: EMPTY_NPS_OVERVIEW,
        }));

  const { overview, displayAnalysts } = useMemo(() => {
    const filtered = filterAnalystView(data?.overview ?? EMPTY_NPS_OVERVIEW, apiAnalysts);
    return {
      overview: filtered.overview ?? EMPTY_NPS_OVERVIEW,
      displayAnalysts: filtered.analysts ?? [],
    };
  }, [data, apiAnalysts, analystId]);

  const safeOverview = overview;
  const safeAnalysts = displayAnalysts;

  const pieData = useMemo(() => {
    if (safeOverview.total <= 0) return [];
    return [
      { name: "Promotores", value: safeOverview.promoters.count, color: NPS_COLORS.promoters, pct: safeOverview.promoters.percent },
      { name: "Neutros", value: safeOverview.neutrals.count, color: NPS_COLORS.neutrals, pct: safeOverview.neutrals.percent },
      { name: "Detratores", value: safeOverview.detractors.count, color: NPS_COLORS.detractors, pct: safeOverview.detractors.percent },
    ].filter((d) => d.value > 0);
  }, [safeOverview]);

  const hasData = safeOverview.total > 0 || safeAnalysts.some((a) => a.total > 0);
  const showEmpty = !isLoading && !isError && !hasData;
  const npsCategories = [safeOverview.promoters, safeOverview.neutrals, safeOverview.detractors];

  return (
    <div className="container mx-auto py-8 space-y-8 fade-in max-w-full overflow-x-hidden">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 w-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard NPS</h1>
          <p className="text-muted-foreground mt-1">
            Avaliações NPS integradas ao Digisac — departamento{" "}
            <span className="font-medium text-foreground">
              {data?.departmentName ?? suporteDepartment?.name ?? "Suporte"}
            </span>
            . Dados carregados automaticamente da API (overview + lista de avaliações por analista).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          <DigisacDateTimeField label="De" value={periodStart} onChange={setPeriodStart} className="min-w-[160px] flex-1 sm:flex-none" />
          <DigisacDateTimeField label="Até" value={periodEnd} onChange={setPeriodEnd} className="min-w-[160px] flex-1 sm:flex-none" />
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
          <Button type="button" variant="outline" onClick={refreshDashboard} className="h-9 gap-2 shrink-0">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {!departmentId && !isLoading && (
        <div className="bg-muted/50 text-muted-foreground p-4 rounded-md">
          Aguardando identificação do departamento Suporte no Digisac…
        </div>
      )}

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
        <div className="bg-muted/50 text-muted-foreground p-4 rounded-md flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p>
              Nenhuma avaliação NPS no período. Confira as datas e se o departamento Suporte tem pesquisa NPS ativa no Digisac.
            </p>
            {data?._debug && (
              <details className="text-xs">
                <summary className="cursor-pointer font-medium text-foreground">Diagnóstico da API</summary>
                <p className="mt-2">{data._debug.hint}</p>
                {data.period?.from && (
                  <p className="mt-1">
                    Período enviado: {data.period.from} → {data.period.to}
                  </p>
                )}
                {typeof data.answersRowCount === "number" && (
                  <p>
                    Linhas em /answers: {data.answersRowCount}
                    {typeof (data as { scoredAnswerCount?: number }).scoredAnswerCount === "number" &&
                      ` · com nota: ${(data as { scoredAnswerCount: number }).scoredAnswerCount}`}
                  </p>
                )}
                {data._debug.sampleRowKeys && data._debug.sampleRowKeys.length > 0 && (
                  <p className="break-all">Campos da 1ª linha: {data._debug.sampleRowKeys.join(", ")}</p>
                )}
                {data._debug.bestAttempt && (
                  <p className="mt-1 break-all">
                    Melhor tentativa: HTTP {data._debug.bestAttempt.status} — {data._debug.bestAttempt.endpoint}
                    ?{data._debug.bestAttempt.query.slice(0, 120)}
                    {data._debug.bestAttempt.query.length > 120 ? "…" : ""}
                  </p>
                )}
              </details>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <Card className={`flex flex-col overflow-hidden ${NPS_CARD_MIN_H}`}>
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              NPS
            </CardTitle>
            <CardDescription>
              Distribuição no período (overview Digisac)
              {safeOverview.npsScore != null && (
                <span className="ml-2 font-semibold text-foreground">
                  Score: {safeOverview.npsScore.toFixed(2)}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pb-6">
            {isLoading ? (
              <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Carregando dados do Digisac…</p>
            ) : pieData.length === 0 ? (
              <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Sem dados para o gráfico no período.
              </p>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-1">
                <div className="relative mx-auto h-[168px] w-[168px] shrink-0 sm:h-[184px] sm:w-[184px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="56%"
                        outerRadius="86%"
                        paddingAngle={2}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(v: number, _n, p) => [
                          `${v} (${(p?.payload as { pct?: number })?.pct?.toFixed(2) ?? 0}%)`,
                          "",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {safeOverview.npsScore != null && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-xl font-bold leading-none text-foreground sm:text-2xl">
                          {safeOverview.npsScore.toFixed(2)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">NPS</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="w-full max-w-sm rounded-lg border bg-muted/20 px-3 py-1">
                  {npsCategories.map((row) => (
                    <NpsBreakdownRow
                      key={row.label}
                      label={row.label}
                      scoreRange={row.scoreRange}
                      count={row.count}
                      percent={row.percent}
                      color={
                        row.label === "Promotores"
                          ? NPS_COLORS.promoters
                          : row.label === "Neutros"
                            ? NPS_COLORS.neutrals
                            : NPS_COLORS.detractors
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`flex flex-col overflow-hidden ${NPS_CARD_MIN_H}`}>
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Avaliações por analista
            </CardTitle>
            <CardDescription>
              Contagem por atendente (overview Digisac por usuário).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pb-6">
            {isLoading ? (
              <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Carregando…</p>
            ) : safeAnalysts.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-2 text-center text-sm text-muted-foreground">
                Nenhum analista mapeado. Configure em Dashboard Digisac → Mapeamento Digisac.
              </p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {[...safeAnalysts]
                  .sort((a, b) => b.total - a.total)
                  .map((a) => (
                    <li
                      key={a.userId}
                      className="flex items-center justify-between rounded-md border px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-medium truncate">{a.name}</p>
                        {a.total > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            P {a.overview.promoters.count} · N {a.overview.neutrals.count} · D{" "}
                            {a.overview.detractors.count}
                            {a.overview.npsScore != null ? ` · NPS ${a.overview.npsScore.toFixed(2)}` : ""}
                          </p>
                        )}
                      </div>
                      <span className="text-muted-foreground shrink-0 font-medium">
                        {a.total === 1 ? "1 avaliação" : `${a.total} avaliações`}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {safeAnalysts.length > 0 && hasData && (
        <Card>
          <CardHeader>
            <CardTitle>Comparativo por analista</CardTitle>
            <CardDescription>Promotores, neutros, detratores e NPS de cada atendente.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Analista</TableHead>
                  <TableHead className="text-right">Avaliações</TableHead>
                  <TableHead className="text-right">Promotores (9-10)</TableHead>
                  <TableHead className="text-right">Neutros (7-8)</TableHead>
                  <TableHead className="text-right">Detratores (0-6)</TableHead>
                  <TableHead className="text-right">NPS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...safeAnalysts]
                  .sort((a, b) => b.total - a.total)
                  .map((a) => (
                    <TableRow key={a.userId} className={a.total === 0 ? "opacity-50" : undefined}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-right">{a.total}</TableCell>
                      <TableCell className="text-right">{a.overview.promoters.count}</TableCell>
                      <TableCell className="text-right">{a.overview.neutrals.count}</TableCell>
                      <TableCell className="text-right">{a.overview.detractors.count}</TableCell>
                      <TableCell className="text-right font-medium">
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
