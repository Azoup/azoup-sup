import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, KeyRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const ChangePassword = () => {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);

    // Verify current password by re-signing in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user?.email || '',
      password: currentPassword,
    });
    if (signInError) {
      toast.error('Senha atual incorreta.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-heading font-bold">Alterar Senha</h1>
      <Card className="border shadow-sm max-w-md">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Nova Senha
          </CardTitle>
          <CardDescription>Preencha os campos para alterar sua senha.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="password" placeholder="Senha atual" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            <Input type="password" placeholder="Nova senha" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
            <Input type="password" placeholder="Confirmar nova senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Nova Senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChangePassword;
