import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  formatAdminActionErrorMessage,
  runAdminUserAction,
  type AdminUserActionBody,
} from '@/lib/adminUserActions';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, KeyRound, User, Shield, ScrollText, Filter, Camera, Trash2, UserX } from 'lucide-react';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { personNameMatchesProfile, resolveUserPhoto } from '@/lib/resolveUserPhotoUrl';
import { photoUrlForDatabase, resolvePhotoDisplayUrl, uploadProfilePhotoFile } from '@/lib/profilePhotoUpload';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const PERMISSION_SCREENS = [
  { screen: 'kanban', label: 'Kanban Pendências' },
  { screen: 'entries', label: 'Lançamentos Dúvidas' },
  { screen: 'entries_bu', label: 'Lançamentos B.U' },
  { screen: 'dashboard', label: 'Dashboard Dúvidas' },
  { screen: 'dashboard_bu', label: 'Dashboard B.U' },
  { screen: 'kanban_dashboard', label: 'Dashboard Kanban' },
  { screen: 'analysts', label: 'Cadastro de Analistas' },
  { screen: 'business_units', label: 'Unidades de Negócio' },
  { screen: 'profile_log', label: 'Perfil / Log' },
  { screen: 'kanban_dev', label: 'Kanban DEV' },
  { screen: 'dashboard_dev', label: 'Dashboard DEV' },
  { screen: 'developers', label: 'Cadastro de Desenvolvedores' },
  { screen: 'digisac_dashboard', label: 'Dashboard Digisac' },
];

const PERMISSION_ACTIONS = [
  { action: 'view', label: 'Visualizar' },
  { action: 'create', label: 'Criar' },
  { action: 'edit', label: 'Editar' },
  { action: 'delete', label: 'Excluir' },
];

// Generate all permission keys from screen x action
const PERMISSION_KEYS = PERMISSION_SCREENS.flatMap(s =>
  PERMISSION_ACTIONS.map(a => ({
    key: `${s.screen}_${a.action}`,
    label: `${s.label} — ${a.label}`,
    screen: s.screen,
    screenLabel: s.label,
    action: a.action,
    actionLabel: a.label,
  }))
);

