import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  clearSupabaseAuthStorageExcept,
  formatSupabaseProjectMismatchMessage,
  getConfiguredSupabaseProjectRef,
  projectRefFromAccessToken,
} from '@/lib/supabaseProject';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

async function resolveValidSession(): Promise<Session | null> {
  const urlRef = getConfiguredSupabaseProjectRef();
  clearSupabaseAuthStorageExcept(urlRef);

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const tokenRef = projectRefFromAccessToken(session.access_token);
  if (urlRef && tokenRef && urlRef !== tokenRef) {
    console.warn(formatSupabaseProjectMismatchMessage(urlRef, tokenRef));
    await supabase.auth.signOut({ scope: 'local' });
    return null;
  }

  const { data: { user }, error } = await supabase.auth.getUser(session.access_token);
  if (error || !user) {
    await supabase.auth.signOut({ scope: 'local' });
    return null;
  }

  return session;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    resolveValidSession().then((validSession) => {
      if (mounted) {
        setSession(validSession);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !nextSession) {
        setSession(null);
        setLoading(false);
        return;
      }

      const urlRef = getConfiguredSupabaseProjectRef();
      const tokenRef = projectRefFromAccessToken(nextSession.access_token);
      if (urlRef && tokenRef && urlRef !== tokenRef) {
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setLoading(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
        } else {
          setSession(nextSession);
        }
      } else {
        setSession(nextSession);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
