import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPasswordResetRedirectUrl, getSiteUrl } from '@/lib/siteUrl';
import { logActivity } from '@/hooks/useActivityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Headset, Loader2 } from 'lucide-react';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error('Informe seu email.'); return; }
    setLoading(true);
    const redirectTo = getPasswordResetRedirectUrl();
    const useEmailJs = import.meta.env.VITE_PASSWORD_RESET_VIA_EMAILJS === 'true';

    if (useEmailJs) {
      const { data, error } = await supabase.functions.invoke('password-reset-email', {
        body: { email: email.trim(), redirect_to: redirectTo },
      });
      setLoading(false);
      if (error) {
        toast.error(error.message || 'Não foi possível enviar o e-mail.');
        return;
      }
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        toast.error('Não foi possível enviar o e-mail. Tente novamente mais tarde.');
        return;
      }
      toast.success('Se existir uma conta com este e-mail, você receberá o link de redefinição.');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Link de redefinição enviado! Verifique seu email.');
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: getSiteUrl() },
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Conta criada! Verifique seu email para confirmar.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error('Email ou senha incorretos.');
      } else {
        logActivity('Login no sistema');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-fade-in shadow-xl border-0">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <Headset className="w-7 h-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-heading">Suporte Analytics</CardTitle>
          <CardDescription>
            {forgotMode ? 'Informe seu email para redefinir a senha' : isSignUp ? 'Crie sua conta para começar' : 'Faça login para acessar o sistema'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forgotMode ? (
            <>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar Link de Redefinição
                </Button>
              </form>
              <button onClick={() => setForgotMode(false)} className="w-full text-center mt-4 text-sm text-muted-foreground hover:text-primary transition-colors">
                Voltar ao login
              </button>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSignUp ? 'Criar Conta' : 'Entrar'}
                </Button>
              </form>
              {!isSignUp && (
                <button onClick={() => setForgotMode(true)} className="w-full text-center mt-3 text-sm text-muted-foreground hover:text-primary transition-colors">
                  Esqueci minha senha
                </button>
              )}
              <button onClick={() => setIsSignUp(!isSignUp)} className="w-full text-center mt-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                {isSignUp ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
