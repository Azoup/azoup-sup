import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Plus, Pencil, UserX, UserCheck, Upload, Loader2 } from 'lucide-react';

const Developers = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: developers = [], isLoading } = useQuery({
    queryKey: ['developers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('developers').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase.from('developers').update({ name }).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('developers').insert({ name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developers'] });
      toast.success(editingId ? 'Desenvolvedor atualizado!' : 'Desenvolvedor criado!');
      resetForm();
    },
    onError: () => toast.error('Erro ao salvar desenvolvedor.'),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('developers').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developers'] });
      toast.success('Status atualizado!');
    },
  });

  const handlePhotoUpload = async (devId: string, file: File) => {
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${devId}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('developer-photos').upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error('Erro ao enviar foto.');
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('developer-photos').getPublicUrl(path);
    await supabase.from('developers').update({ photo_url: publicUrl }).eq('id', devId);
    queryClient.invalidateQueries({ queryKey: ['developers'] });
    toast.success('Foto atualizada!');
    setUploading(false);
  };

  const resetForm = () => {
    setName('');
    setEditingId(null);
    setDialogOpen(false);
  };

  const openEdit = (dev: { id: string; name: string }) => {
    setEditingId(dev.id);
    setName(dev.name);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Desenvolvedores</h1>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Novo Desenvolvedor</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar' : 'Novo'} Desenvolvedor</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); upsertMutation.mutate(); }} className="space-y-4">
              <Input placeholder="Nome do desenvolvedor" value={name} onChange={(e) => setName(e.target.value)} required />
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
          {developers.map((d: any) => (
            <Card key={d.id} className="border shadow-sm">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="relative group">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={d.photo_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-heading font-bold">
                      {d.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                    <Upload className="h-4 w-4 text-card" />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handlePhotoUpload(d.id, e.target.files[0])} />
                  </label>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{d.name}</p>
                </div>
                <Badge variant={d.status === 'active' ? 'default' : 'secondary'}>
                  {d.status === 'active' ? 'Ativo' : 'Inativo'}
                </Badge>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(d)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => toggleStatus.mutate({ id: d.id, status: d.status })}>
                    {d.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {developers.length === 0 && (
            <p className="text-center text-muted-foreground py-12">Nenhum desenvolvedor cadastrado.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Developers;
