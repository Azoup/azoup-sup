import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Plus, Pencil, UserX, UserCheck, Upload, Loader2, Trash2 } from 'lucide-react';
import { useRole } from '@/hooks/useRole';

const Analysts = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const { isAdmin } = useRole();

  const { data: analysts = [], isLoading } = useQuery({
    queryKey: ['analysts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('analysts').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase.from('analysts').update({ name }).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('analysts').insert({ name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysts'] });
      toast.success(editingId ? 'Analista atualizado!' : 'Analista criado!');
      resetForm();
    },
    onError: () => toast.error('Erro ao salvar analista.'),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('analysts').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysts'] });
      toast.success('Status atualizado!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('analysts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysts'] });
      toast.success('Analista excluído com sucesso!');
    },
    onError: () => toast.error('Erro ao excluir analista. Ele pode ter dados vinculados.'),
  });

  const handlePhotoUpload = async (analystId: string, file: File) => {
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${analystId}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('analyst-photos').upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error('Erro ao enviar foto.');
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('analyst-photos').getPublicUrl(path);
    await supabase.from('analysts').update({ photo_url: publicUrl }).eq('id', analystId);
    queryClient.invalidateQueries({ queryKey: ['analysts'] });
    toast.success('Foto atualizada!');
    setUploading(false);
  };

  const resetForm = () => {
    setName('');
    setEditingId(null);
    setDialogOpen(false);
  };

  const openEdit = (analyst: { id: string; name: string }) => {
    setEditingId(analyst.id);
    setName(analyst.name);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Analistas</h1>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Novo Analista</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar' : 'Novo'} Analista</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); upsertMutation.mutate(); }} className="space-y-4">
              <Input placeholder="Nome do analista" value={name} onChange={(e) => setName(e.target.value)} required />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button type="submit" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-3">
          {analysts.map((a) => (
            <Card key={a.id} className="border shadow-sm">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="relative group">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={a.photo_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-heading font-bold">
                      {a.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                    <Upload className="h-4 w-4 text-card" />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handlePhotoUpload(a.id, e.target.files[0])} />
                  </label>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.name}</p>
                </div>
                <Badge variant={a.status === 'active' ? 'default' : 'secondary'}>
                  {a.status === 'active' ? 'Ativo' : 'Inativo'}
                </Badge>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => toggleStatus.mutate({ id: a.id, status: a.status })}>
                    {a.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                  {isAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Excluir analista">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir analista?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir o analista <strong>{a.name}</strong>? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {analysts.length === 0 && (
            <p className="text-center text-muted-foreground py-12">Nenhum analista cadastrado.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Analysts;
