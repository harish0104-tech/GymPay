import type * as M from '../workflow/model';

const API_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const SESSION_KEY = 'gympay-saas-session-v1';
export const saasConfigured = Boolean(API_URL && PUBLISHABLE_KEY);

export interface SaasSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; phone?: string; email?: string; user_metadata?: Record<string, unknown> };
}

type Row = Record<string, any>;

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    const message = row.msg || row.message || row.error_description || row.error;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  if (!saasConfigured) throw new Error('Production authentication is not configured.');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token || PUBLISHABLE_KEY}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  if (!response.ok) throw new Error(errorMessage(data, `GymPay backend request failed (${response.status}).`));
  return data as T;
}

export function readSaasSession(): SaasSession | null {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as SaasSession | null;
    return session?.access_token && session?.refresh_token ? session : null;
  } catch { return null; }
}

export function writeSaasSession(session: SaasSession | null) {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

export async function refreshSaasSession(session: SaasSession): Promise<SaasSession> {
  if (session.expires_at && session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  const refreshed = await request<Omit<SaasSession, 'user'> & { user: SaasSession['user']; expires_in?: number }>('/auth/v1/token?grant_type=refresh_token', undefined, {
    method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const next = { ...refreshed, expires_at: refreshed.expires_at || Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600) };
  writeSaasSession(next);
  return next;
}

export async function requestPhoneOtp(phone: string, signup?: { fullName: string; gymName: string }) {
  await request('/auth/v1/otp', undefined, {
    method: 'POST',
    body: JSON.stringify({ phone, create_user: Boolean(signup), ...(signup ? { data: { full_name: signup.fullName, gym_name: signup.gymName } } : {}) }),
  });
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<SaasSession> {
  const response = await request<SaasSession & { expires_in?: number }>('/auth/v1/verify', undefined, {
    method: 'POST', body: JSON.stringify({ phone, token, type: 'sms' }),
  });
  const session = { ...response, expires_at: response.expires_at || Math.floor(Date.now() / 1000) + (response.expires_in || 3600) };
  writeSaasSession(session);
  return session;
}

export async function signOutSaas(session: SaasSession) {
  try { await request('/auth/v1/logout', session.access_token, { method: 'POST' }); }
  finally { writeSaasSession(null); }
}

async function rows<T extends Row = Row>(table: string, token: string, query = 'select=*'): Promise<T[]> {
  return request<T[]>(`/rest/v1/${table}?${query}`, token);
}

const dateValue = (value?: string | null) => value ? value.slice(0, 10) : '';
const timeValue = (value?: string | null) => value ? new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';

export async function loadGymState(session: SaasSession): Promise<{ state: M.State; accountId: string; session: SaasSession }> {
  const valid = await refreshSaasSession(session);
  const token = valid.access_token;
  const [profiles, gyms, memberRows, planRows, membershipRows, paymentRows, attendanceRows, expenseRows, reminderRows, settingRows, auditRows] = await Promise.all([
    rows('profiles', token), rows('gyms', token), rows('members', token), rows('membership_plans', token), rows('memberships', token),
    rows('payments', token), rows('attendance', token), rows('expenses', token), rows('reminders', token), rows('gym_settings', token), rows('audit_events', token),
  ]);
  const profile = profiles.find(item => item.id === valid.user.id);
  if (!profile?.active || !profile.gym_id || !['owner', 'staff'].includes(profile.role)) throw new Error('This GymPay account has no active gym workspace. Contact the gym owner.');
  const gym = gyms.find(item => item.id === profile.gym_id);
  if (!gym) throw new Error('Your gym workspace is unavailable. Contact GymPay support.');
  const members: M.Member[] = memberRows.map(item => ({ id:item.id,gymId:item.gym_id,name:item.name,mobile:item.phone,birthday:dateValue(item.birthday),code:item.code||'',email:item.email||'',emergency:item.emergency_contact||'',consent:Boolean(item.consent),active:item.active,created:item.created_at }));
  const settingsRow = settingRows.find(item => item.gym_id === gym.id);
  const settings: M.GymSettings[] = settingsRow ? [{gymId:gym.id,address:settingsRow.address||'',email:settingsRow.email||'',phone:settingsRow.phone||gym.phone||'',timezone:settingsRow.timezone||'Asia/Kolkata',currency:settingsRow.currency||'INR',receiptPrefix:settingsRow.receipt_prefix||'GP',workingHours:settingsRow.working_hours||'06:00–22:00',expiryWindow:settingsRow.expiry_window??7,reminderWindows:settingsRow.reminder_windows||[7,3,1,0,-3],attendanceTarget:settingsRow.attendance_target||50,discountLimit:Number(settingsRow.discount_limit??10)}] : [];
  const account: M.Account = {id:profile.id,name:profile.full_name||'Gym owner',mobile:profile.phone||valid.user.phone||'',role:profile.role,gymId:profile.gym_id,active:profile.active,permissions:profile.permissions||[]};
  const state: M.State = {
    accounts:profiles.map(item=>({id:item.id,name:item.full_name||'Gym user',mobile:item.phone||'',role:item.role,gymId:item.gym_id||'',active:item.active,permissions:item.permissions||[],memberId:item.member_id||undefined})),
    clients:[{id:gym.id,name:gym.name,owner:account.role==='owner'?account.name:'Gym owner',mobile:gym.phone||'',subscription:gym.status||'trial',expiry:dateValue(gym.trial_ends_at)||dateValue(gym.created_at),fee:0,paid:0,status:String(gym.status||'trial').toUpperCase() as M.SubscriptionStatus,trialEnd:dateValue(gym.trial_ends_at)}],
    plans:planRows.map(item=>({id:item.id,name:item.name,fee:Number(item.fee),months:item.duration_months,gymId:item.gym_id,description:item.description||'',active:item.active})),
    members,
    memberships:membershipRows.map(item=>({id:item.id,memberId:item.member_id,planId:item.plan_id||'',start:dateValue(item.start_date),expiry:dateValue(item.expiry_date),fee:Number(item.fee),created:item.created_at,renewal:item.renewal,discount:Number(item.discount||0),source:item.source||'',recordedBy:item.recorded_by||undefined})),
    payments:paymentRows.map(item=>({id:item.id,memberId:item.member_id,membershipId:item.membership_id,amount:Number(item.amount),date:dateValue(item.paid_on),method:item.method,status:item.status,reference:item.reference||'',recordedBy:item.recorded_by||undefined,created:item.created_at,receipt:item.receipt||'',source:item.source||'',reason:item.reason||''})),
    attendance:attendanceRows.map(item=>({id:item.id,memberId:item.member_id,date:dateValue(item.attended_on),in:timeValue(item.checked_in_at),out:item.checked_out_at?timeValue(item.checked_out_at):null,method:item.method})),
    expenses:expenseRows.map(item=>({id:item.id,gymId:item.gym_id,title:item.title,amount:Number(item.amount),date:dateValue(item.spent_on)})),
    reminders:reminderRows.map(item=>({id:item.id,memberId:item.member_id,kind:item.kind,date:dateValue(item.scheduled_on),membershipId:item.membership_id||undefined,window:item.window??undefined,status:item.status==='sent'?'queued':item.status,recipient:item.recipient||'',attempts:item.attempts||0,error:item.error||'',providerId:item.provider_id||''})),
    audit:auditRows.map(item=>({id:item.id,gymId:item.gym_id,actorId:item.actor_id||'',action:item.action,entityId:item.entity_id||'',at:item.created_at,reason:'',before:'null',after:JSON.stringify(item.details||{})})),
    settings, tickets:[], platform:{trialDays:14,graceDays:7,readOnlyDays:7,supportEmail:'support@gympay.example',messageQuota:1000},platformPayments:[],schemaVersion:4,
  };
  writeSaasSession(valid);
  return {state,accountId:account.id,session:valid};
}

function changedRows<T extends {id:string}>(before:T[], after:T[]) {
  const oldRows = new Map(before.map(item=>[item.id,JSON.stringify(item)]));
  return after.filter(item=>oldRows.get(item.id)!==JSON.stringify(item));
}
function deletedIds<T extends {id:string}>(before:T[], after:T[]) {
  const remaining = new Set(after.map(item=>item.id));
  return before.filter(item=>!remaining.has(item.id)).map(item=>item.id);
}

async function applyGymChanges(before:M.State, after:M.State, session:SaasSession, account:M.Account):Promise<M.State> {
  const valid = await refreshSaasSession(session);
  const token = valid.access_token;
  const gymId = account.gymId;
  const upserts:[string,Row[]][] = [
    ['members',changedRows(before.members,after.members).map(item=>({id:item.id,gym_id:gymId,name:item.name,phone:item.mobile,birthday:item.birthday||null,code:item.code||null,email:item.email||null,emergency_contact:item.emergency||'',consent:Boolean(item.consent),active:item.active!==false,created_at:item.created||new Date().toISOString()}))],
    ['membership_plans',changedRows(before.plans,after.plans).filter(item=>item.gymId===gymId).map(item=>({id:item.id,gym_id:gymId,name:item.name,fee:item.fee,duration_months:item.months,description:item.description||'',active:item.active!==false,created_at:new Date().toISOString()}))],
    ['memberships',changedRows(before.memberships,after.memberships).map(item=>({id:item.id,gym_id:gymId,member_id:item.memberId,plan_id:item.planId||null,start_date:item.start,expiry_date:item.expiry,fee:item.fee,renewal:item.renewal,discount:item.discount||0,source:item.source||'',recorded_by:item.recordedBy||account.id,created_at:item.created||new Date().toISOString()}))],
    ['payments',changedRows(before.payments,after.payments).map(item=>({id:item.id,gym_id:gymId,member_id:item.memberId,membership_id:item.membershipId,amount:item.amount,paid_on:item.date,method:item.method,status:item.status||'successful',reference:item.reference||'',receipt:item.receipt||'',recorded_by:item.recordedBy||account.id,source:item.source||'',reason:item.reason||'',created_at:item.created||new Date().toISOString()}))],
    ['attendance',changedRows(before.attendance,after.attendance).map(item=>({id:item.id,gym_id:gymId,member_id:item.memberId,attended_on:item.date,checked_in_at:new Date(`${item.date}T${item.in||'06:00'}:00`).toISOString(),checked_out_at:item.out?new Date(`${item.date}T${item.out}:00`).toISOString():null,method:item.method||'Manual'}))],
    ['expenses',changedRows(before.expenses,after.expenses).filter(item=>item.gymId===gymId).map(item=>({id:item.id,gym_id:gymId,title:item.title,amount:item.amount,spent_on:item.date,recorded_by:account.id,created_at:new Date().toISOString()}))],
    ['reminders',changedRows(before.reminders,after.reminders).map(item=>({id:item.id,gym_id:gymId,member_id:item.memberId,kind:item.kind,scheduled_on:item.date,membership_id:item.membershipId||null,window:item.window??null,status:item.status==='queued'?'queued':item.status||'queued',recipient:item.recipient||'',attempts:item.attempts||0,error:item.error||'',provider_id:item.providerId||'',created_at:new Date().toISOString()}))],
    ['audit_events',changedRows(before.audit,after.audit).map(item=>({id:item.id,gym_id:gymId,actor_id:account.id,action:item.action,entity_id:item.entityId||null,details:{reason:item.reason,before:item.before,after:item.after,at:item.at},created_at:item.at||new Date().toISOString()}))],
  ];
  if (JSON.stringify(before.settings)!==JSON.stringify(after.settings)) {
    const setting=after.settings.find(item=>item.gymId===gymId);
    if (setting) upserts.push(['gym_settings',[{gym_id:gymId,address:setting.address,email:setting.email,phone:setting.phone,timezone:setting.timezone,currency:setting.currency,receipt_prefix:setting.receiptPrefix,working_hours:setting.workingHours,expiry_window:setting.expiryWindow,attendance_target:setting.attendanceTarget,reminder_windows:setting.reminderWindows,discount_limit:setting.discountLimit,updated_at:new Date().toISOString()}]]);
  }
  const deletions:[string,string[]][]=[
    ['payments',deletedIds(before.payments,after.payments)],['attendance',deletedIds(before.attendance,after.attendance)],['reminders',deletedIds(before.reminders,after.reminders)],
    ['memberships',deletedIds(before.memberships,after.memberships)],['members',deletedIds(before.members,after.members)],['membership_plans',deletedIds(before.plans,after.plans)],['expenses',deletedIds(before.expenses,after.expenses)],
  ];
  const upsertPayload=Object.fromEntries(upserts);
  const deletionPayload=Object.fromEntries(deletions);
  const gymBefore=before.clients.find(item=>item.id===gymId);const gymAfter=after.clients.find(item=>item.id===gymId);
  const gymUpdate=gymAfter&&gymBefore&&(gymAfter.name!==gymBefore.name||gymAfter.mobile!==gymBefore.mobile)?{name:gymAfter.name,phone:gymAfter.mobile}:null;
  await request('/rest/v1/rpc/apply_gympay_changes',token,{method:'POST',body:JSON.stringify({p_upserts:upsertPayload,p_deletions:deletionPayload,p_gym_update:gymUpdate})});

  let normalized = after;
  const oldAccounts=new Map(before.accounts.map(item=>[item.id,JSON.stringify(item)]));
  const changedStaff=after.accounts.filter(item=>item.role==='staff'&&oldAccounts.get(item.id)!==JSON.stringify(item));
  for (const staff of changedStaff) {
    const result=await request<{id:string}>(`/functions/v1/invite-staff`,token,{method:'POST',body:JSON.stringify({... (oldAccounts.has(staff.id)?{id:staff.id}:{}),full_name:staff.name,phone:staff.mobile.startsWith('+')?staff.mobile:`+91${M.normalizeMobile(staff.mobile)}`,permissions:staff.permissions||[],active:staff.active})});
    if(result.id!==staff.id) normalized={...normalized,accounts:normalized.accounts.map(item=>item.id===staff.id?{...item,id:result.id}:item)};
  }
  writeSaasSession(valid);
  return normalized;
}

let writeQueue: Promise<unknown> = Promise.resolve();
export function syncGymChanges(before:M.State, after:M.State, session:SaasSession, account:M.Account):Promise<M.State> {
  const pending=writeQueue.then(()=>applyGymChanges(before,after,session,account));
  writeQueue=pending.catch(()=>undefined);
  return pending;
}
