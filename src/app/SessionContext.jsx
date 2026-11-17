import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [publicBusiness, setPublicBusiness] = useState(null);
  const [branding, setBranding] = useState(null);
  const [session, setSession] = useState(null);
  const [lockReason, setLockReason] = useState('');
  const lastActivity = useRef(Date.now());

  const refresh = useCallback(async () => {
    const current = await api('auth.session');
    setSession(current);
    return current;
  }, []);

  const refreshBranding = useCallback(async () => {
    const next = await api('branding.get');
    setBranding(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await api('auth.setupStatus');
        if (!active) return;
        setNeedsSetup(Boolean(status.needsSetup));
        setPublicBusiness(status.business || null);
        api('branding.get')
          .then((value) => {
            if (active) setBranding(value);
          })
          .catch(() => {
            // Branding is presentation-only; a missing logo must never block sign-in.
          });
        if (!status.needsSetup) {
          const current = await api('auth.session');
          if (active) setSession(current);
        }
      } catch (error) {
        if (active) setBootError(error);
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setSession(null);
      setLockReason('expired');
    };
    window.addEventListener('mf:session-expired', onExpired);
    return () => window.removeEventListener('mf:session-expired', onExpired);
  }, []);

  const login = useCallback(async (credentials) => {
    const current = await api('auth.login', credentials);
    setSession(current);
    setNeedsSetup(false);
    setLockReason('');
    setPublicBusiness(current.business || null);
    refreshBranding().catch(() => {});
    return current;
  }, [refreshBranding]);

  const setupOwner = useCallback(async (input) => {
    const current = await api('auth.setupOwner', input);
    setSession(current);
    setNeedsSetup(false);
    setLockReason('');
    setPublicBusiness(current.business || null);
    refreshBranding().catch(() => {});
    return current;
  }, [refreshBranding]);

  const logout = useCallback(async (input = {}) => {
    const result = await api('auth.logout', input);
    setSession(null);
    setLockReason('');
    return result;
  }, []);

  const lock = useCallback(async () => {
    try {
      await api('auth.lock');
    } finally {
      setSession(null);
      setLockReason('locked');
    }
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    lastActivity.current = Date.now();
    const touch = () => {
      lastActivity.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    const minutes = Number(session.idleMinutes || 60);
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current >= minutes * 60000) {
        lock();
      }
    }, 30000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, touch));
      clearInterval(timer);
    };
  }, [session, lock]);

  const can = useCallback(
    (permission) => Boolean(session?.permissions?.includes(permission)),
    [session]
  );

  const value = useMemo(
    () => ({
      booting,
      bootError,
      needsSetup,
      publicBusiness,
      branding,
      session,
      user: session?.user || null,
      permissions: session?.permissions || [],
      business: session?.business || publicBusiness,
      lockReason,
      login,
      setupOwner,
      logout,
      lock,
      refresh,
      refreshBranding,
      can,
    }),
    [booting, bootError, needsSetup, publicBusiness, branding, session, lockReason, login, setupOwner, logout, lock, refresh, refreshBranding, can]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// The context and its consumer hook intentionally live together.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider.');
  return context;
}
