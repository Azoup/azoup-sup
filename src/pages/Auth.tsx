import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { loadAndCacheUserAccess } from '@/lib/userAccessLoad';
import { getSiteUrl } from '@/lib/siteUrl';
import { formatAuthErrorMessage } from '@/lib/authErrors';
import { logActivity } from '@/hooks/useActivityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Headset, Loader2 } from 'lucide-react';

const Auth = () => {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

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
        toast.error(formatAuthErrorMessage(error));
      } else {
        toast.success('Conta criada! Verifique seu email para confirmar.');
      }
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      toast.error(formatAuthErrorMessage(error));
      setLoading(false);
      return;
    }
    if (!data.session?.access_token || !data.user?.id) {
      toast.error('Sessão não iniciada. Confirme o email ou tente novamente.');
      setLoading(false);
      return;
    }

    void logActivity('Login no sistema');

    try {
      const cached = await loadAndCacheUserAccess(data.session.access_token, data.user.id);
      queryClient.setQueryData(['user-access', data.user.id], cached);
    } catch {
      /* AuthRoute aguarda a query se o pré-carregamento falhar */
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
            {isSignUp ? 'Crie sua conta para começar' : 'Faça login para acessar o sistema'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignUp ? 'Criar Conta' : 'Entrar'}
            </Button>
          </form>
          <button onClick={() => setIsSignUp(!isSignUp)} className="w-full text-center mt-3 text-sm text-muted-foreground hover:text-primary transition-colors">
            {isSignUp ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}
          </button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
