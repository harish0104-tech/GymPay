import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase, type NotificationSettings } from '@/lib/supabase';
import { disableFcmNotifications, enableFcmNotifications, getFcmSupport, isCurrentFcmDeviceEnabled, scheduleFcmTest } from '@/lib/firebaseNotifications';
import { Loader2, Building2, Bell, User, LogOut, MessageCircle, AlertCircle, CheckCircle2 } from 'lucide-react';

// WhatsApp support is preserved for future use but intentionally hidden from the UI.
const SHOW_WHATSAPP_SETTINGS = false;

export default function SettingsPage() {
  const { gym, profile, user, signOut, refreshGym } = useAuth();
  const { toast } = useToast();
  const [gymName, setGymName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [oneDayBefore, setOneDayBefore] = useState(true);
  const [expiryDay, setExpiryDay] = useState(true);
  const [thisDeviceSubscribed, setThisDeviceSubscribed] = useState(false);
  const [configuringPush, setConfiguringPush] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [waConnected, setWaConnected] = useState(false);
  const [waToken, setWaToken] = useState('');
  const [waPhoneId, setWaPhoneId] = useState('');
  const [savingWa, setSavingWa] = useState(false);
  const [showWaFields, setShowWaFields] = useState(false);
  const [pushSupport, setPushSupport] = useState({ supported: true, reason: null as string | null });

  useEffect(() => {
    if (!gym) return;
    setGymName(gym.name);
    setOwnerName(gym.owner_name ?? '');
    setWhatsappNumber(gym.owner_whatsapp_number ?? '');
  }, [gym]);

  useEffect(() => {
    if (!gym) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (!cancelled) { setLoadError(true); setLoading(false); }
    }, 10000);
    void (async () => {
      try {
      const { data: nsData, error } = await supabase.from('notification_settings').select('*').eq('gym_id', gym.id).abortSignal(controller.signal).maybeSingle();
      if (cancelled || controller.signal.aborted) return;
      if (error) throw error;
      if (nsData) {
        const ns = nsData as NotificationSettings;
        setWhatsappEnabled(ns.whatsapp_enabled);
        setOneDayBefore(ns.one_day_before_enabled);
        setExpiryDay(ns.expiry_day_enabled);
        if (ns.owner_whatsapp_number) setWhatsappNumber(ns.owner_whatsapp_number);
      }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [gym?.id, retry]);

  useEffect(() => {
    let cancelled = false;
    setThisDeviceSubscribed(false);
    setPushSupport({ supported: false, reason: 'Checking notification support…' });
    const timeout = window.setTimeout(() => {
      cancelled = true;
      setPushSupport({ supported: false, reason: 'Device notification check timed out. Reminders remain available in the app.' });
    }, 8000);
    void (async () => {
      try {
        const support = await getFcmSupport();
        const subscribed = support.supported ? await isCurrentFcmDeviceEnabled() : false;
        if (!cancelled) { setPushSupport(support); setThisDeviceSubscribed(subscribed); }
      } catch {
        if (!cancelled) setPushSupport({ supported: false, reason: 'Device notifications are unavailable. Reminders remain available in the app.' });
      } finally { window.clearTimeout(timeout); }
    })();
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [gym?.id, retry]);

  useEffect(() => {
    if (!SHOW_WHATSAPP_SETTINGS || !gym) return;
    let cancelled = false;
    void (async () => {
      const { data: waData } = await supabase.from('whatsapp_config').select('phone_number_id').eq('gym_id', gym.id).maybeSingle();
      if (cancelled) return;
      if (waData) {
        setWaConnected(true);
        setWaPhoneId((waData as any).phone_number_id);
      }
    })();
    return () => { cancelled = true; };
  }, [gym?.id]);

  const handleSaveWhatsApp = async () => {
    if (!gym) return;
    if (!waToken.trim() || !waPhoneId.trim()) {
      toast('Access Token and Phone Number ID are required.', 'error');
      return;
    }
    setSavingWa(true);
    try {
      const { data: existing } = await supabase.from('whatsapp_config').select('id').eq('gym_id', gym.id).maybeSingle();
      if (existing) {
        const { error } = await supabase.from('whatsapp_config').update({
          access_token: waToken.trim(),
          phone_number_id: waPhoneId.trim(),
        }).eq('gym_id', gym.id);
        if (error) throw new Error('Failed to update WhatsApp credentials');
      } else {
        const { error } = await supabase.from('whatsapp_config').insert({
          gym_id: gym.id,
          access_token: waToken.trim(),
          phone_number_id: waPhoneId.trim(),
          api_version: 'v21.0',
        });
        if (error) throw new Error('Failed to save WhatsApp credentials');
      }
      setWaConnected(true);
      setShowWaFields(false);
      setWaToken('');
      toast('WhatsApp credentials saved');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSavingWa(false);
    }
  };

  const handleSaveGym = async () => {
    if (!gym) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('gyms').update({
        name: gymName.trim(),
        owner_name: ownerName.trim(),
        owner_whatsapp_number: whatsappNumber.trim(),
      }).eq('id', gym.id);
      if (error) throw new Error('Failed to update gym profile');
      await refreshGym();
      toast('Gym profile updated');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!gym || loading || loadError) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase.from('notification_settings').select('id').eq('gym_id', gym.id).maybeSingle();
      if (existing) {
        const { error } = await supabase.from('notification_settings').update({
          owner_whatsapp_number: whatsappNumber.trim(),
          whatsapp_enabled: whatsappEnabled,
          one_day_before_enabled: oneDayBefore,
          expiry_day_enabled: expiryDay,
        }).eq('gym_id', gym.id);
        if (error) throw new Error('Failed to update notification settings');
      } else {
        const { error } = await supabase.from('notification_settings').insert({
          gym_id: gym.id,
          owner_whatsapp_number: whatsappNumber.trim(),
          whatsapp_enabled: whatsappEnabled,
          one_day_before_enabled: oneDayBefore,
          expiry_day_enabled: expiryDay,
        });
        if (error) throw new Error('Failed to save notification settings');
      }
      const { error: preferenceError } = await supabase.from('notification_preferences').upsert({
        gym_id: gym.id,
        in_app_enabled: true,
        browser_push_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'gym_id' });
      if (preferenceError) throw new Error(preferenceError.message);
      toast('Notification settings updated');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleThisDeviceRegistration = async () => {
    if (!gym || !user) return;
    setConfiguringPush(true);
    try {
      await enableFcmNotifications(gym.id, user.id);
      const { error } = await supabase.from('notification_preferences').upsert({
        gym_id: gym.id,
        browser_push_enabled: true,
        in_app_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'gym_id' });
      if (error) throw new Error(error.message);
      setThisDeviceSubscribed(true);
      toast('This device is registered for browser push.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update this device', 'error');
    } finally {
      setConfiguringPush(false);
    }
  };

  const handleDisableDevice = async () => {
    setConfiguringPush(true);
    try { await disableFcmNotifications(); setThisDeviceSubscribed(false); toast('Notifications disabled on this device.'); }
    catch (err) { toast(err instanceof Error ? err.message : 'Could not disable this device', 'error'); }
    finally { setConfiguringPush(false); }
  };

  const handleTestNotification = async () => {
    try { const test = await scheduleFcmTest(3); toast(`Test scheduled for ${new Date(test.scheduled_at).toLocaleTimeString()}.`); }
    catch (err) { toast(err instanceof Error ? err.message : 'Could not schedule test', 'error'); }
  };

  if (!gym) return <div className="p-8 text-center text-ink-400">Gym profile unavailable. Please sign in again.</div>;

  return (
    <div className="mx-auto flex h-[calc(100svh-5rem)] w-full min-w-0 max-w-6xl flex-col overflow-hidden px-4 py-4 sm:px-5 md:h-screen md:px-8 md:py-6">
      <div className="mb-4 shrink-0">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500">Account settings</p>
        <h1 className="font-display text-2xl tracking-wide md:text-3xl">SETTINGS</h1>
        <p className="mt-1 text-sm text-ink-500">Manage your gym and owner account.</p>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 md:grid-cols-[minmax(0,1.65fr)_minmax(260px,0.8fr)]">
      {/* Gym Profile */}
      <div className="card relative min-w-0 overflow-hidden p-4 sm:p-5">
        <span className="absolute inset-y-0 left-0 w-1 bg-brand-yellow" aria-hidden="true" />
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-yellow/20 text-ink-900">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-bold">Gym Profile</h2>
            <p className="text-xs text-ink-500">Public business information</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-700">Gym Name</label>
            <input value={gymName} onChange={e => setGymName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-700">Owner Name</label>
            <input value={ownerName} onChange={e => setOwnerName(e.target.value)} className="input-field" />
          </div>
          <button onClick={handleSaveGym} disabled={saving} className="btn-primary w-full sm:w-auto sm:min-w-44">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Gym Profile'}
          </button>
        </div>
      </div>

      {/* Account */}
      <div className="card min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
            <User className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-bold">Account</h2>
            <p className="text-xs text-ink-500">Signed-in owner account</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="min-w-0 text-sm">
            <span className="shrink-0 text-ink-500">Email</span>
            <span className="mt-1 block min-w-0 break-all font-medium">{user?.email ?? '—'}</span>
          </div>
          <button onClick={signOut} className="btn-ghost w-full border border-status-danger/30 text-status-danger hover:bg-status-danger-bg">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>

      </div>

        <div className="hidden">

      {/* Notifications container intentionally disabled on web and app. */}
      {false && <>
      {/* Notifications */}
      <div className="card relative min-w-0 flex-1 overflow-hidden p-5 sm:p-6">
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-yellow via-brand-yellow to-transparent" aria-hidden="true" />
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-yellow/15 text-brand-yellow-dark">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-bold">Notifications</h2>
            <p className="text-xs text-ink-500">Delivery channels and timing</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-status-active/30 bg-status-active-bg p-4">
            <p className="text-sm font-medium text-status-active">In-app notifications are always on</p>
            <p className="text-xs text-ink-500">Expiry reminders always appear inside Marvel Fitness Culture.</p>
          </div>
          <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-ink-200 bg-ink-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Browser push on this device</p>
              <p className="text-xs text-ink-500">
                {thisDeviceSubscribed ? 'Registered and ready to receive push notifications' : (pushSupport.reason ?? 'Permission is required once on every device')}
              </p>
            </div>
            {!thisDeviceSubscribed && pushSupport.supported ? (
              <button
                type="button"
                onClick={handleThisDeviceRegistration}
                disabled={configuringPush}
                className="btn-primary w-full shrink-0 whitespace-nowrap text-xs sm:w-auto"
              >
                {configuringPush ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enable device'}
              </button>
            ) : thisDeviceSubscribed ? (
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                <button type="button" onClick={handleTestNotification} className="btn-primary min-w-0 whitespace-nowrap px-2 text-xs sm:px-4">Test in 3 min</button>
                <button type="button" onClick={handleDisableDevice} disabled={configuringPush} className="btn-ghost min-w-0 whitespace-nowrap px-2 text-xs sm:px-4">Disable device</button>
              </div>
            ) : null}
          </div>
          <div className="border-t border-ink-200 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-3">Reminder timing</p>
          </div>
          {SHOW_WHATSAPP_SETTINGS ? (
            <>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Owner WhatsApp Number</label>
                <input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} className="input-field" placeholder="9876543210" inputMode="tel" />
              </div>
              <ToggleRow label="WhatsApp Reminders" description="Send reminders via WhatsApp to the owner" checked={whatsappEnabled} onChange={setWhatsappEnabled} />
            </>
          ) : null}
          {loading && <p role="status" className="text-sm text-ink-500">Loading reminder preferences…</p>}
          {loadError && <div role="alert" className="text-sm text-status-warning">Could not load reminder preferences. Your saved settings have not changed. <button type="button" className="btn-ghost" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
          <ToggleRow disabled={loading || loadError} label="On Expiry Date" description="Remind about members expiring today" checked={expiryDay} onChange={setExpiryDay} />
          <button onClick={handleSaveNotifications} disabled={saving || loading || loadError} className="btn-primary mt-2 w-full sm:w-auto sm:min-w-56">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Notification Settings'}
          </button>
        </div>
      </div>

      </>}
      {/* WhatsApp Configuration: retained but hidden until the feature is enabled again. */}
      {SHOW_WHATSAPP_SETTINGS ? <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-brand-yellow" />
          <h2 className="font-heading text-lg font-semibold">WhatsApp Business API</h2>
        </div>

        {waConnected ? (
          <div className="space-y-4">
            <div className="bg-status-active-bg border border-status-active/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-status-active flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-status-active">WhatsApp API connected</p>
                  <p className="text-xs text-ink-500 mt-1">
                    Phone Number ID: {waPhoneId}. Reminders will be sent via WhatsApp automatically.
                  </p>
                </div>
              </div>
            </div>
            <button onClick={() => setShowWaFields(!showWaFields)} className="btn-ghost text-sm">
              {showWaFields ? 'Hide' : 'Update'} credentials
            </button>
          </div>
        ) : (
          <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-status-warning">WhatsApp API not connected</p>
                <p className="text-xs text-ink-500 mt-1">
                  Enter your Meta WhatsApp Cloud API credentials below to start sending reminders via WhatsApp.
                </p>
              </div>
            </div>
          </div>
        )}

        {showWaFields || !waConnected ? (
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Access Token</label>
              <input
                type="password"
                value={waToken}
                onChange={e => setWaToken(e.target.value)}
                className="input-field"
                placeholder="EAAs0EfC..."
              />
              <p className="text-xs text-ink-400 mt-1">From Meta WhatsApp Manager. Your token is stored securely and never exposed in the app.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Phone Number ID</label>
              <input
                value={waPhoneId}
                onChange={e => setWaPhoneId(e.target.value)}
                className="input-field"
                placeholder="1348200995032647"
              />
            </div>
            <button onClick={handleSaveWhatsApp} disabled={savingWa} className="btn-primary">
              {savingWa ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save WhatsApp Credentials'}
            </button>
          </div>
        ) : null}

        {!waConnected && (
          <div className="mt-4 pt-4 border-t border-ink-200">
            <p className="text-sm font-medium mb-1">How to get these credentials:</p>
            <ol className="text-xs text-ink-500 space-y-1.5 list-decimal list-inside">
              <li>Go to <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="text-brand-pure underline">Meta Business Suite</a> and create a Business account</li>
              <li>Add the WhatsApp Business Platform to your account</li>
              <li>Get your Access Token and Phone Number ID from the WhatsApp Manager</li>
              <li>Paste them above and click Save</li>
            </ol>
          </div>
        )}
      </div> : null}

        </div>

        {/* Account is intentionally last in the mobile settings flow. */}
        <div className="hidden">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-700">
              <User className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-heading text-lg font-bold">Account</h2>
              <p className="text-xs text-ink-500">Signed-in owner account</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <span className="shrink-0 text-ink-500">Email</span>
              <span className="min-w-0 break-all font-medium sm:text-right">{user?.email ?? '—'}</span>
            </div>
            <button onClick={signOut} className="btn-danger mt-1 w-full">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange, disabled = false }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="break-words text-xs text-ink-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        aria-pressed={checked}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-yellow' : 'bg-ink-300'}`}
      >
        <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
