import { useCallback, useEffect, useState } from "react";
import {
  clearAuthSession,
  createAndStoreAuthSession,
  restoreAuthSession,
  type AuthSession,
  type AuthSignInInput,
} from "./authSession";

export function useAuthSession() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    restoreAuthSession()
      .then((restoredSession) => {
        if (!cancelled) {
          setSession(restoredSession);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRestoringSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (input: AuthSignInInput) => {
    const nextSession = await createAndStoreAuthSession(input);
    setSession(nextSession);
  }, []);

  const signOut = useCallback(async () => {
    await clearAuthSession();
    setSession(null);
  }, []);

  return {
    isAuthenticated: session !== null,
    isRestoringSession,
    session,
    signIn,
    signOut,
  };
}
