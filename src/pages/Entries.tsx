import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseReady } from '@/hooks/useSupabaseReady';
import { assertSupabaseData } from '@/lib/supabaseQuery';
import { logActivity } from '@/hooks/useActivityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Trash2, PenLine, Pencil, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { useMemo } from 'react';

const Entries = () => {
  const { ready: supabaseReady } = useSupabaseReady();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [analystId, setAnalystId] = useState('');
  const [doubts, setDoubts] = useState('');
  const [description, setDescription] = useState('');
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [filterFrom, setFilterFrom] = useState(todayStr);
  const [filterTo, setFilterTo] = useState(todayStr);

  const { data: analysts = [] } = useQuery({
    queryKey: ['analysts-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('analysts').select('*').eq('status', 'active').order('name');
      return assertSupabaseData(data, error, 'analysts');
    },
    enabled: supabaseReady,
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['doubt-records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doubt_records')
        .select('*, analysts(name)')
        .is('business_unit_id', null)
        .order('record_date', { ascending: false })
        .limit(50);
      return assertSupabaseData(data, error, 'doubt_records');
    },
    enabled: supabaseReady,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!analystId) throw new Error('Selecione um analista.');
      if (!date) throw new Error('Selecione a data do lançamento.');
      const doubtsNum = parseInt(doubts, 10);
      if (Number.isNaN(doubtsNum) || doubtsNum <= 0) throw new Error('Informe um valor maior que zero para dúvidas.');

      const { error } = await supabase.from('doubt_records').insert({
        record_date: date,
        analyst_id: analystId,
        doubts: doubtsNum,
        quantity: doubtsNum,
        contacts: 0,
        description: description || null,
        source: 'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doubt-records'] });
      queryClient.invalidateQueries({ queryKey: ['doubt-records-all'] });
      toast.success('Lançamento registrado!');
      logActivity('Criação de lançamento (Dúvidas)', `Analista: ${analystId}, Data: ${date}, Dúvidas: ${doubts}`);
      setDoubts(''); setDescription('');
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'Erro ao registrar.')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('doubt_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['doubt-records'] });
      queryClient.invalidateQueries({ queryKey: ['doubt-records-all'] });
      toast.success('Lançamento removido!');
      logActivity('Exclusão de lançamento (Dúvidas)', `ID: ${id}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (record: any) => {
      if (!record?.analyst_id) throw new Error('Selecione um analista.');
      const doubtsNum = parseInt(String(record?.doubts ?? ''), 10);
      if (Number.isNaN(doubtsNum) || doubtsNum <= 0) throw new Error('Informe um valor maior que zero para dúvidas.');

      const { error } = await supabase.from('doubt_records').update({
        record_date: record.record_date,
        analyst_id: record.analyst_id,
        doubts: doubtsNum,
        quantity: doubtsNum,
        description: record.description || null,
      }).eq('id', record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doubt-records'] });
      queryClient.invalidateQueries({ queryKey: ['doubt-records-all'] });
      toast.success('Atualizado!');
      logActivity('Edição de lançamento (Dúvidas)');
      setEditOpen(false);
      setEditingRecord(null);
    },
    onError: (err: any) => toast.error('Erro: ' + (err?.message || 'Erro ao atualizar.')),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-heading font-bold">Lançamentos Dúvidas</h1>

      {/* Manual Entry */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><PenLine className="h-5 w-5 text-primary" /> Novo Lançamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              <Select value={analystId} onValueChange={setAnalystId}>
                <SelectTrigger><SelectValue placeholder="Selecione analista" /></SelectTrigger>
                <SelectContent>
                  {analysts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Dúvidas" min="0" value={doubts} onChange={(e) => setDoubts(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Textarea placeholder="Observações (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[40px] sm:col-span-2" />
              <Button type="submit" disabled={createMutation.isPending || !analystId} className="self-end">
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!v) setEditingRecord(null); setEditOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
            <DialogDescription>Altere os dados do lançamento abaixo.</DialogDescription>
          </DialogHeader>
          {editingRecord && (
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editingRecord); }} className="space-y-3">
              <Input type="date" value={editingRecord.record_date} onChange={(e) => setEditingRecord({ ...editingRecord, record_date: e.target.value })} />
              <Select value={editingRecord.analyst_id} onValueChange={(v) => setEditingRecord({ ...editingRecord, analyst_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{analysts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder="Dúvidas" value={editingRecord.doubts || 0} onChange={(e) => setEditingRecord({ ...editingRecord, doubts: parseInt(e.target.value) || 0 })} />
              <Textarea placeholder="Observações" value={editingRecord.description || ''} onChange={(e) => setEditingRecord({ ...editingRecord, description: e.target.value })} />
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Records List */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Últimos Lançamentos</CardTitle>
          <div className="flex items-center gap-3 pt-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-auto" placeholder="De" />
            <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-auto" placeholder="Até" />
            {(filterFrom || filterTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterFrom(''); setFilterTo(''); }}>Limpar</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : records.filter((r: any) => {
            if (filterFrom && r.record_date < filterFrom) return false;
            if (filterTo && r.record_date > filterTo) return false;
            return true;
          }).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum lançamento encontrado.</p>
          ) : (
            <div className="space-y-2">
              {records.filter((r: any) => {
                if (filterFrom && r.record_date < filterFrom) return false;
                if (filterTo && r.record_date > filterTo) return false;
                return true;
              }).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground w-24">
                      {format(new Date(r.record_date + 'T00:00:00'), 'dd/MM/yyyy')}
                    </span>
                    <span className="font-medium">{(r.analysts as any)?.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-primary/10 text-primary text-sm font-bold">
                      Dv: {r.doubts || 0}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => { setEditingRecord(r); setEditOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(r.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
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

export default Entries;
