import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile, type Gym } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  gym: Gym | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null; needsVerification?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshGym: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export const AUTH_SESSION_NOTICE_KEY = 'mfc-auth-session-notice';
const FUTURE_JWT_RETRY_DELAY_MS = 3000;
const FUTURE_JWT_MAX_RETRIES = 20;

function isInvalidJwtError(message?: string) {
  return Boolean(message && /jwt.*(?:issued at future|expired|invalid)|invalid jwt/i.test(message));
}

function isFutureJwtError(message?: string) {
  return Boolean(message && /jwt.*issued at future/i.test(message));
}

function getJwtReadyDelay(accessToken?: string) {
  if (!accessToken) return 0;
  try {
    const encoded = accessToken.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!encoded) return 0;
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { iat?: number };
    if (!payload.iat) return 0;
    return Math.max(0, payload.iat * 1000 - Date.now() + 1500);
  } catch {
    return 0;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [loading, setLoading] = useState(true);
  const accessTokenRef = useRef<string | undefined>(undefined);
  accessTokenRef.current = session?.access_token;
  const userId = user?.id;
  const userDisplayName = (user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name) as string | undefined;
  const userEmail = user?.email;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        setProfile(null);
        setGym(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const loadAccount = async (futureJwtAttempt = 0, allowRefresh = true): Promise<void> => {
      setLoading(true);

      // Supabase Auth and PostgREST can occasionally differ by a few seconds.
      // Do not send a freshly issued JWT until its iat is valid locally.
      const tokenDelay = getJwtReadyDelay(accessTokenRef.current);
      if (tokenDelay > 0) {
        if (tokenDelay > 2 * 60 * 1000) {
          sessionStorage.setItem(
            AUTH_SESSION_NOTICE_KEY,
            'Your login token has an invalid timestamp. Please check your device time and sign in again.',
          );
          await supabase.auth.signOut({ scope: 'local' });
          if (!cancelled) setLoading(false);
          return;
        }
        await new Promise(resolve => window.setTimeout(resolve, tokenDelay));
        if (cancelled) return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const { data: initialGymData, error: gymError } = await supabase
        .from('gyms')
        .select('*')
        .eq('owner_user_id', userId)
        .limit(1);
      let gymData = initialGymData;

      const authError = [profileError, gymError].find(error => isInvalidJwtError(error?.message));
      if (authError) {
        if (isFutureJwtError(authError.message) && futureJwtAttempt < FUTURE_JWT_MAX_RETRIES) {
          const retryDelay = Math.max(FUTURE_JWT_RETRY_DELAY_MS, getJwtReadyDelay(accessTokenRef.current));
          if (retryDelay <= 2 * 60 * 1000) {
            await new Promise(resolve => window.setTimeout(resolve, retryDelay));
            if (!cancelled) await loadAccount(futureJwtAttempt + 1, allowRefresh);
            return;
          }
        }
        if (allowRefresh) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed.session) {
            await loadAccount(0, false);
            return;
          }
        }

        sessionStorage.setItem(
          AUTH_SESSION_NOTICE_KEY,
          'Your saved login session was invalid. Please sign in again.',
        );
        await supabase.auth.signOut({ scope: 'local' });
        if (!cancelled) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setGym(null);
          setLoading(false);
        }
        return;
      }

      if (profileError || gymError) {
        console.error('Unable to load account:', profileError?.message || gymError?.message);
      }

      // A user should be able to sign in and start using the app immediately.
      // Provision the required gym container when it is missing. The owner
      // creates their first membership plan in the onboarding flow.
      if (!gymData?.length) {
        const displayName = profileData?.display_name
          || userDisplayName
          || userEmail?.split('@')[0]
          || 'My';
        const { error: provisionError } = await supabase.rpc('ensure_user_gym', {
          p_gym_name: `${displayName}'s Gym`,
        });

        if (provisionError) {
          if (isInvalidJwtError(provisionError.message)) {
            if (isFutureJwtError(provisionError.message) && futureJwtAttempt < FUTURE_JWT_MAX_RETRIES) {
              const retryDelay = Math.max(FUTURE_JWT_RETRY_DELAY_MS, getJwtReadyDelay(accessTokenRef.current));
              if (retryDelay <= 2 * 60 * 1000) {
                await new Promise(resolve => window.setTimeout(resolve, retryDelay));
                if (!cancelled) await loadAccount(futureJwtAttempt + 1, allowRefresh);
                return;
              }
            }
            if (allowRefresh) {
              const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
              if (!refreshError && refreshed.session) {
                await loadAccount(0, false);
                return;
              }
            }
            sessionStorage.setItem(
              AUTH_SESSION_NOTICE_KEY,
              'Your saved login session was invalid. Please sign in again.',
            );
            await supabase.auth.signOut({ scope: 'local' });
            if (!cancelled) {
              setSession(null);
              setUser(null);
              setProfile(null);
              setGym(null);
              setLoading(false);
            }
            return;
          }
          console.error('Unable to provision gym:', provisionError.message);
        } else {
          const result = await supabase
            .from('gyms')
            .select('*')
            .eq('owner_user_id', userId)
            .limit(1);
          gymData = result.data;
        }
      }
      if (!cancelled) {
        setProfile(profileData as Profile | null);
        setGym(gymData && gymData.length > 0 ? gymData[0] as Gym : null);
        setLoading(false);
      }
    };
    void loadAccount();
    return () => { cancelled = true; };
  // Refreshing an auth token replaces the User object even though the signed-in
  // account has not changed. Depend on the stable id so background token
  // refreshes do not show the full-screen loader and remount the whole app.
  }, [userId, userDisplayName, userEmail]);

  const signUp = async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin + "/dashboard" },
    });
    if (error) return { error: getFriendlyAuthError(error.message) };
    if (data.user?.identities?.length === 0) {
      return { error: 'This email is already registered. Try signing in.' };
    }
    // When email confirmation is disabled, a session is available and the
    // profile can also be synced immediately. Confirmed-email flows are
    // handled by the database trigger created with the auth user.
    if (data.user && data.session) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        display_name: displayName,
      });
    }
    return { error: null, needsVerification: !data.session };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      return { error: getFriendlyAuthError(error.message) };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setGym(null);
  };

  const refreshGym = async () => {
    if (!user) return;
    const { data } = await supabase.from('gyms').select('*').eq('owner_user_id', user.id).limit(1);
    setGym(data && data.length > 0 ? data[0] as Gym : null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, gym, loading, signUp, signIn, signOut, refreshGym }}>
      {children}
    </AuthContext.Provider>
  );
}

function getFriendlyAuthError(msg: string): string {
  if (/email rate limit exceeded|over_email_send_rate_limit/i.test(msg)) {
    return 'Too many signup emails were requested. Please wait about one hour and try again, or ask the gym administrator to configure custom SMTP in Supabase.';
  }
  if (/rate limit|too many requests/i.test(msg)) {
    return 'Too many attempts were made. Please wait a few minutes before trying again.';
  }
  if (msg.includes('Invalid login credentials')) return 'Incorrect email or password. Please try again.';
  if (msg.includes('already registered')) return 'This email is already registered. Try signing in.';
  if (msg.includes('Password should be')) return 'Password must be at least 6 characters.';
  if (msg.includes('weak_password') || msg.includes('known to be weak')) return 'This password is too common. Please choose a stronger password.';
  if (msg.includes('pwned')) return 'This password has been found in data breaches. Please choose a different, stronger password.';
  if (msg.includes('User already registered')) return 'This email is already registered. Try signing in.';
  if (msg.includes('Email not confirmed')) return 'Please check your email for a confirmation link.';
  return msg;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
