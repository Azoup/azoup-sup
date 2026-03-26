import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Trash2, PenLine } from 'lucide-react';
import { format } from 'date-fns';

const Entries = () => {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [analystId, setAnalystId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [contacts, setContacts] = useState('');

  const { data: analysts = [] } = useQuery({
    queryKey: ['analysts-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('analysts').select('*').eq('status', 'active').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['doubt-records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doubt_records')
        .select('*, analysts(name)')
        .order('record_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('doubt_records').insert({
        record_date: date,
        analyst_id: analystId,
        quantity: parseInt(quantity) || 0,
        contacts: parseInt(contacts) || 0,
        source: 'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doubt-records'] });
      toast.success('Lançamento registrado!');
      setQuantity(''); setContacts('');
    },
    onError: () => toast.error('Erro ao registrar lançamento.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('doubt_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doubt-records'] });
      toast.success('Lançamento removido!');
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-heading font-bold">Lançamentos</h1>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><PenLine className="h-5 w-5 text-primary" /> Novo Lançamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
            className="grid grid-cols-1 sm:grid-cols-5 gap-3"
          >
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <Select value={analystId} onValueChange={setAnalystId} required>
              <SelectTrigger><SelectValue placeholder="Selecione analista" /></SelectTrigger>
              <SelectContent>
                {analysts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Atendimentos" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            <Input type="number" placeholder="Contatos" min="0" value={contacts} onChange={(e) => setContacts(e.target.value)} />
            <Button type="submit" disabled={createMutation.isPending || !analystId}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader><CardTitle className="text-lg">Últimos Lançamentos</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : records.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum lançamento registrado.</p>
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground w-24">
                      {format(new Date(r.record_date + 'T00:00:00'), 'dd/MM/yyyy')}
                    </span>
                    <span className="font-medium">{(r.analysts as any)?.name}</span>
                    <Badge variant={r.source === 'imported' ? 'secondary' : 'outline'} className="text-xs">
                      {r.source === 'imported' ? 'Importado' : 'Manual'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-primary/10 text-primary text-sm font-bold">
                      {r.quantity}
                    </span>
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-accent/10 text-accent text-sm font-bold">
                      {r.contacts}
                    </span>
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
