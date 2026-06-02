import { useEffect, useMemo, useRef, useState } from "react";
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
  mergeAnalystRowsWithMapped,
  parseDigisacNpsExportText,
  type ParsedDigisacNpsExport,
} from "@/lib/parseDigisacNpsExport";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, FileUp, Filter, RefreshCw, Star, Users, X } from "lucide-react";
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

type DataSource = "api" | "txt" | "none";

export default function DigisacNpsDashboard() {
  const today = getTodayDateStringBrazil();
  const monthStart = getMonthStartBrazil();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const [txtImport, setTxtImport] = useState<ParsedDigisacNpsExport | null>(null);
  const [txtFileName, setTxtFileName] = useState<string | null>(null);

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

  const analystNameMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const a of analystsList ?? []) {
      const key = a.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .toLowerCase();
      map.set(key, a);
    }
    return map;
  }, [analystsList]);

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

  const { overview, displayAnalysts, dataSource } = useMemo(() => {
    const apiOverview = data?.overview ?? EMPTY_NPS_OVERVIEW;
    const apiAnalysts =
      data?.analysts && data.analysts.length > 0
        ? data.analysts
        : (analystsList ?? []).map((a) => ({
            userId: a.id,
            name: a.name,
            total: 0,
            overview: EMPTY_NPS_OVERVIEW,
          }));

    const txtHasData = (txtImport?.overview.total ?? 0) > 0 || (txtImport?.analysts.some((a) => a.total > 0) ?? false);
    const apiHasData = apiOverview.total > 0 || apiAnalysts.some((a) => a.total > 0);

    if (txtHasData && txtImport) {
      const merged = mergeAnalystRowsWithMapped(txtImport, analystsList ?? []);
      const filtered = filterAnalystView(merged.overview, merged.analysts);
      return { ...filtered, dataSource: "txt" as DataSource };
    }

    if (apiHasData) {
      const filtered = filterAnalystView(apiOverview, apiAnalysts);
      return { ...filtered, dataSource: "api" as DataSource };
    }

    if (txtImport) {
      const merged = mergeAnalystRowsWithMapped(txtImport, analystsList ?? []);
      const filtered = filterAnalystView(merged.overview, merged.analysts);
      return { ...filtered, dataSource: "txt" as DataSource };
    }

    const filtered = filterAnalystView(apiOverview, apiAnalysts);
    return { ...filtered, dataSource: "none" as DataSource };
  }, [data, txtImport, analystsList, analystId]);

  const pieData = useMemo(() => {
    if (!overview || overview.total <= 0) return [];
    return [
      { name: "Promotores", value: overview.promoters.count, color: NPS_COLORS.promoters, pct: overview.promoters.percent },
      { name: "Neutros", value: overview.neutrals.count, color: NPS_COLORS.neutrals, pct: overview.neutrals.percent },
      { name: "Detratores", value: overview.detractors.count, color: NPS_COLORS.detractors, pct: overview.detractors.percent },
    ].filter((d) => d.value > 0);
  }, [overview]);

  const hasData = (overview?.total ?? 0) > 0 || displayAnalysts.some((a) => a.total > 0);
  const showEmpty = !isLoading && !isError && !hasData;

  const handleTxtFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseDigisacNpsExportText(text, analystNameMap);
    const merged = mergeAnalystRowsWithMapped(parsed, analystsList ?? []);
    setTxtImport(merged);
    setTxtFileName(file.name);
  };

  const clearTxtImport = () => {
    setTxtImport(null);
    setTxtFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const npsCategories = overview
    ? [overview.promoters, overview.neutrals, overview.detractors]
    : [];

  return (
    <div className="container mx-auto py-8 space-y-8 fade-in max-w-full overflow-x-hidden">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 w-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard NPS</h1>
          <p className="text-muted-foreground mt-1">
            Estatísticas de avaliações NPS — departamento{" "}
            <span className="font-medium text-foreground">
              {data?.departmentName ?? suporteDepartment?.name ?? "Suporte"}
            </span>
            {dataSource === "txt" && txtFileName && (
              <span className="block text-xs mt-1 text-primary">
                Dados do export: {txtFileName}
              </span>
            )}
            {dataSource === "api" && (
              <span className="block text-xs mt-1 text-muted-foreground">Fonte: API Digisac</span>
            )}
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleTxtFile(file);
            }}
          />
          <Button type="button" variant="secondary" className="h-9 gap-2 shrink-0" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="w-4 h-4" />
            Importar TXT
          </Button>
          {txtFileName && (
            <Button type="button" variant="ghost" className="h-9 gap-1 shrink-0" onClick={clearTxtImport} title="Remover arquivo importado">
              <X className="w-4 h-4" />
            </Button>
          )}
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

      {isError && !txtImport && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Erro ao carregar avaliações pela API</p>
            <p className="text-sm">{(error as Error)?.message ?? "Erro desconhecido"}</p>
            <p className="text-sm mt-1">Use Importar TXT com o arquivo exportado no Digisac (Estatísticas de avaliações → Exportar TXT).</p>
          </div>
        </div>
      )}

      {showEmpty && (
        <div className="bg-muted/50 text-muted-foreground p-4 rounded-md flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p>Nenhuma avaliação NPS no período pela API.</p>
            <p className="text-sm mt-1">
              No Digisac, aplique os mesmos filtros (De/Até, Suporte, NPS), clique em <strong>Exportar TXT</strong> e importe aqui com o botão acima — os totais por analista serão calculados como no relatório do Digisac.
            </p>
          </div>
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
            {isLoading && !txtImport ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
            ) : pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Sem dados para o gráfico. Importe o TXT do Digisac.</p>
            ) : (
              <div className="flex flex-col md:flex-row gap-4 items-stretch">
                <div className="w-full md:w-[42%] min-h-[280px] relative">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={72}
                        outerRadius={118}
                        paddingAngle={1}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(v: number, _n, p) => [`${v} (${(p?.payload as { pct?: number })?.pct?.toFixed(2) ?? 0}%)`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  {overview?.npsScore != null && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-foreground">{overview.npsScore.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">NPS</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="w-full md:flex-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead />
                        <TableHead>Nota</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                        <TableHead className="text-right">Porcentagem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {npsCategories.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="font-medium">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="inline-block w-3 h-3 rounded-full shrink-0"
                                style={{
                                  backgroundColor:
                                    row.label === "Promotores"
                                      ? NPS_COLORS.promoters
                                      : row.label === "Neutros"
                                        ? NPS_COLORS.neutrals
                                        : NPS_COLORS.detractors,
                                }}
                              />
                              {row.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{row.scoreRange}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right">{row.percent.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
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
            <CardDescription>Total de avaliações no período (export TXT ou API).</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !txtImport ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : displayAnalysts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum analista mapeado. Configure em Dashboard Digisac → Mapeamento Digisac.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {[...displayAnalysts]
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

      {displayAnalysts.length > 0 && hasData && (
        <Card>
          <CardHeader>
            <CardTitle>Comparativo por analista</CardTitle>
            <CardDescription>Promotores, neutros, detratores e NPS — espelhando o export do Digisac.</CardDescription>
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
                {[...displayAnalysts]
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