const Profile = () => {
  const { user } = useAuth();
  const { isAdmin, role } = useRole();
  const queryClient = useQueryClient();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Log filters
  const [logFrom, setLogFrom] = useState(todayStr);
  const [logTo, setLogTo] = useState(todayStr);
  const [showAllLogs, setShowAllLogs] = useState(false);

  // Permissions editing
  const [editingPermsUserId, setEditingPermsUserId] = useState<string | null>(null);
  const [permsDraft, setPermsDraft] = useState<Record<string, boolean>>({});
  const [permsSaving, setPermsSaving] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; label: string } | null>(null);
  const [adminNewPwd, setAdminNewPwd] = useState('');
  const [adminNewPwd2, setAdminNewPwd2] = useState('');
  const [resetPwdLoading, setResetPwdLoading] = useState(false);

  const handleAdminActionResult = (result: Awaited<ReturnType<typeof runAdminUserAction>>) => {
    if (result.ok) return true;
    toast.error(formatAdminActionErrorMessage(result.code, result.message));
    return false;
  };

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Admin: utilizadores + foto (perfil manual ou cadastro analista/desenvolvedor)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users-roles-profiles'],
    queryFn: async () => {
      const [
        { data: roles },
        { data: profiles },
        { data: analysts },
        { data: developers },
      ] = await Promise.all([
        supabase.from('user_roles').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('analysts').select('name, photo_url'),
        supabase.from('developers').select('name, photo_url'),
      ]);

      return (roles || []).map((r: any) => {
        const p = profiles?.find((x: any) => x.id === r.user_id);
        const displayName = p?.display_name || '';
        const resolved = resolveUserPhoto({
          profilePhoto: p?.photo_url,
          displayName,
          analysts: analysts ?? [],
          developers: developers ?? [],
        });
        return {
          ...r,
          email: displayName || r.user_id,
          photo_url: resolved.photo_url,
          photo_source: resolved.source,
          profile_photo_url: resolved.profile_photo_url,
        };
      });
    },
    enabled: isAdmin,
  });

  const { data: peoplePhotos } = useQuery({
    queryKey: ['people-photos'],
    queryFn: async () => {
      const [{ data: analysts }, { data: developers }] = await Promise.all([
        supabase.from('analysts').select('name, photo_url'),
        supabase.from('developers').select('name, photo_url'),
      ]);
      return { analysts: analysts ?? [], developers: developers ?? [] };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const selfPhotoResolved = resolveUserPhoto({
    profilePhoto: profile?.photo_url,
    displayName: profile?.display_name || user?.email?.split('@')[0],
    analysts: peoplePhotos?.analysts ?? [],
    developers: peoplePhotos?.developers ?? [],
  });

  const selfCadastroPhoto = resolveUserPhoto({
    profilePhoto: null,
    displayName: profile?.display_name || user?.email?.split('@')[0],
    analysts: peoplePhotos?.analysts ?? [],
    developers: peoplePhotos?.developers ?? [],
  });

  const syncLinkedCadastroPhoto = async (targetUserId: string, publicUrl: string) => {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', targetUserId)
      .maybeSingle();
    const name = profileRow?.display_name?.trim();
    if (!name) return;

    const [{ data: analysts }, { data: developers }] = await Promise.all([
      supabase.from('analysts').select('id, name'),
      supabase.from('developers').select('id, name'),
    ]);

    const analyst = (analysts ?? []).find((a) => personNameMatchesProfile(name, a.name || ''));
    if (analyst) {
      await supabase.from('analysts').update({ photo_url: publicUrl }).eq('id', analyst.id);
      void queryClient.invalidateQueries({ queryKey: ['analysts'] });
      void queryClient.invalidateQueries({ queryKey: ['kanban-board'] });
    }

    const developer = (developers ?? []).find((d) => personNameMatchesProfile(name, d.name || ''));
    if (developer) {
      await supabase.from('developers').update({ photo_url: publicUrl }).eq('id', developer.id);
      void queryClient.invalidateQueries({ queryKey: ['developers'] });
      void queryClient.invalidateQueries({ queryKey: ['dev-kanban-board'] });
    }

    void queryClient.invalidateQueries({ queryKey: ['people-photos'] });
  };

  const applyPhotoUrlToCaches = (
    targetUserId: string,
    publicUrl: string,
    displayUrl: string,
  ) => {
    setPhotoPreviewByUser((prev) => ({ ...prev, [targetUserId]: displayUrl }));
    queryClient.setQueryData(['profile', targetUserId], (old: any) =>
      old
        ? { ...old, photo_url: publicUrl }
        : { id: targetUserId, photo_url: publicUrl, display_name: old?.display_name },
    );
    queryClient.setQueryData(['all-users-roles-profiles'], (old: any[] | undefined) =>
      (old ?? []).map((ur) =>
        ur.user_id === targetUserId
          ? {
              ...ur,
              photo_url: publicUrl,
              photo_source: 'profile',
              profile_photo_url: publicUrl,
            }
          : ur,
      ),
    );
  };

  // Photo upload (for self or admin-managed user)
  const handlePhotoUpload = async (targetUserId: string, file: File) => {
    const blobPreview = URL.createObjectURL(file);
    setPhotoPreviewByUser((prev) => ({ ...prev, [targetUserId]: blobPreview }));

    try {
      const { publicUrl, displayUrl } = await uploadProfilePhotoFile(targetUserId, file);
      URL.revokeObjectURL(blobPreview);

      const { data: existing } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', targetUserId)
        .maybeSingle();

      const displayName =
        existing?.display_name ||
        allUsers.find((u: any) => u.user_id === targetUserId)?.email ||
        user?.email?.split('@')[0] ||
        'Utilizador';

      const { error } = await supabase.from('profiles').upsert(
        {
          id: targetUserId,
          display_name: displayName,
          photo_url: publicUrl,
        },
        { onConflict: 'id' },
      );
      if (error) throw error;

      applyPhotoUrlToCaches(targetUserId, publicUrl, displayUrl);
      void syncLinkedCadastroPhoto(targetUserId, publicUrl);

      toast.success('Foto atualizada!');
      void queryClient.invalidateQueries({ queryKey: ['profile', targetUserId] });
      void queryClient.invalidateQueries({ queryKey: ['all-users-roles-profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['people-photos'] });
      void queryClient.invalidateQueries({ queryKey: ['card-comments'] });
      void queryClient.invalidateQueries({ queryKey: ['dev-card-comments'] });
    } catch (e: any) {
      URL.revokeObjectURL(blobPreview);
      setPhotoPreviewByUser((prev) => {
        const next = { ...prev };
        delete next[targetUserId];
        return next;
      });
      toast.error('Erro ao enviar foto: ' + (e.message || ''));
    }
  };

  const handlePhotoLinkSave = async (targetUserId: string, rawUrl: string) => {
    const publicUrl = photoUrlForDatabase(rawUrl);
    if (!publicUrl) {
      toast.error('Informe um link válido (http/https) ou URL do Supabase Storage.');
      return;
    }
    try {
      const displayUrl = await resolvePhotoDisplayUrl(publicUrl);
      const { data: existing } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', targetUserId)
        .maybeSingle();
      const displayName =
        existing?.display_name ||
        allUsers.find((u: any) => u.user_id === targetUserId)?.email ||
        user?.email?.split('@')[0] ||
        'Utilizador';
      const { error } = await supabase.from('profiles').upsert(
        { id: targetUserId, display_name: displayName, photo_url: publicUrl },
        { onConflict: 'id' },
      );
      if (error) throw error;
      applyPhotoUrlToCaches(targetUserId, publicUrl, displayUrl || publicUrl);
      void syncLinkedCadastroPhoto(targetUserId, publicUrl);
      toast.success('Foto vinculada!');
      void queryClient.invalidateQueries({ queryKey: ['profile', targetUserId] });
      void queryClient.invalidateQueries({ queryKey: ['all-users-roles-profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['people-photos'] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      toast.error('Erro ao vincular foto: ' + msg);
    }
  };

  const handlePhotoRemove = async (targetUserId: string) => {
    const { error } = await supabase.from('profiles').update({ photo_url: null }).eq('id', targetUserId);
    if (error) { toast.error('Erro ao remover foto'); return; }
    setPhotoPreviewByUser((prev) => {
      const next = { ...prev };
      delete next[targetUserId];
      return next;
    });
    queryClient.setQueryData(['profile', targetUserId], (old: any) =>
      old ? { ...old, photo_url: null } : old,
    );
    queryClient.setQueryData(['all-users-roles-profiles'], (old: any[] | undefined) => {
      const people = peoplePhotos ?? { analysts: [], developers: [] };
      return (old ?? []).map((ur) => {
        if (ur.user_id !== targetUserId) return ur;
        const resolved = resolveUserPhoto({
          profilePhoto: null,
          displayName: ur.email,
          analysts: people.analysts,
          developers: people.developers,
        });
        return {
          ...ur,
          photo_url: resolved.photo_url,
          photo_source: resolved.source,
          profile_photo_url: null,
        };
      });
    });
    toast.success('Foto removida');
    void queryClient.invalidateQueries({ queryKey: ['profile', targetUserId] });
    void queryClient.invalidateQueries({ queryKey: ['all-users-roles-profiles'] });
    void queryClient.invalidateQueries({ queryKey: ['card-comments'] });
    void queryClient.invalidateQueries({ queryKey: ['dev-card-comments'] });
  };

  // Activity logs with date filter
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['activity-logs', logFrom, logTo],
    queryFn: async () => {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false });
      if (logFrom) query = query.gte('created_at', `${logFrom}T00:00:00`);
      if (logTo) query = query.lte('created_at', `${logTo}T23:59:59`);
      const { data } = await query.limit(200);
      return data || [];
    },
    enabled: isAdmin,
  });

  const displayedLogs = showAllLogs ? logs : logs.slice(0, 3);

  // User permissions
  const { data: userPermissions = [] } = useQuery({
    queryKey: ['user-permissions', editingPermsUserId],
    queryFn: async () => {
      if (!editingPermsUserId) return [];
      const { data } = await supabase.from('user_permissions').select('*').eq('user_id', editingPermsUserId);
      return data || [];
    },
    enabled: !!editingPermsUserId && isAdmin,
  });

  const startEditingPerms = (userId: string) => {
    setEditingPermsUserId(userId);
    setPermsLoaded(false);
  };

  const [permsLoaded, setPermsLoaded] = useState(false);
  /** Preview imediato no avatar após upload (userId → URL assinada ou blob) */
  const [photoPreviewByUser, setPhotoPreviewByUser] = useState<Record<string, string>>({});
  const [photoLinkDraft, setPhotoLinkDraft] = useState('');
  const [adminPhotoLinkByUser, setAdminPhotoLinkByUser] = useState<Record<string, string>>({});

  // Sync draft from DB only once when permissions load for a user
  useEffect(() => {
    if (editingPermsUserId && !permsLoaded) {
      const draft: Record<string, boolean> = {};
      // Start all unchecked by default
      PERMISSION_KEYS.forEach(p => { draft[p.key] = false; });
      // Override with saved values from DB
      if (Array.isArray(userPermissions)) {
        userPermissions.forEach((p: any) => { draft[p.permission_key] = p.allowed; });
      }
      setPermsDraft(draft);
      setPermsLoaded(true);
    }
  }, [editingPermsUserId, userPermissions, permsLoaded]);

  const savePermissions = async () => {
    if (!editingPermsUserId) return;
    setPermsSaving(true);
    try {
      // Delete existing then insert
      await supabase.from('user_permissions').delete().eq('user_id', editingPermsUserId);
      const rows = PERMISSION_KEYS.map(p => ({
        user_id: editingPermsUserId,
        permission_key: p.key,
        allowed: permsDraft[p.key] === true,
      }));
      const { error } = await supabase.from('user_permissions').insert(rows);
      if (error) throw error;
      toast.success('Permissões salvas!');
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['user-access'] });
    } catch {
      toast.error('Erro ao salvar permissões.');
    }
    setPermsSaving(false);
  };

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const { error: delError } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (delError) throw delError;
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole as any });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users-roles-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['user-access'] });
      toast.success('Permissão atualizada!');
    },
    onError: () => toast.error('Erro ao atualizar permissão.'),
  });

  const confirmAdminDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const result = await runAdminUserAction({
      action: 'delete_user',
      target_user_id: deleteTarget.id,
    } satisfies AdminUserActionBody);
    setDeleteLoading(false);
    if (!handleAdminActionResult(result)) return;
    setDeleteTarget(null);
    toast.success('Cadastro do usuário removido.');
    await queryClient.invalidateQueries({ queryKey: ['all-users-roles-profiles'] });
    await queryClient.refetchQueries({ queryKey: ['all-users-roles-profiles'] });
  };

  const confirmAdminSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (adminNewPwd !== adminNewPwd2) {
      toast.error('As senhas não coincidem.');
      return;
    }
    if (adminNewPwd.length < 6) {
      toast.error('Mínimo 6 caracteres.');
      return;
    }
    setResetPwdLoading(true);
    const result = await runAdminUserAction({
      action: 'set_user_password',
      target_user_id: resetTarget.id,
      new_password: adminNewPwd,
    } satisfies AdminUserActionBody);
    setResetPwdLoading(false);
    if (!handleAdminActionResult(result)) return;
    toast.success('Nova senha definida. Informe o usuário com segurança.');
    setResetTarget(null);
    setAdminNewPwd('');
    setAdminNewPwd2('');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error('As senhas não coincidem.'); return; }
    if (newPassword.length < 6) { toast.error('Mínimo 6 caracteres.'); return; }
    setPwLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user?.email || '', password: currentPassword,
    });
    if (signInError) { toast.error('Senha atual incorreta.'); setPwLoading(false); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error(error.message);
    else { toast.success('Senha alterada com sucesso!'); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
    setPwLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-heading font-bold">Perfil</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Info */}
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-primary" /> Informações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <ProfileAvatar
                className="h-16 w-16"
                photoUrl={selfPhotoResolved.photo_url}
                alternatePhotoUrl={
                  selfPhotoResolved.source === 'profile' ? selfCadastroPhoto.photo_url : undefined
                }
                previewUrl={user?.id ? photoPreviewByUser[user.id] : undefined}
                fallbackLabel={profile?.display_name || user?.email || '?'}
              />
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex flex-wrap gap-1">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && user) handlePhotoUpload(user.id, f);
                      e.target.value = '';
                    }}
                  />
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent">
                    <Camera className="h-3 w-3" /> Alterar foto
                  </span>
                </label>
                {selfPhotoResolved.profile_photo_url && (
                  <button
                    onClick={() => user && handlePhotoRemove(user.id)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" /> Remover
                  </button>
                )}
                </div>
                <div className="flex gap-1">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ou cole o link da foto (URL)"
                    value={photoLinkDraft}
                    onChange={(e) => setPhotoLinkDraft(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 shrink-0"
                    disabled={!photoLinkDraft.trim() || !user}
                    onClick={() => user && handlePhotoLinkSave(user.id, photoLinkDraft.trim())}
                  >
                    Vincular
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Nome</span>
              <p className="font-medium">{profile?.display_name || user?.email?.split('@')[0] || '—'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">E-mail</span>
              <p className="font-medium">{user?.email}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Tipo de Perfil</span>
              <div className="mt-1">
                <Badge variant={isAdmin ? 'default' : 'secondary'}>
                  {isAdmin ? 'Admin' : 'Padrão'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Password Change */}
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Alterar Senha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <Input type="password" placeholder="Senha atual" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              <Input type="password" placeholder="Nova senha" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
              <Input type="password" placeholder="Confirmar nova senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
              <Button type="submit" disabled={pwLoading} size="sm">
                {pwLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Nova Senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Admin: Manage Roles + Permissions */}
      {isAdmin && (
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Gerenciar Permissões
            </CardTitle>
            <CardDescription>
              Altere o tipo de perfil, permissões e foto. Como administrador, use Excluir para remover cadastro duplicado ou Definir senha para criar uma nova senha (não é possível ver a senha atual — o Supabase guarda apenas um hash).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
            ) : (
              <div className="space-y-3 animate-in fade-in duration-200">
                {(showAllUsers ? allUsers : allUsers.slice(0, 4)).map((ur: any) => {
                  const cadastroPhoto = resolveUserPhoto({
                    profilePhoto: null,
                    displayName: ur.email,
                    analysts: peoplePhotos?.analysts ?? [],
                    developers: peoplePhotos?.developers ?? [],
                  });
                  return (
                  <div key={ur.id} className="p-3 rounded-lg border space-y-2">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <ProfileAvatar
                          className="h-10 w-10 shrink-0"
                          photoUrl={ur.photo_url}
                          alternatePhotoUrl={
                            ur.profile_photo_url ? cadastroPhoto.photo_url : undefined
                          }
                          previewUrl={photoPreviewByUser[ur.user_id]}
                          fallbackLabel={ur.email || '?'}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{ur.email}</p>
                          <p className="text-xs text-muted-foreground truncate">{ur.user_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end md:flex-nowrap md:justify-end shrink-0 md:min-w-fit">
                        <label className="cursor-pointer shrink-0" title="Alterar foto">
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handlePhotoUpload(ur.user_id, f);
                              e.target.value = '';
                            }}
                          />
                          <span className="inline-flex items-center justify-center h-8 w-8 rounded border hover:bg-accent shrink-0">
                            <Camera className="h-3.5 w-3.5" />
                          </span>
                        </label>
                        {ur.profile_photo_url ? (
                          <button
                            onClick={() => handlePhotoRemove(ur.user_id)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded border text-destructive hover:bg-destructive/10 shrink-0"
                            title="Remover foto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                        )}
                        <Select
                          defaultValue={ur.role}
                          onValueChange={(val) => updateRole.mutate({ userId: ur.user_id, newRole: val })}
                        >
                          <SelectTrigger className="w-28 min-w-[7rem] shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="user">Padrão</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 whitespace-nowrap"
                          onClick={() => {
                            setResetTarget({ id: ur.user_id, label: String(ur.email) });
                            setAdminNewPwd('');
                            setAdminNewPwd2('');
                          }}
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1" />
                          Definir senha
                        </Button>
                        {ur.user_id !== user?.id && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="shrink-0"
                            onClick={() => setDeleteTarget({ id: ur.user_id, label: String(ur.email) })}
                          >
                            <UserX className="h-3.5 w-3.5 mr-1" />
                            Excluir
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-w-[6.75rem] shrink-0 whitespace-nowrap"
                          onClick={() => startEditingPerms(ur.user_id)}
                        >
                          Permissões
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-1 pl-12 md:pl-0">
                      <Input
                        className="h-8 text-xs flex-1"
                        placeholder="Link da foto (URL)"
                        value={adminPhotoLinkByUser[ur.user_id] ?? ''}
                        onChange={(e) =>
                          setAdminPhotoLinkByUser((prev) => ({
                            ...prev,
                            [ur.user_id]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 shrink-0"
                        disabled={!adminPhotoLinkByUser[ur.user_id]?.trim()}
                        onClick={() =>
                          handlePhotoLinkSave(ur.user_id, adminPhotoLinkByUser[ur.user_id].trim())
                        }
                      >
                        Vincular
                      </Button>
                    </div>

                    {editingPermsUserId === ur.user_id && (
                      <div className="mt-2 p-3 bg-muted/50 rounded-md space-y-2">
                        <p className="text-sm font-medium">Permissões de acesso:</p>
                        <div className="overflow-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-1.5 pr-2 font-semibold">Tela</th>
                                {PERMISSION_ACTIONS.map(a => (
                                  <th key={a.action} className="text-center py-1.5 px-2 font-semibold">{a.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {PERMISSION_SCREENS.map(s => (
                                <tr key={s.screen} className="border-b last:border-0">
                                  <td className="py-1.5 pr-2 font-medium">{s.label}</td>
                                  {PERMISSION_ACTIONS.map(a => {
                                    const key = `${s.screen}_${a.action}`;
                                    return (
                                      <td key={key} className="text-center py-1.5 px-2">
                                        <Checkbox
                                          checked={permsDraft[key] ?? true}
                                          onCheckedChange={(checked) => setPermsDraft(prev => ({ ...prev, [key]: !!checked }))}
                                        />
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" onClick={savePermissions} disabled={permsSaving}>
                            {permsSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            Salvar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingPermsUserId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
                })}
                {allUsers.length > 4 && (
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" size="sm" onClick={() => setShowAllUsers(v => !v)}>
                      {showAllUsers ? 'Ver menos' : `Ver mais (${allUsers.length - 4})`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin: Activity Logs */}
      {isAdmin && (
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" /> Log de Atividades
            </CardTitle>
            <CardDescription>Registro das ações realizadas no sistema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-xs text-muted-foreground">De</label>
                <Input type="date" value={logFrom} onChange={e => setLogFrom(e.target.value)} className="w-36 h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Até</label>
                <Input type="date" value={logTo} onChange={e => setLogTo(e.target.value)} className="w-36 h-8 text-xs" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setLogFrom(todayStr); setLogTo(todayStr); }}>
                <Filter className="h-3 w-3 mr-1" /> Hoje
              </Button>
            </div>

            {logsLoading ? (
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
            ) : (
              <>
                <div className="max-h-80 overflow-auto space-y-2">
                  {displayedLogs.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg border text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{log.user_email}</p>
                        <p className="text-muted-foreground">{log.action}</p>
                        {log.details && <p className="text-xs text-muted-foreground mt-1">{log.details}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  ))}
                </div>
                {logs.length > 3 && !showAllLogs && (
                  <Button variant="link" size="sm" onClick={() => setShowAllLogs(true)}>
                    Ver todos ({logs.length})
                  </Button>
                )}
                {showAllLogs && (
                  <Button variant="link" size="sm" onClick={() => setShowAllLogs(false)}>
                    Mostrar apenas 3
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove permanentemente o usuário <strong>{deleteTarget?.label}</strong>
              {deleteTarget?.id ? ` (${deleteTarget.id})` : ''}. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={confirmAdminDeleteUser} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir cadastro
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setAdminNewPwd('');
            setAdminNewPwd2('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir nova senha</DialogTitle>
            <DialogDescription>
              A senha atual de <strong>{resetTarget?.label}</strong> não pode ser exibida (é armazenada de forma irreversível).
              Defina uma nova senha abaixo e informe o usuário por um canal seguro (telefone, presencial, etc.).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmAdminSetPassword} className="space-y-3">
            <Input
              type="password"
              placeholder="Nova senha (mín. 6 caracteres)"
              value={adminNewPwd}
              onChange={(e) => setAdminNewPwd(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Confirmar nova senha"
              value={adminNewPwd2}
              onChange={(e) => setAdminNewPwd2(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResetTarget(null);
                  setAdminNewPwd('');
                  setAdminNewPwd2('');
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={resetPwdLoading}>
                {resetPwdLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar senha
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
