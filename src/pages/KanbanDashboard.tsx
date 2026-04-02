import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ClipboardList, CheckCircle2, Clock, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const KanbanDashboard = () => {
  const { data: columns = [] } = useQuery({
    queryKey: ['kanban-columns'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_columns').select('*').order('position');
      return data || [];
    },
  });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['kanban-cards'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_cards').select('*');
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

  const { data: cardLabels = [] } = useQuery({
    queryKey: ['kanban-card-labels'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_card_labels').select('*, kanban_labels(*)');
      return data || [];
    },
  });

  const { data: labels = [] } = useQuery({
    queryKey: ['kanban-labels'],
    queryFn: async () => {
      const { data } = await supabase.from('kanban_labels').select('*');
      return data || [];
    },
  });

  const totalCards = cards.length;
  const doneCards = cards.filter((c: any) => c.status === 'done').length;
  const pendingCards = cards.filter((c: any) => c.status === 'pending').length;

  const analystData = useMemo(() => {
    const map: Record<string, number> = {};
    cards.forEach((c: any) => {
      if (c.analyst_id) {
        const a = analysts.find((a: any) => a.id === c.analyst_id);
        const name = a?.name || 'Sem analista';
        map[name] = (map[name] || 0) + 1;
      }
    });
    return Object.entries(map).map(([name, count]) => ({ name, cards: count }));
  }, [cards, analysts]);

  const labelData = useMemo(() => {
    const map: Record<string, { name: string; count: number; color: string }> = {};
    cardLabels.forEach((cl: any) => {
      if (cl.kanban_labels) {
        const l = cl.kanban_labels;
        if (!map[l.id]) map[l.id] = { name: l.name, count: 0, color: l.color };
        map[l.id].count++;
      }
    });
    return Object.values(map);
  }, [cardLabels]);

  const statusData = useMemo(() => {
    return columns.map((col: any) => ({
      name: col.title,
      cards: cards.filter((c: any) => c.status === col.slug).length,
    }));
  }, [cards, columns]);

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-heading font-bold">Dashboard Kanban</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <ClipboardList className="h-6 w-6 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{totalCards}</p>
            <p className="text-xs text-muted-foreground">Total de Cards</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-500 mb-1" />
            <p className="text-2xl font-bold">{doneCards}</p>
            <p className="text-xs text-muted-foreground">Concluídos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Clock className="h-6 w-6 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold">{pendingCards}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Users className="h-6 w-6 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold">{analystData.length}</p>
            <p className="text-xs text-muted-foreground">Analistas Ativos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cards por Status */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Cards por Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="cards" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cards por Analista */}
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

        {/* Cards por Etiqueta */}
        {labelData.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-sm">Cards por Etiqueta</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={labelData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={100}
                    label={({ name, count }) => `${name}: ${count}`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {labelData.map((entry, i) => (
                      <Cell key={entry.name} fill={entry.color || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default KanbanDashboard;
