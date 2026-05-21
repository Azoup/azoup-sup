import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { toast } from 'sonner';
import { Plus, Pencil, UserX, UserCheck, Upload, Loader2, Trash2, Link2 } from 'lucide-react';
import { useRole } from '@/hooks/useRole';
import { useSupabaseReady } from '@/hooks/useSupabaseReady';
import { assertSupabaseData } from '@/lib/supabaseQuery';
import { saveCadastroPhotoUrl, uploadCadastroPhotoFile } from '@/lib/cadastroPhoto';

const Analysts = () => {
  const { ready: supabaseReady } = useSupabaseReady();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [photoLinkById, setPhotoLinkById] = useState<Record<string, string>>({});
  const [photoPreviewById, setPhotoPreviewById] = useState<Record<string, string>>({});
  const { isAdmin } = useRole();

  const invalidatePhotoQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['analysts'] });
    void queryClient.invalidateQueries({ queryKey: ['people-photos'] });
    void queryClient.invalidateQueries({ queryKey: ['kanban-board'] });
    void queryClient.invalidateQueries({ queryKey: ['dev-kanban-board'] });
    void queryClient.invalidateQueries({ queryKey: ['all-users-roles-profiles'] });
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
      invalidatePhotoQueries();
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
      invalidatePhotoQueries();
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
      invalidatePhotoQueries();
      toast.success('Analista excluído com sucesso!');
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao excluir analista. Ele pode ter dados vinculados.'),
  });

  const handlePhotoUpload = async (analystId: string, file: File) => {
    setUploadingId(analystId);
    const blobPreview = URL.createObjectURL(file);
    setPhotoPreviewById((prev) => ({ ...prev, [analystId]: blobPreview }));
    try {
      const publicUrl = await uploadCadastroPhotoFile('analyst-photos', analystId, file);
      const { error } = await supabase.from('analysts').update({ photo_url: publicUrl }).eq('id', analystId);
      if (error) throw error;
      invalidatePhotoQueries();
      toast.success('Foto atualizada!');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      toast.error('Erro ao enviar foto: ' + msg);
      setPhotoPreviewById((prev) => {
        const next = { ...prev };
        delete next[analystId];
        return next;
      });
    } finally {
      URL.revokeObjectURL(blobPreview);
      setUploadingId(null);
    }
  };

  const handlePhotoLink = async (analystId: string) => {
    const raw = photoLinkById[analystId]?.trim();
    if (!raw) return;
    setUploadingId(analystId);
    try {
      await saveCadastroPhotoUrl('analysts', analystId, raw);
      setPhotoLinkById((prev) => ({ ...prev, [analystId]: '' }));
      invalidatePhotoQueries();
      toast.success('Foto vinculada!');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'URL inválida';
      toast.error('Erro ao vincular foto: ' + msg);
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
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex items-center gap-4">
                  <div className="relative group shrink-0">
                    <ProfileAvatar
                      className="h-12 w-12"
                      photoUrl={a.photo_url}
                      previewUrl={photoPreviewById[a.id]}
                      fallbackLabel={a.name}
                    />
                    <label className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      {uploadingId === a.id ? (
                        <Loader2 className="h-4 w-4 text-card animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 text-card" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingId === a.id}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handlePhotoUpload(a.id, f);
                          e.target.value = '';
                        }}
                      />
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
                </div>
                <div className="flex gap-2 pl-16 sm:pl-0">
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Vincular foto por URL"
                    value={photoLinkById[a.id] ?? a.photo_url ?? ''}
                    onChange={(e) =>
                      setPhotoLinkById((prev) => ({ ...prev, [a.id]: e.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 shrink-0"
                    disabled={uploadingId === a.id || !(photoLinkById[a.id] ?? a.photo_url ?? '').trim()}
                    onClick={() => void handlePhotoLink(a.id)}
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1" />
                    Vincular
                  </Button>
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
