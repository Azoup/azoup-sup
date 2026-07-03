import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ClipboardList, CheckCircle2, Clock, Users, Code2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { isKanbanCompletionSlug, resolveCompletionColumnSlug } from '@/lib/kanbanCompletionColumn';

const COLORS = ['#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function isInDateRange(
  isoDate: string | null | undefined,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  if (dateFrom && d < new Date(dateFrom)) return false;
  if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false;
  return true;
}

function matchesPeopleFilter(
  card: { analyst_id?: string | null; developer_id?: string | null },
  filterAnalystId: string,
  filterDevId: string,
): boolean {
  if (filterAnalystId && filterAnalystId !== 'all' && card.analyst_id !== filterAnalystId) return false;
  if (filterDevId && filterDevId !== 'all' && card.developer_id !== filterDevId) return false;
  return true;
}

const DashboardDev = () => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [filterAnalystId, setFilterAnalystId] = useState('');
  const [filterDevId, setFilterDevId] = useState('');

  const { data: columns = [] } = useQuery({
    queryKey: ['dev-kanban-columns'],
    queryFn: async () => {
      const { data } = await supabase.from('dev_kanban_columns').select('*').order('position');
      return data || [];
    },
  });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['dev-kanban-cards-dashboard'],
    queryFn: async () => {
      const { data } = await supabase.from('dev_kanban_cards').select('*');
      return data || [];
    },
  });

  const { data: analysts = [] } = useQuery({
    queryKey: ['analysts-active'],
    queryFn: async () => {
      const { data } = await supabase.from('analysts').select('*').eq('status', 'active');
      return data || [];
    },
  });

  const { data: developers = [] } = useQuery({
    queryKey: ['developers-active'],
    queryFn: async () => {
      const { data } = await supabase.from('developers').select('*').eq('status', 'active');
      return data || [];
    },
  });

  const { data: cardLabels = [] } = useQuery({
    queryKey: ['dev-kanban-card-labels-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('dev_kanban_card_labels').select('*, dev_kanban_labels(*)');
      return data || [];
    },
  });

  const applyMonthFilter = (month: string) => {
    setMonthFilter(month);
    if (month && month !== 'all') {
      const d = parseISO(month + '-01');
      setDateFrom(format(startOfMonth(d), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(d), 'yyyy-MM-dd'));
    } else {
      setMonthFilter('');
      setDateFrom('');
      setDateTo('');
    }
  };

  const hasDateFilter = !!(dateFrom || dateTo);

  const completionColumnSlug = useMemo(
    () => resolveCompletionColumnSlug(columns, 'dev'),
    [columns],
  );

  const filteredCards = useMemo(() => {
    return cards.filter((c: any) => {
      if (dateFrom && new Date(c.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(c.created_at) > new Date(dateTo + 'T23:59:59')) return false;
      if (!matchesPeopleFilter(c, filterAnalystId, filterDevId)) return false;
      return true;
    });
  }, [cards, dateFrom, dateTo, filterAnalystId, filterDevId]);

  const totalCards = filteredCards.length;

  /** Com filtro de datas: tickets concluídos no período (completed_at). Sem filtro: tickets na coluna de conclusão. */
  const doneCards = useMemo(() => {
    if (hasDateFilter) {
      return cards.filter((c: any) => {
        if (!matchesPeopleFilter(c, filterAnalystId, filterDevId)) return false;
        if (c.completed_at && isInDateRange(c.completed_at, dateFrom, dateTo)) return true;
        // Fallback: cards antigos sem completed_at, mas já na coluna de conclusão e criados no período
        if (
          !c.completed_at &&
          isKanbanCompletionSlug(c.status, completionColumnSlug) &&
          isInDateRange(c.created_at, dateFrom, dateTo)
        ) {
          return true;
        }
        return false;
      }).length;
    }
    return filteredCards.filter((c: any) =>
      isKanbanCompletionSlug(c.status, completionColumnSlug),
    ).length;
  }, [cards, filteredCards, hasDateFilter, dateFrom, dateTo, filterAnalystId, filterDevId, completionColumnSlug]);

  const inProgressCards = filteredCards.filter((c: any) => c.status === 'em-andamento').length;

  const statusData = useMemo(() => {
    const colSlugs = new Set(columns.map((col: any) => col.slug));
    const rows = columns.map((col: any) => ({
      name: col.title,
      cards: filteredCards.filter((c: any) => c.status === col.slug).length,
    }));
    const orphanCards = filteredCards.filter((c: any) => !colSlugs.has(c.status)).length;
    if (orphanCards > 0) {
      rows.push({ name: 'Sem lista correspondente', cards: orphanCards });
    }
    return rows;
  }, [filteredCards, columns]);

  const statusChartLayout = useMemo(() => {
    const rowCount = Math.max(statusData.length, 1);
    const maxLabelLen = statusData.reduce((max, row) => Math.max(max, row.name.length), 8);
    return {
      height: Math.max(280, rowCount * 44 + 40),
      yAxisWidth: Math.min(220, Math.max(104, Math.ceil(maxLabelLen * 7.2))),
    };
  }, [statusData]);

  const devData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredCards.forEach((c: any) => {
      if (c.developer_id) {
        const d = developers.find((d: any) => d.id === c.developer_id);
        const name = d?.name || 'Sem dev';
        map[name] = (map[name] || 0) + 1;
      }
    });
    return Object.entries(map).map(([name, count]) => ({ name, cards: count }));
  }, [filteredCards, developers]);

  const analystData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredCards.forEach((c: any) => {
      if (c.analyst_id) {
        const a = analysts.find((a: any) => a.id === c.analyst_id);
        const name = a?.name || 'Sem analista';
        map[name] = (map[name] || 0) + 1;
      }
    });
    return Object.entries(map).map(([name, count]) => ({ name, cards: count }));
  }, [filteredCards, analysts]);

  const labelData = useMemo(() => {
    const cardIds = new Set(filteredCards.map((c: any) => c.id));
    const map: Record<string, { name: string; count: number; color: string }> = {};
    cardLabels.forEach((cl: any) => {
      if (cl.dev_kanban_labels && cardIds.has(cl.card_id)) {
        const l = cl.dev_kanban_labels;
        if (!map[l.id]) map[l.id] = { name: l.name, count: 0, color: l.color };
        map[l.id].count++;
      }
    });
    return Object.values(map);
  }, [cardLabels, filteredCards]);

  const months = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c: any) => set.add(format(new Date(c.created_at), 'yyyy-MM')));
    return [...set].sort().reverse();
  }, [cards]);

  const handleExportPDF = async () => {
    const el = document.getElementById('dashboard-dev-content');
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = (canvas.height * pdfW) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    pdf.save('dashboard-dev.pdf');
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-heading font-bold">Dashboard DEV</h1>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>Gerar PDF</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">De</label>
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setMonthFilter(''); }} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Até</label>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setMonthFilter(''); }} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Mês</label>
          <Select value={monthFilter} onValueChange={applyMonthFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {months.map(m => (
                <SelectItem key={m} value={m}>{format(parseISO(m + '-01'), 'MMM yyyy', { locale: ptBR })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Analista</label>
          <Select value={filterAnalystId} onValueChange={setFilterAnalystId}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {analysts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Desenvolvedor</label>
          <Select value={filterDevId} onValueChange={setFilterDevId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {developers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div id="dashboard-dev-content" className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <ClipboardList className="h-6 w-6 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{totalCards}</p>
              <p className="text-xs text-muted-foreground">
                {hasDateFilter ? 'Criados no período' : 'Total de Cards'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-500 mb-1" />
              <p className="text-2xl font-bold">{doneCards}</p>
              <p className="text-xs text-muted-foreground">
                {hasDateFilter ? 'Concluídos no período' : 'Finalizados (lista atual)'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Clock className="h-6 w-6 mx-auto text-amber-500 mb-1" />
              <p className="text-2xl font-bold">{inProgressCards}</p>
              <p className="text-xs text-muted-foreground">Em Andamento</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Code2 className="h-6 w-6 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold">{devData.length}</p>
              <p className="text-xs text-muted-foreground">Devs Ativos</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className={statusData.length > 4 ? 'lg:col-span-2' : undefined}>
            <CardHeader>
              <CardTitle className="text-sm">Cards por Status (listas do Kanban DEV)</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">
                {hasDateFilter
                  ? 'Tickets criados no período selecionado, agrupados pela lista em que estão hoje.'
                  : 'Todos os tickets, agrupados pela lista em que estão hoje.'}
              </p>
            </CardHeader>
            <CardContent>
              {statusData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma lista configurada no Kanban DEV.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={statusChartLayout.height}>
                  <BarChart
                    data={statusData}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={statusChartLayout.yAxisWidth}
                      tick={{ fontSize: 11 }}
                      interval={0}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value} card(s)`, 'Total']}
                      labelFormatter={(label) => `Lista: ${label}`}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Bar
                      dataKey="cards"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                      minPointSize={2}
                      label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Volume por Desenvolvedor</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={devData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="cards" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Volume por Analista</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={analystData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="cards" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {labelData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Cards por Etiqueta</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Pie
                      data={labelData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="42%"
                      outerRadius="70%"
                      innerRadius="40%"
                      paddingAngle={2}
                      label={false}
                      labelLine={false}
                    >
                      {labelData.map((entry, i) => (
                        <Cell key={entry.name} fill={entry.color || COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value} card(s)`, name]}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      layout="horizontal"
                      iconType="circle"
                      wrapperStyle={{ paddingTop: '12px', fontSize: '12px', lineHeight: '20px', maxHeight: '90px', overflowY: 'auto' }}
                      formatter={(value: string, entry: any) => (
                        <span className="text-foreground">
                          {value} <span className="text-muted-foreground">({entry?.payload?.count ?? 0})</span>
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardDev;
