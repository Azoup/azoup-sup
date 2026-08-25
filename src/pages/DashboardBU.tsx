import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { digisacApi } from '@/integrations/digisac/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { Building2, Download, Filter, Phone, HelpCircle, FileText, RefreshCw, Headset, Repeat2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, startOfWeek, setDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { QueryLoadState } from '@/components/QueryLoadState';
import { usePermissions } from '@/hooks/usePermissions';
import type { DigisacBuContactTagKey } from '@/lib/digisacBuContactTags';

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

const emptyUnit = { atendimentos: 0, contatos: 0 };

const DashboardBU = () => {
  const { canView } = usePermissions();
  const today = parseISO(getTodayDateStringBrazil());
  const [dateFrom, setDateFrom] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(setDay(startOfWeek(today, { weekStartsOn: 1 }), 6, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [monthFilter, setMonthFilter] = useState('');
  const [weekFilter, setWeekFilter] = useState('current');
  const [refreshTick, setRefreshTick] = useState(0);

  const applyMonthFilter = (month: string) => {
    setMonthFilter(month);
    setWeekFilter('');
    if (month) {
      const d = parseISO(month + '-01');
      setDateFrom(format(startOfMonth(d), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(d), 'yyyy-MM-dd'));
    }
  };

  const applyWeekFilter = (val: string) => {
    setWeekFilter(val);
    setMonthFilter('');
    if (val === 'current') {
      const monday = startOfWeek(today, { weekStartsOn: 1 });
      const saturday = setDay(monday, 6, { weekStartsOn: 1 });
      setDateFrom(format(monday, 'yyyy-MM-dd'));
      setDateTo(format(saturday, 'yyyy-MM-dd'));
    }
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bu-digisac-dashboard', dateFrom, dateTo, refreshTick],
    queryFn: () => digisacApi.getBuDashboard({ startDate: dateFrom, endDate: dateTo }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const unitByKey = useMemo(() => {
    const map = new Map<DigisacBuContactTagKey, { atendimentos: number; contatos: number }>();
    for (const unit of data?.units ?? []) {
      map.set(unit.key, { atendimentos: unit.atendimentos, contatos: unit.contatos });
    }
    return map;
  }, [data]);

  const totalAtendimentos = (unitByKey.get('B1')?.atendimentos ?? 0) + (unitByKey.get('B2')?.atendimentos ?? 0);
  const totalContatos = (unitByKey.get('B1')?.contatos ?? 0) + (unitByKey.get('B2')?.contatos ?? 0);

  const buCompareData = useMemo(
    () => ['B1', 'B2'].map((name) => ({
      name,
      ...(unitByKey.get(name as DigisacBuContactTagKey) ?? emptyUnit),
    })),
    [unitByKey],
  );

  const weeklyData = useMemo(
    () => (data?.weeks ?? []).map((week) => ({
      week: week.label,
      atendimentos: week.units.B1.atendimentos + week.units.B2.atendimentos,
      contatos: week.units.B1.contatos + week.units.B2.contatos,
    })),
    [data],
  );

  const monthlyData = useMemo(
    () => (data?.months ?? []).map((month) => ({
      month: month.label,
      atendimentos: month.units.B1.atendimentos + month.units.B2.atendimentos,
      contatos: month.units.B1.contatos + month.units.B2.contatos,
    })),
    [data],
  );

  const exportCSV = () => {
    const rows = [['Data inicial', 'Data final', 'Unidade', 'Atendimentos', 'Contatos', 'Origem']];
    for (const unit of data?.units ?? []) {
      rows.push([dateFrom, dateTo, unit.key, String(unit.atendimentos), String(unit.contatos), 'digisac']);
    }
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bu_${dateFrom}_${dateTo}.csv`;
    a.click();
  };

  const months = useMemo(() => {
    const result = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(today, i);
      result.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: ptBR }) });
    }
    return result;
  }, [today]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Dashboard — Unidades de Negócio</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Headset className="h-4 w-4" />
            Dados em tempo real do Digisac (Suporte + tags de contato B1 e B2).
          </p>
        </div>
        <div className="flex gap-2">
          {canView('recorrencia_contatos') && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/recorrencia-contatos">
                <Repeat2 className="mr-2 h-4 w-4" /> Recorrências
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { setRefreshTick((n) => n + 1); void refetch(); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            const el = document.getElementById('dashboard-bu-content');
            if (!el) return;
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');
            const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: -window.scrollY, windowWidth: el.scrollWidth });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfW = pdf.internal.pageSize.getWidth() - 10;
            const pdfH = (canvas.height * pdfW) / canvas.width;
            const pageH = pdf.internal.pageSize.getHeight() - 10;
            let position = 5;
            if (pdfH <= pageH) {
              pdf.addImage(imgData, 'PNG', 5, 5, pdfW, pdfH);
            } else {
              let remainingH = pdfH;
              while (remainingH > 0) {
                pdf.addImage(imgData, 'PNG', 5, position, pdfW, pdfH);
                remainingH -= pageH;
                if (remainingH > 0) { pdf.addPage(); position = -(pdfH - remainingH) + 5; }
              }
            }
            pdf.save(`dashboard_bu_${dateFrom}_${dateTo}.pdf`);
          }}>
            <FileText className="mr-2 h-4 w-4" /> Gerar PDF
          </Button>
        </div>
      </div>

      <div id="dashboard-bu-content" className="space-y-6">
      <Card className="border shadow-sm">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" /> Filtros
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 flex-1 w-full">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">De</label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setMonthFilter(''); setWeekFilter(''); }} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Até</label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setMonthFilter(''); setWeekFilter(''); }} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Semana</label>
                <Select value={weekFilter} onValueChange={applyWeekFilter}>
                  <SelectTrigger><SelectValue placeholder="Semana" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Semana atual (seg–sáb)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mês</label>
                <Select value={monthFilter} onValueChange={applyMonthFilter}>
                  <SelectTrigger><SelectValue placeholder="Selecionar mês" /></SelectTrigger>
                  <SelectContent>
                    {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 whitespace-pre-line">
            {`Filtros de estatística integrados com Digisac.
Departamento Suporte e filtros de tags B1/B2.`}
          </p>
        </CardContent>
      </Card>

      <QueryLoadState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        errorMessage={error instanceof Error ? error.message : 'Não foi possível carregar os dados do Digisac.'}
        loadingClassName="py-12"
      >
        <>
          {(data?.warnings?.length ?? 0) > 0 && (
            <p className="text-sm text-amber-700">{data?.warnings?.join(' ')}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardContent className="py-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HelpCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Atendimentos</p>
                  <p className="text-2xl font-heading font-bold">{totalAtendimentos}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="py-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Phone className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contatos</p>
                  <p className="text-2xl font-heading font-bold">{totalContatos}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Comparativo por Unidade</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={buCompareData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="atendimentos" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} name="Atendimentos" />
                  <Bar dataKey="contatos" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} name="Contatos" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader><CardTitle className="text-lg">Comparativo Semanal</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="atendimentos" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} name="Atendimentos" />
                    <Bar dataKey="contatos" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} name="Contatos" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader><CardTitle className="text-lg">Comparativo Mensal</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="atendimentos" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 3 }} name="Atendimentos" />
                    <Line type="monotone" dataKey="contatos" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} name="Contatos" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      </QueryLoadState>
      </div>
    </div>
  );
};

export default DashboardBU;
