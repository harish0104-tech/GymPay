import { useState, type FormEvent } from 'react';
import { AUTH_SESSION_NOTICE_KEY, useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type AuthWindow = Window & { ReactNativeWebView?: { postMessage: (data: string) => void }; mfcGoogleAuth?: boolean };

export default function LoginPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
    if (params.has('error')) return 'Google sign-in was cancelled or could not be completed. Please try again.';
    const sessionNotice = sessionStorage.getItem(AUTH_SESSION_NOTICE_KEY) ?? '';
    sessionStorage.removeItem(AUTH_SESSION_NOTICE_KEY);
    return sessionNotice;
  });
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) setError(result.error);
    } catch {
      setError('Unable to sign in. Please try again.');
    } finally { setBusy(false); }
  };
  const continueWithGoogle = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const native = window as AuthWindow;
      if (native.ReactNativeWebView && !native.mfcGoogleAuth) throw new Error('Please install the latest MFC app to use Google sign-in.');
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: native.ReactNativeWebView ? 'mfc://auth/callback' : window.location.origin + '/dashboard',
        skipBrowserRedirect: Boolean(native.ReactNativeWebView),
      } });
      if (error) throw error;
      if (native.ReactNativeWebView) {
        const code = await new Promise<string>((resolve, reject) => {
          const id = crypto.randomUUID();
          const finish = (detail: { error?: string; code?: string }) => {
            clearTimeout(timer); window.removeEventListener('mfc-google-auth', listener);
            if (detail.error || !detail.code) reject(new Error(detail.error || 'Sign-in cancelled.')); else resolve(detail.code);
          };
          const listener = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.id === id) finish(detail);
          };
          const timer = window.setTimeout(() => finish({ error: 'Sign-in timed out. Please try again.' }), 300000);
          window.addEventListener('mfc-google-auth', listener);
          native.ReactNativeWebView!.postMessage(JSON.stringify({ type: 'MFC_GOOGLE_AUTH', id, url: data.url }));
        });
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        window.history.replaceState({}, '', '/dashboard');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  };
  return <main data-theme="light" className="theme-shell minimal-theme auth-background min-h-[100svh] flex items-center justify-center p-6">
    <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
      <img src="/mfc-icon-v2-192.png" alt="MFC" className="mx-auto mb-6 h-20 w-20 rounded-xl" />
      <h1 className="font-display text-3xl">{mode === 'login' ? 'LOGIN TO MFC' : 'CREATE YOUR ACCOUNT'}</h1>
      <p className="mt-3 text-sm text-ink-500">{mode === 'login' ? 'Welcome back. Sign in to manage your gym.' : 'Sign up with your Google account to get started.'}</p>
      {mode === 'login' && <form onSubmit={login} className="mt-6 space-y-4 text-left">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium">Email</label>
          <input id="login-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-black" />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-sm font-medium">Password</label>
          <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-black" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full py-3">{busy ? 'Signing in…' : 'Log in'}</button>
        <p className="text-center text-sm text-ink-500">Or sign in with Google</p>
      </form>}
      <button type="button" onClick={continueWithGoogle} disabled={busy} className="btn-primary mt-6 w-full py-3">{busy ? 'Signing in…' : 'Continue with Google'}</button>
      {error && <p role="alert" className="mt-4 text-sm text-status-danger">{error}</p>}
      {mode === 'signup' && <p className="mt-4 text-xs text-ink-500">No separate MFC password or confirmation email required. Use Google when you log in again.</p>}
      <p className="mt-6 text-sm text-ink-500">
        {mode === 'login' ? 'New to MFC? ' : 'Already have an account? '}
        <button type="button" disabled={busy} className="font-semibold text-black underline underline-offset-4" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setPassword(''); }}>{mode === 'login' ? 'Sign up' : 'Log in'}</button>
      </p>
    </section>
  </main>;
}
