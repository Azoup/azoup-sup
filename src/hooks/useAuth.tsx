import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  clearSupabaseAuthStorageExcept,
  formatSupabaseProjectMismatchMessage,
  getConfiguredSupabaseProjectRef,
  projectRefFromAccessToken,
} from '@/lib/supabaseProject';
import { clearLocalSession, consumeLogoutFlag, hasLogoutFlag } from '@/lib/signOutLocal';
import { withTimeout } from '@/lib/withTimeout';

const AUTH_INIT_TIMEOUT_MS = 4_000;
const AUTH_LOADING_WATCHDOG_MS = 8_000;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: () => {},
});

async function resolveValidSession(): Promise<Session | null> {
  const urlRef = getConfiguredSupabaseProjectRef();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const tokenRef = projectRefFromAccessToken(session.access_token);
  if (urlRef && tokenRef && urlRef !== tokenRef) {
    console.warn(formatSupabaseProjectMismatchMessage(urlRef, tokenRef));
    await supabase.auth.signOut({ scope: 'local' });
    clearSupabaseAuthStorageExcept(urlRef);
    return null;
  }

  return session;
}

async function resetAuthStateLocal(): Promise<void> {
  clearLocalSession();
}

function isAuthPath(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  const authPath = `${base}/auth`.replace(/\/+/g, '/').replace(/\/$/, '') || '/auth';
  return path === authPath || path.endsWith('/auth');
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => !hasLogoutFlag() && !isAuthPath());
  const signedOutRef = useRef(hasLogoutFlag());

  useEffect(() => {
    let mounted = true;

    const finishLoading = () => {
      if (mounted) setLoading(false);
    };

    if (consumeLogoutFlag()) {
      signedOutRef.current = true;
      clearLocalSession();
      setSession(null);
      finishLoading();
    }

    const fastAuthPage = isAuthPath() && !signedOutRef.current;

    const watchdog = window.setTimeout(() => {
      if (!mounted) return;
      console.warn('[auth] Watchdog: carregamento demorou demais — a limpar sessão local.');
      void resetAuthStateLocal().finally(() => {
        if (mounted) {
          setSession(null);
          setLoading(false);
        }
      });
    }, AUTH_LOADING_WATCHDOG_MS);

    if (fastAuthPage) {
      finishLoading();
    }

    const sessionTimeoutMs = fastAuthPage ? 1_500 : AUTH_INIT_TIMEOUT_MS;
    withTimeout(resolveValidSession(), sessionTimeoutMs, 'Inicialização de sessão expirou')
      .then((validSession) => {
        if (!mounted || signedOutRef.current) return;
        setSession(validSession);
      })
      .catch(() => {
        if (!mounted || signedOutRef.current) return;
        void resetAuthStateLocal();
        setSession(null);
      })
      .finally(() => {
        window.clearTimeout(watchdog);
        finishLoading();
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN') {
        signedOutRef.current = false;
      }

      if (!nextSession?.access_token) {
        setSession(null);
        finishLoading();
        return;
      }

      if (signedOutRef.current) {
        finishLoading();
        return;
      }

      const urlRef = getConfiguredSupabaseProjectRef();
      const tokenRef = projectRefFromAccessToken(nextSession.access_token);
      if (urlRef && tokenRef && urlRef !== tokenRef) {
        void resetAuthStateLocal().finally(() => {
          if (mounted) {
            setSession(null);
            finishLoading();
          }
        });
        return;
      }

      setSession(nextSession);
      finishLoading();

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void supabase.auth.setSession({
          access_token: nextSession.access_token,
          refresh_token: nextSession.refresh_token ?? '',
        });
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = () => {
    signedOutRef.current = true;
    setSession(null);
    setLoading(false);
    clearLocalSession();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
