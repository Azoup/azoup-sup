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

const Analysts = () => {
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
    void queryClient.invalidateQueries({ queryKey: ['kanban-board'] });
    void queryClient.invalidateQueries({ queryKey: ['dev-kanban-board'] });
  };

  const { data: analysts = [], isLoading } = useQuery({
    queryKey: ['analysts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('analysts').select('*').order('name');
      return assertSupabaseData(data, error, 'analysts');
    },
    enabled: supabaseReady,
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
      void queryClient.invalidateQueries({ queryKey: ['analysts'] });
      refreshRelatedPhotoQueries();
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
      void queryClient.invalidateQueries({ queryKey: ['analysts'] });
      toast.success('Status atualizado!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('analysts').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Sem permissão para excluir ou registro não encontrado.');
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analysts'] });
      refreshRelatedPhotoQueries();
      toast.success('Analista excluído com sucesso!');
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao excluir analista. Ele pode ter dados vinculados.'),
  });

  const handlePhotoUpload = async (analystId: string, file: File) => {
    setUploadingId(analystId);
    try {
      const { publicUrl, blobPreview } = await uploadCadastroPhotoFile('analyst-photos', analystId, file);
      const { error } = await supabase.from('analysts').update({ photo_url: publicUrl }).eq('id', analystId);
      if (error) throw error;

      queryClient.setQueryData(['analysts'], (old: typeof analysts | undefined) =>
        (old ?? []).map((row) => (row.id === analystId ? { ...row, photo_url: publicUrl } : row)),
      );

      blobByIdRef.current[analystId] = blobPreview;
      setPhotoPreviewById((prev) => ({ ...prev, [analystId]: blobPreview }));

      refreshRelatedPhotoQueries();
      toast.success('Foto atualizada!');
    } catch (e: unknown) {
      clearPhotoPreview(analystId);
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
                <div className="relative group shrink-0">
                  <ProfileAvatar
                    className="h-12 w-12"
                    photoUrl={a.photo_url}
                    previewUrl={photoPreviewById[a.id]}
                    fallbackLabel={a.name}
                    onPhotoLoaded={() => clearPhotoPreview(a.id)}
                  />
                  <label className="absolute inset-0 z-10 cursor-pointer rounded-full" title="Enviar foto">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/*"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      disabled={uploadingId === a.id}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handlePhotoUpload(a.id, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                    {uploadingId === a.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-card" />
                    ) : (
                      <Upload className="h-4 w-4 text-card" />
                    )}
                  </div>
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
