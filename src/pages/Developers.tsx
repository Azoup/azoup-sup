import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { toast } from 'sonner';
import { Plus, Pencil, UserX, UserCheck, Upload, Loader2, Trash2 } from 'lucide-react';
import { useRole } from '@/hooks/useRole';
import { useSupabaseReady } from '@/hooks/useSupabaseReady';
import { assertSupabaseData } from '@/lib/supabaseQuery';
import { uploadCadastroPhotoFile } from '@/lib/cadastroPhoto';

const Developers = () => {
  const { ready: supabaseReady } = useSupabaseReady();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [photoPreviewById, setPhotoPreviewById] = useState<Record<string, string>>({});
  const blobByIdRef = useRef<Record<string, string>>({});
  const { isAdmin } = useRole();

  const clearPhotoPreview = (id: string) => {
    const blob = blobByIdRef.current[id];
    if (blob) {
      URL.revokeObjectURL(blob);
      delete blobByIdRef.current[id];
    }
    setPhotoPreviewById((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const refreshRelatedPhotoQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['people-photos'] });
    void queryClient.invalidateQueries({ queryKey: ['all-users-roles-profiles'] });
    void queryClient.invalidateQueries({ queryKey: ['dev-kanban-board'] });
  };

  const { data: developers = [], isLoading } = useQuery({
    queryKey: ['developers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('developers').select('*').order('name');
      return assertSupabaseData(data, error, 'developers');
    },
    enabled: supabaseReady,
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
      void queryClient.invalidateQueries({ queryKey: ['developers'] });
      refreshRelatedPhotoQueries();
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
      void queryClient.invalidateQueries({ queryKey: ['developers'] });
      toast.success('Status atualizado!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('developers').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Sem permissão para excluir ou registro não encontrado.');
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['developers'] });
      refreshRelatedPhotoQueries();
      toast.success('Desenvolvedor excluído com sucesso!');
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao excluir desenvolvedor. Ele pode ter dados vinculados.'),
  });

  const handlePhotoUpload = async (devId: string, file: File) => {
    setUploadingId(devId);
    try {
      const { publicUrl, blobPreview } = await uploadCadastroPhotoFile('developer-photos', devId, file);
      const { error } = await supabase.from('developers').update({ photo_url: publicUrl }).eq('id', devId);
      if (error) throw error;

      queryClient.setQueryData(['developers'], (old: typeof developers | undefined) =>
        (old ?? []).map((row) => (row.id === devId ? { ...row, photo_url: publicUrl } : row)),
      );

      blobByIdRef.current[devId] = blobPreview;
      setPhotoPreviewById((prev) => ({ ...prev, [devId]: blobPreview }));

      refreshRelatedPhotoQueries();
      toast.success('Foto atualizada!');
    } catch (e: unknown) {
      clearPhotoPreview(devId);
      const msg = e instanceof Error ? e.message : '';
      toast.error('Erro ao enviar foto: ' + msg);
    } finally {
      setUploadingId(null);
    }
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
                <div className="relative group shrink-0">
                  <ProfileAvatar
                    className="h-12 w-12"
                    photoUrl={d.photo_url}
                    previewUrl={photoPreviewById[d.id]}
                    fallbackLabel={d.name}
                    onPhotoLoaded={() => clearPhotoPreview(d.id)}
                  />
                  <label className="absolute inset-0 z-10 cursor-pointer rounded-full" title="Enviar foto">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/*"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      disabled={uploadingId === d.id}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handlePhotoUpload(d.id, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                    {uploadingId === d.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-card" />
                    ) : (
                      <Upload className="h-4 w-4 text-card" />
                    )}
                  </div>
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
                  {isAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Excluir desenvolvedor">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir desenvolvedor?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir o desenvolvedor <strong>{d.name}</strong>? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(d.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
          {developers.length === 0 && (
            <p className="text-center text-muted-foreground py-12">Nenhum desenvolvedor cadastrado.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Developers;
