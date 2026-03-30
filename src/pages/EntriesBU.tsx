import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logActivity } from '@/hooks/useActivityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, PenLine, Trash2, Pencil, Building2, Calendar } from 'lucide-react';
import { format, startOfWeek, addWeeks, parseISO, getWeek, setDay, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function getWeeksForSelection() {
  const weeks = [];
  const today = new Date();
  for (let i = -8; i <= 1; i++) {
    const refDate = addWeeks(today, i);
    const monday = startOfWeek(refDate, { weekStartsOn: 1 });
    const saturday = setDay(monday, 6, { weekStartsOn: 1 });
    const weekNum = getWeek(monday, { weekStartsOn: 1 });
    const label = `Semana ${weekNum} — ${format(monday, 'dd/MM', { locale: ptBR })} a ${format(saturday, 'dd/MM', { locale: ptBR })}`;
    const value = format(monday, 'yyyy-MM-dd');
    weeks.push({ label, value, monday, saturday });
  }
  return weeks;
}

const EntriesBU = () => {
  const queryClient = useQueryClient();
  const today = new Date();
  const currentMonday = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const [selectedWeek, setSelectedWeek] = useState(currentMonday);
  const [monthFilter, setMonthFilter] = useState('');
  const [buId, setBuId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [contacts, setContacts] = useState('');
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);

  const weeks = useMemo(() => getWeeksForSelection(), []);

  const months = useMemo(() => {
    const result = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(today, i);
      result.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: ptBR }) });
    }
    return result;
  }, []);

  // Determine query date range based on month filter or selected week
  const queryRange = useMemo(() => {
    if (monthFilter) {
      const d = parseISO(monthFilter + '-01');
      return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') };
    }
    const weekMonday = parseISO(selectedWeek);
    const weekSaturday = setDay(weekMonday, 6, { weekStartsOn: 1 });
    return { start: selectedWeek, end: format(weekSaturday, 'yyyy-MM-dd') };
  }, [selectedWeek, monthFilter]);

  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('business_units').select('*').eq('status', 'active').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['bu-records', queryRange.start, queryRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doubt_records')
        .select('*, business_units(name)')
        .not('business_unit_id', 'is', null)
        .gte('record_date', queryRange.start)
        .lte('record_date', queryRange.end)
        .order('record_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const consolidated = useMemo(() => {
    return records.reduce((acc: Record<string, { buName: string; atendimentos: number; contatos: number }>, r: any) => {
      const buName = (r.business_units as any)?.name || 'Sem unidade';
      const key = r.business_unit_id || 'none';
      if (!acc[key]) acc[key] = { buName, atendimentos: 0, contatos: 0 };
      acc[key].atendimentos += r.quantity;
      acc[key].contatos += r.contacts || 0;
      return acc;
    }, {});
  }, [records]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!buId) throw new Error('Selecione uma unidade de negócio.');
      const { data: analyst } = await supabase.from('analysts').select('id').limit(1).single();
      if (!analyst) throw new Error('Nenhum analista cadastrado no sistema.');

      const { error } = await supabase.from('doubt_records').insert({
        record_date: selectedWeek,
        analyst_id: analyst.id,
        quantity: parseInt(quantity) || 0,
        contacts: parseInt(contacts) || 0,
        doubts: 0,
        business_unit_id: buId,
        source: 'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bu-records'] });
      queryClient.invalidateQueries({ queryKey: ['bu-records-dashboard'] });
      toast.success('Lançamento registrado!');
      logActivity('Criação de lançamento (B.U)', `B.U: ${buId}, Qtd: ${quantity}, Contatos: ${contacts}`);
      setQuantity(''); setContacts('');
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'Erro ao registrar.')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('doubt_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bu-records'] });
      queryClient.invalidateQueries({ queryKey: ['bu-records-dashboard'] });
      toast.success('Removido!');
      logActivity('Exclusão de lançamento (B.U)');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (record: any) => {
      const { error } = await supabase.from('doubt_records').update({
        quantity: record.quantity,
        contacts: record.contacts,
        business_unit_id: record.business_unit_id || null,
      }).eq('id', record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bu-records'] });
      queryClient.invalidateQueries({ queryKey: ['bu-records-dashboard'] });
      toast.success('Atualizado!');
      logActivity('Edição de lançamento (B.U)');
      setEditOpen(false);
      setEditingRecord(null);
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'Erro ao atualizar.')),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-heading font-bold">Lançamentos B.U</h1>

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Semana:</span>
              <Select value={selectedWeek} onValueChange={(v) => { setSelectedWeek(v); setMonthFilter(''); }}>
                <SelectTrigger className="w-80">
                  <SelectValue placeholder="Selecione a semana" />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map((w) => (
                    <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Mês:</span>
              <Select value={monthFilter} onValueChange={(v) => setMonthFilter(v)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Todos (semana)" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {monthFilter && (
                <Button variant="ghost" size="sm" onClick={() => setMonthFilter('')}>Limpar</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consolidated View */}
      {Object.keys(consolidated).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.values(consolidated).map((c) => (
            <Card key={c.buName} className="border shadow-sm">
              <CardContent className="py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{c.buName}</p>
                  <p className="text-sm text-muted-foreground">At: {c.atendimentos} · Ct: {c.contatos}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Entry */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><PenLine className="h-5 w-5 text-primary" /> Novo Lançamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select value={buId} onValueChange={setBuId}>
                <SelectTrigger><SelectValue placeholder="Unidade de Negócio" /></SelectTrigger>
                <SelectContent>
                  {businessUnits.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Atendimentos" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <Input type="number" placeholder="Contatos" min="0" value={contacts} onChange={(e) => setContacts(e.target.value)} />
            </div>
            <Button type="submit" disabled={createMutation.isPending || !buId}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!v) setEditingRecord(null); setEditOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
            <DialogDescription>Altere os dados do lançamento B.U abaixo.</DialogDescription>
          </DialogHeader>
          {editingRecord && (
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editingRecord); }} className="space-y-3">
              <Select value={editingRecord.business_unit_id || ''} onValueChange={(v) => setEditingRecord({ ...editingRecord, business_unit_id: v })}>
                <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>{businessUnits.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder="Atendimentos" value={editingRecord.quantity} onChange={(e) => setEditingRecord({ ...editingRecord, quantity: parseInt(e.target.value) || 0 })} />
              <Input type="number" placeholder="Contatos" value={editingRecord.contacts} onChange={(e) => setEditingRecord({ ...editingRecord, contacts: parseInt(e.target.value) || 0 })} />
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Records List */}
      <Card className="border shadow-sm">
        <CardHeader><CardTitle className="text-lg">Registros {monthFilter ? 'do Mês' : 'da Semana'}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : records.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum registro neste período.</p>
          ) : (
            <div className="space-y-2">
              {records.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Badge variant="outline" className="text-xs shrink-0">{(r.business_units as any)?.name || '—'}</Badge>
                    <span className="text-xs text-muted-foreground">{format(parseISO(r.record_date), 'dd/MM/yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">At: {r.quantity}</span>
                    <span className="text-xs text-muted-foreground">Ct: {r.contacts}</span>
                    <Button size="icon" variant="ghost" onClick={() => { setEditingRecord(r); setEditOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(r.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EntriesBU;
