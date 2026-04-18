import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Loader2, KeyRound, User, Shield, ScrollText, Filter, Camera, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Admin: all users with roles + profiles for email + photo
  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users-roles-profiles'],
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('*');
      const { data: profiles } = await supabase.from('profiles').select('*');
      return (roles || []).map((r: any) => {
        const p = profiles?.find((x: any) => x.id === r.user_id);
        return {
          ...r,
          email: p?.display_name || r.user_id,
          photo_url: p?.photo_url || '',
        };
      });
    },
    enabled: isAdmin,
  });

  // Photo upload (for self or admin-managed user)
  const handlePhotoUpload = async (targetUserId: string, file: File) => {
    try {
      const ext = file.name.split('.').pop();
      const path = `${targetUserId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('profile-photos').getPublicUrl(path);
      const { error } = await supabase.from('profiles').update({ photo_url: publicUrl }).eq('id', targetUserId);
      if (error) throw error;
      toast.success('Foto atualizada!');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['all-users-roles-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['card-comments'] });
      queryClient.invalidateQueries({ queryKey: ['dev-card-comments'] });
    } catch (e: any) {
      toast.error('Erro ao enviar foto: ' + (e.message || ''));
    }
  };

  const handlePhotoRemove = async (targetUserId: string) => {
    const { error } = await supabase.from('profiles').update({ photo_url: null }).eq('id', targetUserId);
    if (error) { toast.error('Erro ao remover foto'); return; }
    toast.success('Foto removida');
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['all-users-roles-profiles'] });
    queryClient.invalidateQueries({ queryKey: ['card-comments'] });
    queryClient.invalidateQueries({ queryKey: ['dev-card-comments'] });
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
        allowed: permsDraft[p.key] ?? true,
      }));
      const { error } = await supabase.from('user_permissions').insert(rows);
      if (error) throw error;
      toast.success('Permissões salvas!');
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
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
      toast.success('Permissão atualizada!');
    },
    onError: () => toast.error('Erro ao atualizar permissão.'),
  });

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
              <Avatar className="h-16 w-16">
                {profile?.photo_url && <AvatarImage src={profile.photo_url} alt={profile.display_name || ''} />}
                <AvatarFallback className="text-lg">
                  {(profile?.display_name || user?.email || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
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
                {profile?.photo_url && (
                  <button
                    onClick={() => user && handlePhotoRemove(user.id)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" /> Remover
                  </button>
                )}
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
            <CardDescription>Altere o tipo de perfil e permissões granulares dos usuários.</CardDescription>
          </CardHeader>
          <CardContent>
            {allUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
            ) : (
              <div className="space-y-3">
                {allUsers.map((ur: any) => (
                  <div key={ur.id} className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 shrink-0">
                          {ur.photo_url && <AvatarImage src={ur.photo_url} alt={ur.email} />}
                          <AvatarFallback>{(ur.email || '?').charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{ur.email}</p>
                          <p className="text-xs text-muted-foreground truncate">{ur.user_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="cursor-pointer" title="Alterar foto">
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
                          <span className="inline-flex items-center justify-center h-8 w-8 rounded border hover:bg-accent">
                            <Camera className="h-3.5 w-3.5" />
                          </span>
                        </label>
                        {ur.photo_url && (
                          <button
                            onClick={() => handlePhotoRemove(ur.user_id)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded border text-destructive hover:bg-destructive/10"
                            title="Remover foto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <Select
                          defaultValue={ur.role}
                          onValueChange={(val) => updateRole.mutate({ userId: ur.user_id, newRole: val })}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="user">Padrão</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => startEditingPerms(ur.user_id)}>
                          Permissões
                        </Button>
                      </div>
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
                ))}
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
    </div>
  );
};

export default Profile;
