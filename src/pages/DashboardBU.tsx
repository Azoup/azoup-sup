import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { Building2, Download, Loader2, Filter, Phone, HelpCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, startOfWeek, setDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DashboardBU = () => {
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(setDay(startOfWeek(today, { weekStartsOn: 1 }), 6, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [monthFilter, setMonthFilter] = useState('');
  const [weekFilter, setWeekFilter] = useState('current');

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

  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units'],
    queryFn: async () => {
      const { data, error } = await supabase.from('business_units').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['bu-records-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doubt_records')
        .select('*, business_units(name)')
        .not('business_unit_id', 'is', null)
        .order('record_date');
      if (error) throw error;
      return data;
    },
  });

  const filteredRecords = useMemo(() => {
    return records.filter((r: any) => r.record_date >= dateFrom && r.record_date <= dateTo);
  }, [records, dateFrom, dateTo]);

  const totalAtendimentos = useMemo(() => filteredRecords.reduce((s: number, r: any) => s + r.quantity, 0), [filteredRecords]);
  const totalContatos = useMemo(() => filteredRecords.reduce((s: number, r: any) => s + (r.contacts || 0), 0), [filteredRecords]);

  const buCompareData = useMemo(() => {
    const map = new Map<string, { atendimentos: number; contatos: number }>();
    filteredRecords.forEach((r: any) => {
      const buName = (r.business_units as any)?.name || 'Sem unidade';
      const existing = map.get(buName) || { atendimentos: 0, contatos: 0 };
      existing.atendimentos += r.quantity;
      existing.contatos += r.contacts || 0;
      map.set(buName, existing);
    });
    return Array.from(map.entries()).map(([name, vals]) => ({ name, ...vals }));
  }, [filteredRecords]);

  const weeklyData = useMemo(() => {
    const map = new Map<string, { atendimentos: number; contatos: number }>();
    filteredRecords.forEach((r: any) => {
      const key = format(startOfWeek(parseISO(r.record_date), { weekStartsOn: 1 }), 'dd/MM');
      const existing = map.get(key) || { atendimentos: 0, contatos: 0 };
      existing.atendimentos += r.quantity;
      existing.contatos += r.contacts || 0;
      map.set(key, existing);
    });
    return Array.from(map.entries()).map(([week, vals]) => ({ week, ...vals }));
  }, [filteredRecords]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { atendimentos: number; contatos: number }>();
    filteredRecords.forEach((r: any) => {
      const key = r.record_date.slice(0, 7);
      const existing = map.get(key) || { atendimentos: 0, contatos: 0 };
      existing.atendimentos += r.quantity;
      existing.contatos += r.contacts || 0;
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, vals]) => ({ month, ...vals }));
  }, [filteredRecords]);

  const exportCSV = () => {
    const rows = [['Data', 'Unidade', 'Atendimentos', 'Contatos', 'Origem']];
    filteredRecords.forEach((r: any) => {
      rows.push([r.record_date, (r.business_units as any)?.name || '', String(r.quantity), String(r.contacts || 0), r.source || 'manual']);
    });
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
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-heading font-bold">Dashboard — Unidades de Negócio</h1>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

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
                    <SelectItem value="current">Semana atual</SelectItem>
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
        </CardContent>
      </Card>

      {/* KPI Cards */}
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

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* BU Comparison */}
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

          {/* Weekly & Monthly */}
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
      )}
    </div>
  );
};

export default DashboardBU;
