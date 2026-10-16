import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders(request: Request) {
  const allowedOrigin = Deno.env.get('GYMPAY_APP_ORIGIN');
  const origin = request.headers.get('Origin');
  return {
    ...(allowedOrigin && origin === allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(request, { error: 'Sign in as a gym owner first.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) return json(request, { error: 'Staff invitations are not configured.' }, 503);

  const requester = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await requester.auth.getUser();
  if (authError || !user) return json(request, { error: 'Your session has expired. Sign in again.' }, 401);

  const { data: profile, error: profileError } = await requester
    .from('profiles')
    .select('gym_id, role, active')
    .eq('id', user.id)
    .single();
  if (profileError || !profile?.active || profile.role !== 'owner' || !profile.gym_id) {
    return json(request, { error: 'Only an active gym owner can invite staff.' }, 403);
  }

  let payload: { id?: unknown; full_name?: unknown; phone?: unknown; permissions?: unknown; active?: unknown };
  try { payload = await request.json(); } catch { return json(request, { error: 'Invalid request body.' }, 400); }
  const fullName = typeof payload.full_name === 'string' ? payload.full_name.trim() : '';
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  const allowedPermissions = ['payments', 'view_members', 'add_members', 'edit_members', 'attendance', 'renewals', 'reminders', 'bulk_reminders'];
  const permissions = Array.isArray(payload.permissions)
    ? [...new Set(payload.permissions.filter((value): value is string => typeof value === 'string' && allowedPermissions.includes(value)))]
    : ['payments'];
  if (fullName.length < 2 || fullName.length > 120) return json(request, { error: 'Enter a staff name between 2 and 120 characters.' }, 400);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return json(request, { error: 'Enter the mobile number in international format, such as +919999999999.' }, 400);
  const active = payload.active !== false;

  const staffQuery = requester.from('profiles').select('id, role, gym_id').eq('phone', phone).eq('gym_id', profile.gym_id).maybeSingle();
  const { data: existing, error: lookupError } = await staffQuery;
  if (lookupError) return json(request, { error: 'Could not verify the staff account.' }, 500);
  if (existing && (existing.role !== 'staff' || (typeof payload.id === 'string' && payload.id !== existing.id))) {
    return json(request, { error: 'That mobile number is already assigned to another account.' }, 409);
  }

  if (existing) {
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: { role: 'staff', gym_id: profile.gym_id, permissions },
      user_metadata: { full_name: fullName },
    });
    if (authUpdateError) return json(request, { error: authUpdateError.message }, 400);
    const { error: profileUpdateError } = await admin.from('profiles').update({ full_name: fullName, permissions, active }).eq('id', existing.id).eq('gym_id', profile.gym_id);
    if (profileUpdateError) return json(request, { error: 'Could not save staff access settings.' }, 500);
    return json(request, { id: existing.id, full_name: fullName, phone, role: 'staff', permissions, active });
  }
  if (typeof payload.id === 'string') return json(request, { error: 'Staff account not found. Refresh the staff list and retry.' }, 404);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    phone,
    phone_confirm: false,
    user_metadata: { full_name: fullName },
    app_metadata: { role: 'staff', gym_id: profile.gym_id, permissions },
  });
  if (createError || !created.user) {
    return json(request, { error: createError?.message || 'Could not create the staff account.' }, 409);
  }
  if (!active) await admin.from('profiles').update({ active: false }).eq('id', created.user.id).eq('gym_id', profile.gym_id);
  return json(request, { id: created.user.id, full_name: fullName, phone, role: 'staff', permissions, active }, 201);
});
