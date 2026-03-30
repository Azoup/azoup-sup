import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, KeyRound, User, Shield, ScrollText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const Profile = () => {
  const { user } = useAuth();
  const { isAdmin, role } = useRole();
  const queryClient = useQueryClient();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Profile display name
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Admin: all users with roles
  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users-roles'],
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('*');
      return roles || [];
    },
    enabled: isAdmin,
  });

  // Admin: activity logs
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['activity-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: isAdmin,
  });

  // Update role mutation
  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      // Upsert role
      const { error: delError } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (delError) throw delError;
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users-roles'] });
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

      {/* User Info */}
      <Card className="border shadow-sm max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Informações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
      <Card className="border shadow-sm max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Alterar Senha
          </CardTitle>
          <CardDescription>Preencha os campos para alterar sua senha.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Input type="password" placeholder="Senha atual" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            <Input type="password" placeholder="Nova senha" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
            <Input type="password" placeholder="Confirmar nova senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
            <Button type="submit" disabled={pwLoading}>
              {pwLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Nova Senha
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Admin: Manage Roles */}
      {isAdmin && (
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Gerenciar Permissões
            </CardTitle>
            <CardDescription>Altere o tipo de perfil dos usuários do sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            {allUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum usuário com papel definido.</p>
            ) : (
              <div className="space-y-3">
                {allUsers.map((ur: any) => (
                  <div key={ur.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border">
                    <span className="text-sm font-medium truncate">{ur.user_id}</span>
                    <Select
                      defaultValue={ur.role}
                      onValueChange={(val) => updateRole.mutate({ userId: ur.user_id, newRole: val })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">Padrão</SelectItem>
                      </SelectContent>
                    </Select>
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
          <CardContent>
            {logsLoading ? (
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
            ) : (
              <div className="max-h-96 overflow-auto space-y-2">
                {logs.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border text-sm">
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
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Profile;
