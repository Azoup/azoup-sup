import { useState, useEffect, useRef, createContext, useContext, ReactNode, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  clearSupabaseAuthStorageExcept,
  formatSupabaseProjectMismatchMessage,
  getConfiguredSupabaseProjectRef,
  projectRefFromAccessToken,
} from '@/lib/supabaseProject';
import { buildAuthPath, isAuthPathname, isLogoutQuery } from '@/lib/authPaths';
import { clearLocalSession, consumeLogoutFlag, hasLogoutFlag } from '@/lib/signOutLocal';
import { TimeoutError, withTimeout } from '@/lib/withTimeout';

const AUTH_INIT_TIMEOUT_MS = 4_000;

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

function pendingLogout(search: string): boolean {
  return hasLogoutFlag() || isLogoutQuery(search);
}

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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const signedOutRef = useRef(pendingLogout(location.search));
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(
    () => !signedOutRef.current && !isAuthPathname(location.pathname),
  );

  const applySignedOut = useCallback(() => {
    signedOutRef.current = true;
    consumeLogoutFlag();
    clearLocalSession();
    setSession(null);
    setLoading(false);
    if (isLogoutQuery(location.search)) {
      window.history.replaceState({}, '', buildAuthPath());
    }
  }, [location.search]);

  useEffect(() => {
    let mounted = true;

    const finishLoading = () => {
      if (mounted) setLoading(false);
    };

    if (signedOutRef.current || pendingLogout(location.search)) {
      applySignedOut();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!mounted || !signedOutRef.current) return;
        if (event === 'SIGNED_IN' && nextSession?.access_token) {
          signedOutRef.current = false;
          setSession(nextSession);
        }
      });
      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }

    const onAuthPage = isAuthPathname(location.pathname);
    if (onAuthPage) {
      finishLoading();
    }

    const timeoutMs = onAuthPage ? 800 : AUTH_INIT_TIMEOUT_MS;
    withTimeout(resolveValidSession(), timeoutMs, 'Inicialização de sessão expirou')
      .then((validSession) => {
        if (!mounted || signedOutRef.current) return;
        setSession(validSession);
      })
      .catch((err) => {
        if (!mounted || signedOutRef.current) return;
        if (!(err instanceof TimeoutError)) {
          clearLocalSession();
        }
        setSession(null);
      })
      .finally(() => {
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
        clearLocalSession();
        setSession(null);
        finishLoading();
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
      subscription.unsubscribe();
    };
  }, [location.pathname, location.search, applySignedOut]);

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
