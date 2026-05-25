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

function isValidSessionForProject(session: Session | null): boolean {
  if (!session?.access_token) return false;
  const urlRef = getConfiguredSupabaseProjectRef();
  const tokenRef = projectRefFromAccessToken(session.access_token);
  if (urlRef && tokenRef && urlRef !== tokenRef) {
    console.warn(formatSupabaseProjectMismatchMessage(urlRef, tokenRef));
    return false;
  }
  return true;
}

async function resolveValidSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!isValidSessionForProject(session)) {
    if (session?.access_token) {
      const urlRef = getConfiguredSupabaseProjectRef();
      await supabase.auth.signOut({ scope: 'local' });
      if (urlRef) clearSupabaseAuthStorageExcept(urlRef);
    }
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
  }, []);

  /** Responde só a ?logout=1 / flag — sem reinicializar auth em cada rota. */
  useEffect(() => {
    if (!pendingLogout(location.search)) return;
    applySignedOut();
    if (isLogoutQuery(location.search)) {
      window.history.replaceState({}, '', buildAuthPath());
    }
  }, [location.search, applySignedOut]);

  /** Inicialização e listener de sessão — uma vez no mount. */
  useEffect(() => {
    let mounted = true;

    const finishLoading = () => {
      if (mounted) setLoading(false);
    };

    if (signedOutRef.current) {
      finishLoading();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!mounted || !signedOutRef.current) return;
        if (event === 'SIGNED_IN' && nextSession?.access_token && isValidSessionForProject(nextSession)) {
          signedOutRef.current = false;
          setSession(nextSession);
        }
      });
      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }

    withTimeout(resolveValidSession(), AUTH_INIT_TIMEOUT_MS)
      .then((validSession) => {
        if (!mounted || signedOutRef.current) return;
        if (validSession) setSession(validSession);
      })
      .catch((err) => {
        if (!mounted || signedOutRef.current) return;
        if (!(err instanceof TimeoutError)) {
          clearLocalSession();
          setSession(null);
        }
      })
      .finally(() => {
        finishLoading();
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN') {
        signedOutRef.current = false;
      }

      if (event === 'SIGNED_OUT') {
        if (!signedOutRef.current) {
          setSession(null);
        }
        finishLoading();
        return;
      }

      if (!nextSession?.access_token) {
        finishLoading();
        return;
      }

      if (signedOutRef.current) {
        finishLoading();
        return;
      }

      if (!isValidSessionForProject(nextSession)) {
        clearLocalSession();
        setSession(null);
        finishLoading();
        return;
      }

      setSession(nextSession);
      finishLoading();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySignedOut]);

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
