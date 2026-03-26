import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Trash2, PenLine, Upload, FileSpreadsheet, Eye, Check, X, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface PreviewRow {
  analyst_name: string;
  record_date: string;
  doubts: number;
  analyst_id?: string;
}

const Entries = () => {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [analystId, setAnalystId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [contacts, setContacts] = useState('');
  const [doubts, setDoubts] = useState('');
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);

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
        doubts: parseInt(doubts) || 0,
        source: 'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doubt-records'] });
      queryClient.invalidateQueries({ queryKey: ['doubt-records-all'] });
      toast.success('Lançamento registrado!');
      setQuantity(''); setContacts(''); setDoubts('');
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
      queryClient.invalidateQueries({ queryKey: ['doubt-records-all'] });
      toast.success('Lançamento removido!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (record: any) => {
      const { error } = await supabase.from('doubt_records').update({
        record_date: record.record_date,
        analyst_id: record.analyst_id,
        quantity: record.quantity,
        contacts: record.contacts,
        doubts: record.doubts,
      }).eq('id', record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doubt-records'] });
      queryClient.invalidateQueries({ queryKey: ['doubt-records-all'] });
      toast.success('Atualizado!');
      setEditOpen(false);
      setEditingRecord(null);
    },
    onError: () => toast.error('Erro ao atualizar.'),
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(ws);

        const rows: PreviewRow[] = json.map((row: any) => {
          const analystName = row['Analista'] || row['analista'] || row['Nome'] || row['nome'] || '';
          const dateVal = row['Data'] || row['data'] || '';
          let parsedDate = '';
          if (typeof dateVal === 'number') {
            const d = XLSX.SSF.parse_date_code(dateVal);
            parsedDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
          } else if (typeof dateVal === 'string') {
            parsedDate = dateVal.includes('/') ? dateVal.split('/').reverse().join('-') : dateVal;
          }
          const dbt = parseInt(row['Dúvidas'] || row['duvidas'] || row['Quantidade'] || row['quantidade'] || '0');
          const match = analysts.find((a) => a.name.toLowerCase().trim() === analystName.toLowerCase().trim());

          return { analyst_name: analystName, record_date: parsedDate, doubts: dbt, analyst_id: match?.id };
        }).filter((r: PreviewRow) => r.analyst_name && r.record_date);

        setPreviewData(rows);
        setShowPreview(true);
      } catch {
        toast.error('Erro ao ler arquivo Excel.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }, [analysts]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const validRows = previewData.filter((r) => r.analyst_id);
      if (validRows.length === 0) throw new Error('Nenhum analista válido');

      const inserts = validRows.map((r) => ({
        record_date: r.record_date,
        analyst_id: r.analyst_id!,
        doubts: r.doubts,
        quantity: 0,
        contacts: 0,
        source: 'imported' as const,
      }));

      const { error } = await supabase.from('doubt_records').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doubt-records'] });
      queryClient.invalidateQueries({ queryKey: ['doubt-records-all'] });
      toast.success(`${previewData.filter((r) => r.analyst_id).length} registros importados!`);
      setShowPreview(false);
      setPreviewData([]);
    },
    onError: () => toast.error('Erro na importação.'),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-heading font-bold">Lançamentos</h1>

      {/* Manual Entry */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><PenLine className="h-5 w-5 text-primary" /> Novo Lançamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
            className="grid grid-cols-1 sm:grid-cols-6 gap-3"
          >
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <Select value={analystId} onValueChange={setAnalystId} required>
              <SelectTrigger><SelectValue placeholder="Selecione analista" /></SelectTrigger>
              <SelectContent>
                {analysts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Atendimentos" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <Input type="number" placeholder="Contatos" min="0" value={contacts} onChange={(e) => setContacts(e.target.value)} />
            <Input type="number" placeholder="Dúvidas" min="0" value={doubts} onChange={(e) => setDoubts(e.target.value)} />
            <Button type="submit" disabled={createMutation.isPending || !analystId}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Excel Import */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /> Importar Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Colunas esperadas: <strong>Analista</strong>, <strong>Data</strong>, <strong>Dúvidas/Quantidade</strong></p>
          <label className="cursor-pointer">
            <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-input bg-background hover:bg-muted transition-colors text-sm font-medium">
              <Upload className="h-4 w-4" /> Selecionar arquivo
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> Pré-visualização ({previewData.length} registros)</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Analista</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Dúvidas</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.analyst_name}</TableCell>
                  <TableCell>{r.record_date}</TableCell>
                  <TableCell>{r.doubts}</TableCell>
                  <TableCell>
                    {r.analyst_id ? (
                      <Badge variant="default" className="gap-1"><Check className="h-3 w-3" /> OK</Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" /> Não encontrado</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancelar</Button>
            <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending || previewData.filter(r => r.analyst_id).length === 0}>
              {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar {previewData.filter(r => r.analyst_id).length} registros
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!v) setEditingRecord(null); setEditOpen(v); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Lançamento</DialogTitle></DialogHeader>
          {editingRecord && (
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editingRecord); }} className="space-y-3">
              <Input type="date" value={editingRecord.record_date} onChange={(e) => setEditingRecord({ ...editingRecord, record_date: e.target.value })} />
              <Select value={editingRecord.analyst_id} onValueChange={(v) => setEditingRecord({ ...editingRecord, analyst_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{analysts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder="Atendimentos" value={editingRecord.quantity} onChange={(e) => setEditingRecord({ ...editingRecord, quantity: parseInt(e.target.value) || 0 })} />
              <Input type="number" placeholder="Contatos" value={editingRecord.contacts} onChange={(e) => setEditingRecord({ ...editingRecord, contacts: parseInt(e.target.value) || 0 })} />
              <Input type="number" placeholder="Dúvidas" value={editingRecord.doubts || 0} onChange={(e) => setEditingRecord({ ...editingRecord, doubts: parseInt(e.target.value) || 0 })} />
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Records List */}
      <Card className="border shadow-sm">
        <CardHeader><CardTitle className="text-lg">Últimos Lançamentos</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : records.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum lançamento registrado.</p>
          ) : (
            <div className="space-y-2">
              {records.map((r: any) => (
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
                    <span className="text-xs text-muted-foreground">At: {r.quantity}</span>
                    <span className="text-xs text-muted-foreground">Ct: {r.contacts}</span>
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
