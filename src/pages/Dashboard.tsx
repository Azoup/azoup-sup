import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseReady } from '@/hooks/useSupabaseReady';
import { assertSupabaseData } from '@/lib/supabaseQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { HelpCircle, TrendingUp, Users, Download, Loader2, Filter, Trophy, FileText } from 'lucide-react';
import { useRef } from 'react';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ViewMode = 'daily' | 'weekly' | 'monthly';

const Dashboard = () => {
  const { ready: supabaseReady } = useSupabaseReady();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [monthFilter, setMonthFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [showInactive, setShowInactive] = useState(false);

  const applyMonthFilter = (month: string) => {
    setMonthFilter(month);
    if (month) {
      const d = parseISO(month + '-01');
      setDateFrom(format(startOfMonth(d), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(d), 'yyyy-MM-dd'));
    }
  };

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['doubt-records-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('doubt_records').select('*, analysts(name, status, photo_url)').is('business_unit_id', null).order('record_date');
      return assertSupabaseData(data, error, 'doubt_records');
    },
    enabled: supabaseReady,
  });

  const filteredRecords = useMemo(() => {
    return records.filter((r: any) => {
      const d = r.record_date;
      const inRange = d >= dateFrom && d <= dateTo;
      const analystData = r.analysts as any;
      const activeFilter = showInactive || analystData?.status === 'active';
      return inRange && activeFilter;
    });
  }, [records, dateFrom, dateTo, showInactive]);

  const totalDoubts = useMemo(() => filteredRecords.reduce((s: number, r: any) => s + (r.doubts || 0), 0), [filteredRecords]);

  const activeAnalysts = useMemo(() => {
    const ids = new Set(filteredRecords.map((r: any) => r.analyst_id));
    return ids.size;
  }, [filteredRecords]);

  const avgPerAnalyst = activeAnalysts > 0 ? Math.round(totalDoubts / activeAnalysts) : 0;

  const lineData = useMemo(() => {
    const map = new Map<string, number>();
    filteredRecords.forEach((r: any) => {
      let key = r.record_date;
      if (viewMode === 'weekly') key = format(startOfWeek(parseISO(r.record_date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      else if (viewMode === 'monthly') key = r.record_date.slice(0, 7);
      map.set(key, (map.get(key) || 0) + (r.doubts || 0));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, duvidas]) => ({
        date: viewMode === 'monthly' ? date : format(parseISO(date), 'dd/MM', { locale: ptBR }),
        duvidas,
      }));
  }, [filteredRecords, viewMode]);

  const barData = useMemo(() => {
    const map = new Map<string, number>();
    filteredRecords.forEach((r: any) => {
      const name = (r.analysts as any)?.name || 'Desconhecido';
      map.set(name, (map.get(name) || 0) + (r.doubts || 0));
    });
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, duvidas]) => ({ name, duvidas }));
  }, [filteredRecords]);

  const analystRanking = useMemo(() => {
    const map = new Map<string, { name: string; duvidas: number; photo_url: string | null }>();
    filteredRecords.forEach((r: any) => {
      const a = r.analysts as any;
      const existing = map.get(r.analyst_id);
      if (existing) {
        existing.duvidas += r.doubts || 0;
      } else {
        map.set(r.analyst_id, { name: a?.name || '', duvidas: r.doubts || 0, photo_url: a?.photo_url });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.duvidas - a.duvidas);
  }, [filteredRecords]);

  const exportCSV = () => {
    const rows = [['Data', 'Analista', 'Dúvidas', 'Origem']];
    filteredRecords.forEach((r: any) => {
      rows.push([r.record_date, (r.analysts as any)?.name || '', String(r.doubts || 0), r.source || 'manual']);
    });
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `duvidas_${dateFrom}_${dateTo}.csv`;
    a.click();
  };

  const months = useMemo(() => {
    const result = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(today, i);
      result.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: ptBR }) });
    }
    return result;
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-heading font-bold">Dashboard — Dúvidas</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            const el = document.getElementById('dashboard-duvidas-content');
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
            pdf.save(`dashboard_duvidas_${dateFrom}_${dateTo}.pdf`);
          }}>
            <FileText className="mr-2 h-4 w-4" /> Gerar PDF
          </Button>
        </div>
      </div>

      <div id="dashboard-duvidas-content">
      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" /> Filtros
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 flex-1 w-full">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">De</label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setMonthFilter(''); }} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Até</label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setMonthFilter(''); }} />
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
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Visualização</label>
                <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diário</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
              Incluir inativos
            </label>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="py-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <HelpCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Dúvidas</p>
              <p className="text-2xl font-heading font-bold">{totalDoubts}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="py-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-chart-4/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-chart-4" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Analistas Ativos</p>
              <p className="text-2xl font-heading font-bold">{activeAnalysts}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="py-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-chart-3/10 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-chart-3" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Média/Analista</p>
              <p className="text-2xl font-heading font-bold">{avgPerAnalyst}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader><CardTitle className="text-lg">Evolução de Dúvidas</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={lineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="duvidas" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Dúvidas" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader><CardTitle className="text-lg">Dúvidas por Analista</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="duvidas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Dúvidas" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Analyst Ranking */}
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-chart-3" /> Ranking de Analistas — Dúvidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analystRanking.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum dado no período selecionado.</p>
              ) : (
                <div className="space-y-2">
                  {analystRanking.map((a, i) => (
                    <div key={a.name} className={`flex items-center gap-4 py-3 px-4 rounded-xl transition-colors ${i === 0 ? 'bg-chart-3/10' : 'hover:bg-muted/50'}`}>
                      <span className="text-lg font-heading font-bold text-muted-foreground w-8">{i + 1}º</span>
                      <ProfileAvatar
                        className="h-10 w-10"
                        photoUrl={a.photo_url}
                        fallbackLabel={a.name}
                      />
                      <span className="flex-1 font-medium">{a.name}</span>
                      <span className="inline-flex items-center justify-center min-w-[2.5rem] px-3 py-1 rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {a.duvidas}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      </div>
    </div>
  );
};

export default Dashboard;
