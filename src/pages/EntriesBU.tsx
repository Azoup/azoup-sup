import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, PenLine, Trash2, Pencil, Building2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const EntriesBU = () => {
  const queryClient = useQueryClient();
  const today = new Date();
  const [weekStart, setWeekStart] = useState(format(startOfWeek(today), 'yyyy-MM-dd'));
  const [date, setDate] = useState(format(today, 'yyyy-MM-dd'));
  const [buId, setBuId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [contacts, setContacts] = useState('');
  const [description, setDescription] = useState('');
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);

  const weekEnd = format(endOfWeek(parseISO(weekStart)), 'yyyy-MM-dd');

  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('business_units').select('*').eq('status', 'active').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['bu-records', weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doubt_records')
        .select('*, business_units(name)')
        .not('business_unit_id', 'is', null)
        .gte('record_date', weekStart)
        .lte('record_date', weekEnd)
        .order('record_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Consolidate by BU
  const consolidated = records.reduce((acc: Record<string, { buName: string; atendimentos: number; contatos: number }>, r: any) => {
    const buName = (r.business_units as any)?.name || 'Sem unidade';
    const key = r.business_unit_id || 'none';
    if (!acc[key]) acc[key] = { buName, atendimentos: 0, contatos: 0 };
    acc[key].atendimentos += r.quantity;
    acc[key].contatos += r.contacts || 0;
    return acc;
  }, {});

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('doubt_records').insert({
        record_date: date,
        analyst_id: (await supabase.from('analysts').select('id').eq('status', 'active').limit(1).single()).data?.id || '',
        quantity: parseInt(quantity) || 0,
        contacts: parseInt(contacts) || 0,
        business_unit_id: buId || null,
        description: description || null,
        source: 'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bu-records'] });
      toast.success('Lançamento registrado!');
      setQuantity(''); setContacts(''); setDescription('');
    },
    onError: () => toast.error('Erro ao registrar.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('doubt_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bu-records'] });
      toast.success('Removido!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (record: any) => {
      const { error } = await supabase.from('doubt_records').update({
        record_date: record.record_date,
        quantity: record.quantity,
        contacts: record.contacts,
        business_unit_id: record.business_unit_id || null,
        description: record.description || null,
      }).eq('id', record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bu-records'] });
      toast.success('Atualizado!');
      setEditOpen(false);
      setEditingRecord(null);
    },
    onError: () => toast.error('Erro ao atualizar.'),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-heading font-bold">Lançamentos B.U</h1>

      {/* Week filter */}
      <Card className="border shadow-sm">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Semana de:</span>
            <Input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(format(startOfWeek(parseISO(e.target.value)), 'yyyy-MM-dd'))}
              className="w-44"
            />
            <span className="text-sm text-muted-foreground">
              {format(parseISO(weekStart), 'dd/MM', { locale: ptBR })} — {format(parseISO(weekEnd), 'dd/MM', { locale: ptBR })}
            </span>
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

      {/* Manual Entry — no analyst field */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><PenLine className="h-5 w-5 text-primary" /> Novo Lançamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              <Select value={buId} onValueChange={setBuId}>
                <SelectTrigger><SelectValue placeholder="Unidade de Negócio" /></SelectTrigger>
                <SelectContent>
                  {businessUnits.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Textarea placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[40px]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input type="number" placeholder="Atendimentos" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <Input type="number" placeholder="Contatos" min="0" value={contacts} onChange={(e) => setContacts(e.target.value)} />
              <Button type="submit" disabled={createMutation.isPending || !buId}>
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
          <DialogHeader><DialogTitle>Editar Lançamento</DialogTitle></DialogHeader>
          {editingRecord && (
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editingRecord); }} className="space-y-3">
              <Input type="date" value={editingRecord.record_date} onChange={(e) => setEditingRecord({ ...editingRecord, record_date: e.target.value })} />
              <Select value={editingRecord.business_unit_id || ''} onValueChange={(v) => setEditingRecord({ ...editingRecord, business_unit_id: v })}>
                <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>{businessUnits.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder="Atendimentos" value={editingRecord.quantity} onChange={(e) => setEditingRecord({ ...editingRecord, quantity: parseInt(e.target.value) || 0 })} />
              <Input type="number" placeholder="Contatos" value={editingRecord.contacts} onChange={(e) => setEditingRecord({ ...editingRecord, contacts: parseInt(e.target.value) || 0 })} />
              <Textarea placeholder="Descrição" value={editingRecord.description || ''} onChange={(e) => setEditingRecord({ ...editingRecord, description: e.target.value })} />
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Records List */}
      <Card className="border shadow-sm">
        <CardHeader><CardTitle className="text-lg">Registros da Semana</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : records.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum registro nesta semana.</p>
          ) : (
            <div className="space-y-2">
              {records.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="text-sm text-muted-foreground w-24 shrink-0">
                      {format(new Date(r.record_date + 'T00:00:00'), 'dd/MM/yyyy')}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">{(r.business_units as any)?.name || '—'}</Badge>
                    <Badge variant={r.source === 'imported' ? 'secondary' : 'outline'} className="text-xs shrink-0">
                      {r.source === 'imported' ? 'Importado' : 'Manual'}
                    </Badge>
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
