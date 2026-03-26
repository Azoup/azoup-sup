import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, Trash2, PenLine, Upload, FileSpreadsheet, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface ImportRow {
  analyst_name: string;
  record_date: string;
  doubts: number;
  analyst_id?: string;
}

const Entries = () => {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [analystId, setAnalystId] = useState('');
  const [doubts, setDoubts] = useState('');
  const [description, setDescription] = useState('');
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

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
        .is('business_unit_id', null)
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
        doubts: parseInt(doubts) || 0,
        quantity: 0,
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
      setDoubts(''); setDescription('');
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
        doubts: record.doubts,
        description: record.description || null,
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

        const rows: ImportRow[] = json.map((row: any) => {
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
        }).filter((r: ImportRow) => r.analyst_name && r.record_date && r.analyst_id);

        if (rows.length === 0) {
          toast.error('Nenhum registro válido encontrado na planilha.');
          return;
        }

        setImportRows(rows);
        setShowImportConfirm(true);
      } catch {
        toast.error('Erro ao ler arquivo Excel.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }, [analysts]);

  const importMutation = useMutation({
    mutationFn: async () => {
      // Consolidate by analyst + date to avoid duplicates
      const consolidated = new Map<string, ImportRow>();
      importRows.forEach((r) => {
        const key = `${r.analyst_id}_${r.record_date}`;
        const existing = consolidated.get(key);
        if (existing) {
          existing.doubts += r.doubts;
        } else {
          consolidated.set(key, { ...r });
        }
      });

      const inserts = Array.from(consolidated.values()).map((r) => ({
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
      toast.success(`${importRows.length} registros importados!`);
      setShowImportConfirm(false);
      setImportRows([]);
    },
    onError: () => toast.error('Erro na importação.'),
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
              <Select value={analystId} onValueChange={setAnalystId} required>
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

      {/* Import Confirm Dialog */}
      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importação</AlertDialogTitle>
            <AlertDialogDescription>
              Foram identificados <strong>{importRows.length}</strong> registros válidos na planilha. Deseja importar os dados?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setImportRows([]); }}>Não</AlertDialogCancel>
            <AlertDialogAction onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
              {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sim, importar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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