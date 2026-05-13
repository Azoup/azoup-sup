import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Headset, Loader2 } from 'lucide-react';

type LocationState = { email?: string };

const ResetPasswordCode = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState | null)?.email;

  const [email, setEmail] = useState(typeof state === 'string' ? state : '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof state === 'string' && state) setEmail(state);
  }, [state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Informe seu e-mail.');
      return;
    }
    if (code.replace(/\D/g, '').length !== 6) {
      toast.error('Informe o código de 6 dígitos enviado por e-mail.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.functions.invoke('password-reset-confirm-code', {
      body: {
        email: email.trim().toLowerCase(),
        code: code.replace(/\D/g, ''),
        new_password: newPassword,
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message || 'Não foi possível redefinir a senha.');
      return;
    }
    if (data && typeof data === 'object' && 'error' in data) {
      const err = (data as { error?: string }).error;
      if (err === 'invalid_code') {
        toast.error('Código inválido ou expirado. Solicite um novo código na tela de login.');
      } else if (err === 'weak_password') {
        toast.error('Senha muito curta.');
      } else {
        toast.error('Não foi possível redefinir a senha.');
      }
      return;
    }

    toast.success('Senha redefinida! Faça login com a nova senha.');
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-fade-in shadow-xl border-0">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <Headset className="w-7 h-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-heading">Redefinir senha</CardTitle>
          <CardDescription>
            Digite o código de 6 dígitos recebido por e-mail (EmailJS) e a nova senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="E-mail da conta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Código (6 dígitos)"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoComplete="one-time-code"
            />
            <Input
              type="password"
              placeholder="Nova senha (mín. 6 caracteres)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Confirmar nova senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Redefinir senha
            </Button>
          </form>
          <Link to="/auth" className="block w-full text-center mt-4 text-sm text-muted-foreground hover:text-primary transition-colors">
            Voltar ao login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPasswordCode;
