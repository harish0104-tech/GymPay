export type Role = 'super_admin' | 'owner' | 'staff' | 'member';
export interface Account {
    id: string;
    name: string;
    mobile: string;
    role: Role;
    gymId: string;
    memberId?: string;
    active: boolean;
    permissions?: Permission[];
    lastLogin?: string;
}
export interface Client {
    id: string;
    name: string;
    owner: string;
    mobile: string;
    subscription: string;
    expiry: string;
    fee: number;
    paid: number;
    status?: SubscriptionStatus;
    city?: string; email?: string; created?: string; lastActivity?: string;
    interval?: 'monthly' | 'yearly'; trialEnd?: string; gatewayReference?: string;
    memberLimit?: number; reason?: string;
}
export interface Plan {
    id: string;
    name: string;
    fee: number;
    months: number;
    gymId: string;
    description?: string; benefits?: string; active?: boolean;
}
export interface Member {
    id: string;
    gymId: string;
    name: string;
    mobile: string;
    birthday: string;
    code?: string; email?: string; emergency?: string; active?: boolean; consent?: boolean; created?: string;
}
export interface Membership {
    id: string;
    memberId: string;
    planId: string;
    start: string;
    expiry: string;
    fee: number;
    created: string;
    renewal: boolean;
    recordedBy?: string; discount?: number; source?: string;
}
export interface Payment {
    id: string;
    memberId: string;
    membershipId: string;
    amount: number;
    date: string;
    method: string;
    status?: PaymentStatus; reference?: string; recordedBy?: string; created?: string;
    receipt?: string; changedAt?: string; reason?: string; source?: string; requestKey?: string;
}
export interface Attendance {
    id: string;
    memberId: string;
    date: string;
    in: string;
    out: string | null;
    method?: string; recordedBy?: string; source?: string;
}
export interface Expense {
    id: string;
    gymId: string;
    title: string;
    amount: number;
    date: string;
}
export interface Reminder {
    id: string;
    memberId: string;
    kind: string;
    date: string;
    membershipId?: string; window?: number; status?: 'queued' | 'failed' | 'cancelled';
    recipient?: string; attempts?: number; error?: string; providerId?: string; recordedBy?: string;
}
export type Permission = 'payments' | 'view_members' | 'add_members' | 'edit_members' | 'attendance' | 'renewals' | 'reminders' | 'bulk_reminders';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'READ_ONLY' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'refunded' | 'voided' | 'cancelled';
export interface Audit { id:string; gymId:string; actorId:string; action:string; entityId:string; at:string; reason:string; before:string; after:string; }
export interface GymSettings { gymId:string; address:string; email:string; phone:string; timezone:string; currency:string; receiptPrefix:string; workingHours:string; expiryWindow:number; reminderWindows:number[]; attendanceTarget:number; discountLimit:number; }
export interface Ticket { id:string; gymId:string; accountId:string; subject:string; description:string; priority:string; status:'Open'|'In progress'|'Resolved'; created:string; resolution:string; }
export interface PlatformSettings { trialDays:number; graceDays:number; readOnlyDays:number; supportEmail:string; messageQuota:number; }
export interface PlatformPayment { id:string; gymId:string; plan:string; amount:number; tax:number; discount:number; date:string; reference:string; status:PaymentStatus; }
export interface State {
    accounts: Account[];
    clients: Client[];
    plans: Plan[];
    members: Member[];
    memberships: Membership[];
    payments: Payment[];
    attendance: Attendance[];
    expenses: Expense[];
    reminders: Reminder[];
    audit:Audit[]; settings:GymSettings[]; tickets:Ticket[]; platform:PlatformSettings; platformPayments:PlatformPayment[]; schemaVersion:number;
}
export const STORE_KEY = 'gympay-workflow-v2';
export const SESSION_KEY = 'gympay-demo-account';
export function id() { if (typeof crypto.randomUUID === 'function')
    return crypto.randomUUID(); return Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join(''); }
export const DEMO_OTP = '123456';
export const roleNames: Record<Role, string> = { super_admin: 'Super Admin', owner: 'Gym Owner', staff: 'Gym Staff', member: 'Member' };
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function days(date: string, reference = today()) { return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(reference + 'T00:00:00Z')) / 86400000); }
export function expiry(start: string, months: number) {
    const [y, m, d] = start.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    target.setUTCDate(target.getUTCDate() - 1);
    return target.toISOString().slice(0, 10);
}
export function shift(date: string, amount: number) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); }
export function money(value: number) { return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value); }
export function dateLabel(value: string) { return new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
export function normalizeMobile(value: string) { return value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''); }
export function latest(state: State, memberId: string) { return state.memberships.filter(m => m.memberId === memberId).reverse().sort((a, b) => b.start.localeCompare(a.start) || b.created.localeCompare(a.created))[0]; }
export function currentMembership(state: State, memberId: string) { return state.memberships.filter(m => m.memberId === memberId && m.start <= todayFor(state,state.members.find(x=>x.id===memberId)?.gymId||'') && m.expiry >= todayFor(state,state.members.find(x=>x.id===memberId)?.gymId||'')).sort((a, b) => b.start.localeCompare(a.start))[0] || latest(state, memberId); }
export function received(state: State, membershipId: string) { return state.payments.filter(p => p.membershipId === membershipId && (!p.status || p.status === 'successful')).reduce((s, p) => s + p.amount, 0); }
export function balance(state: State, membership: Membership) { return Math.max(0, membership.fee - received(state, membership.id)); }
export function requireRole(account: Account, roles: Role[]) { if (!account.active || !roles.includes(account.role))
    throw new Error('This action is unavailable for this demo role.'); }
function seed(): State {
    const t = today();
    const gymId = 'local-gym';
    const members: Member[] = ['Arun Kumar', 'Karthik', 'Suresh'].map((name, i) => ({ id: 'demo-member-' + i, gymId, name, mobile: '900000000' + i, birthday: i === 0 ? t.slice(0, 4) + '-10-04' : '' }));
    const memberships: Membership[] = members.map((m, i) => ({ id: 'demo-membership-' + i, memberId: m.id, planId: 'monthly', start: shift(t, -29), expiry: shift(t, [0, 5, 12][i]), fee: [1500, 1200, 1500][i], created: new Date(Date.now() + i).toISOString(), renewal: false }));
    let state: State = { accounts: [{ id: 'super', name: 'Platform Admin', mobile: '9999999999', role: 'super_admin', gymId: '', active: true }, { id: 'owner', name: 'Gym Owner', mobile: '9999999998', role: 'owner', gymId, active: true }, { id: 'staff', name: 'Reception Staff', mobile: '9999999997', role: 'staff', gymId, active: true }, ...members.map(m => ({ id: 'account-' + m.id, name: m.name, mobile: m.mobile, role: 'member' as const, gymId, memberId: m.id, active: true }))], clients: [{ id: gymId, name: 'Gym Pay Fitness', owner: 'Gym Owner', mobile: '9999999998', subscription: 'Professional · Monthly', expiry: shift(t, 20), fee: 2500, paid: 2500 }, { id: 'demo-gym-2', name: 'Iron House', owner: 'Priya', mobile: '9888888888', subscription: 'Starter · Monthly', expiry: shift(t, 4), fee: 1500, paid: 750 }], plans: [{ id: 'monthly', name: 'Monthly', fee: 1500, months: 1, gymId }, { id: 'quarterly', name: 'Quarterly', fee: 4000, months: 3, gymId }, { id: 'annual', name: 'Annual', fee: 14000, months: 12, gymId }], members, memberships, payments: [{ id: 'demo-payment', memberId: members[2].id, membershipId: memberships[2].id, amount: 1500, date: t, method: 'Cash' }], attendance: [], expenses: [], reminders: [], audit:[], settings:[], tickets:[], platform:{trialDays:14,graceDays:7,readOnlyDays:7,supportEmail:'support@gympay.example',messageQuota:1000},platformPayments:[],schemaVersion:3 };
    // Preserve the earlier frontend demo's member and payment records on first use.
    try {
        const previous = JSON.parse(localStorage.getItem('gympay-frontend-v1') || 'null');
        if (previous?.members?.length && previous?.plans?.length) {
            state.plans = previous.plans.map((p: {
                id: string;
                name: string;
                price: number;
                duration_value: number;
                duration_unit: string;
            }) => ({ id: p.id, name: p.name, fee: Number(p.price), months: p.duration_unit === 'years' ? p.duration_value * 12 : p.duration_unit === 'months' ? p.duration_value : 1, gymId }));
            state.members = previous.members.map((m: {
                id: string;
                name: string;
                phone: string;
            }) => ({ id: m.id, gymId, name: m.name, mobile: normalizeMobile(m.phone), birthday: '' }));
            state.memberships = (previous.memberships ?? []).map((m: {
                id: string;
                member_id: string;
                plan_id: string;
                start_date: string;
                expiry_date: string;
                created_at: string;
            }) => ({ id: m.id, memberId: m.member_id, planId: m.plan_id, start: m.start_date, expiry: m.expiry_date, fee: state.plans.find(p => p.id === m.plan_id)?.fee ?? 0, created: m.created_at, renewal: false }));
            state.payments = (previous.payments ?? []).filter((p: {
                status: string;
            }) => p.status === 'paid').map((p: {
                id: string;
                member_id: string;
                membership_id: string;
                amount: number;
                payment_date: string;
                payment_method: string;
            }) => ({ id: p.id, memberId: p.member_id, membershipId: p.membership_id, amount: Number(p.amount), date: p.payment_date, method: p.payment_method || 'Cash' }));
            state.accounts = state.accounts.filter(a => a.role !== 'member').concat(state.members.map(m => ({ id: 'account-' + m.id, name: m.name, mobile: m.mobile, role: 'member' as const, gymId, memberId: m.id, active: true })));
        }
    }
    catch { /* Fresh demo if previous data cannot be migrated. */ }
    return state;
}
export function loadState(): State { const saved = localStorage.getItem(STORE_KEY); if (saved)
    return upgradeState(JSON.parse(saved) as State); const state = upgradeState(seed()); localStorage.setItem(STORE_KEY, JSON.stringify(state)); return state; }
export function persist(state: State) { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
export function addMember(state: State, account: Account, input: {
    name: string;
    mobile: string;
    birthday: string;
    planId: string;
    fee: number;
    start: string;
    expiry: string;
    payment: string;
    amount: number;
}) {
    authorize(state, account, 'add_members');
    const mobile = normalizeMobile(input.mobile);
    const plan = state.plans.find(p => p.id === input.planId && p.gymId === account.gymId);
    if (account.role === 'staff' && plan && (input.fee !== plan.fee || input.expiry !== expiry(input.start,plan.months))) throw new Error('Staff must use the configured plan fee and dates.');
    if (!input.name.trim() || !/^\d{10}$/.test(mobile) || !plan)
        throw new Error('Enter a name, a valid 10-digit mobile and a plan.');
    if (state.accounts.some(a => a.mobile === mobile))
        throw new Error('This mobile already has a demo account.');
    if (!Number.isFinite(input.fee) || input.fee < 0 || !Number.isFinite(input.amount) || input.amount < 0 || input.amount > input.fee)
        throw new Error('Enter valid fee and received amounts. Received cannot exceed the fee.');
    if (input.birthday && input.birthday > today())
        throw new Error('Birthday cannot be in the future.');
    if (!input.start || !input.expiry || input.expiry < input.start)
        throw new Error('Expiry must be on or after the start date.');
    if (input.payment === 'paid' && input.amount !== input.fee || input.payment === 'pending' && input.amount !== 0 || input.payment === 'partial' && !(input.amount > 0 && input.amount < input.fee))
        throw new Error('Received amount must match Paid, Pending or Partial.');
    const member: Member = { id: id(), gymId: account.gymId, name: input.name.trim(), mobile, birthday: input.birthday,code: 'GP-'+String(state.members.filter(m=>m.gymId===account.gymId).length+1).padStart(5,'0'),active:true,consent:false,created:new Date().toISOString() };
    const membership: Membership = { id: id(), memberId: member.id, planId: plan.id, start: input.start, expiry: input.expiry, fee: input.fee, created: new Date().toISOString(), renewal: false };
    state.members.push(member);
    state.memberships.push(membership);
    state.accounts.push({ id: id(), name: member.name, mobile, role: 'member', gymId: account.gymId, memberId: member.id, active: true });
    if (input.amount > 0)
        state.payments.push({ id: id(), memberId: member.id, membershipId: membership.id, amount: input.amount, date: todayFor(state,account.gymId), method: 'Cash',status:'successful',recordedBy:account.id,created:new Date().toISOString(),receipt:'GP-'+id().slice(0,8).toUpperCase(),source:'Manually recorded' });
    audit(state,account,'MEMBER_CREATED',member.id,null,member);
    if(input.amount>0) audit(state,account,'PAYMENT_RECORDED',state.payments[state.payments.length-1].id,null,state.payments[state.payments.length-1]);
    return member.id;
}
export function recordPayment(state: State, account: Account, membershipId: string, amount: number, method: string, details: {date?:string;reference?:string;requestKey?:string} = {}) {
    authorize(state,account,'payments');
    const membership = state.memberships.find(m => m.id === membershipId);
    const member = state.members.find(m => m.id === membership?.memberId);
    if (!membership || !member || member.gymId !== account.gymId || account.role === 'member' && member.id !== account.memberId) throw new Error('Member is unavailable for this account.');
    if(details.requestKey) { const existing=state.payments.find(p=>p.requestKey===details.requestKey&&p.memberId===member.id);if(existing)return existing.id; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance(state, membership)) throw new Error('Payment must be positive and cannot exceed the outstanding fee.');
    const date=details.date||todayFor(state,account.gymId); if(date>todayFor(state,account.gymId))throw new Error('Payment date cannot be in the future.');
    if(account.role==='member') return createDemoOrder(state,account,membershipId,amount);
    const payment:Payment={id:id(), memberId:member.id,membershipId,amount:Math.round(amount*100)/100,date,method,status:'successful',reference:details.reference||'',recordedBy:account.id,created:new Date().toISOString(),receipt:settingsFor(state,account.gymId).receiptPrefix+'-'+id().slice(0,8).toUpperCase(),source:'Manually recorded',requestKey:details.requestKey};
    state.payments.push(payment);audit(state,account,'PAYMENT_RECORDED',payment.id,null,payment);return payment.id;
}
export function punch(state: State, account: Account, memberId: string) {
    authorize(state,account,'attendance');
    const member = state.members.find(m => m.id === memberId);
    const membership = currentMembership(state, memberId);
    if (!member || member.gymId !== account.gymId || account.role === 'member' && member.id !== account.memberId)
        throw new Error('Member is unavailable for this account.');
    if (member.active === false || !membership || membership.start > todayFor(state,account.gymId) || days(membership.expiry,todayFor(state,account.gymId)) < 0)
        throw new Error('An active membership is required to punch attendance.');
    const previous = state.attendance.find(a => a.memberId === memberId && a.date === todayFor(state,account.gymId));
    if (previous?.out)
        throw new Error('Attendance is already completed for today.');
    if (previous)
        previous.out = new Date().toISOString();
    else
        state.attendance.push({ id: id(), memberId, date: todayFor(state,account.gymId), in: new Date().toISOString(), out: null,method:'Manual demo',recordedBy:account.id,source:'Shared frontend' });
    audit(state,account,previous?'ATTENDANCE_CHECK_OUT':'ATTENDANCE_CHECK_IN',memberId,null,state.attendance.find(a=>a.memberId===memberId&&a.date===todayFor(state,account.gymId)));
}
export function extend(state: State, account: Account, memberId: string, planId: string, start: string) {
    authorize(state,account,'renewals');
    const member = state.members.find(m => m.id === memberId);
    const plan = state.plans.find(p => p.id === planId && p.gymId === account.gymId);
    const previous = latest(state, memberId);
    if (!member || member.gymId !== account.gymId || !plan || !start)
        throw new Error('Choose a valid member, plan and start date.');
    if (previous && start <= previous.expiry)
        throw new Error('Renewal must begin after the current membership expires.');
    if(plan.active===false)throw new Error('This plan is inactive.');
    state.memberships.push({ id: id(), memberId, planId, start, expiry: expiry(start, plan.months), fee: plan.fee, created: new Date().toISOString(), renewal: true,recordedBy:account.id,source:'Manual renewal' });
    audit(state,account,'MEMBERSHIP_RENEWED',state.memberships[state.memberships.length-1].id,previous,state.memberships[state.memberships.length-1]);
}
export const menus: Record<Role,string[]>={super_admin:['Overview','Gyms','Users','Subscriptions','Payments / Revenue','WhatsApp','Reports','Support','System Settings','Audit Logs'],owner:['Dashboard','Members','Membership plans','Payments','Pending dues','Attendance','Renewals','WhatsApp','Reports','Expenses','Staff','Gym Settings','Billing / Help','Notifications','Audit Logs'],staff:['Dashboard','Payments','Pending dues'],member:['Home','Membership','Pay Fees','Payment history / Receipts','Attendance / QR','Profile','Notifications','Support']};
export function menusFor(account:Account) { if(account.role!=='staff')return menus[account.role]; return ['Dashboard',...(can(account,'payments')?['Payments','Pending dues']:[]),'Profile','Billing / Help','Notifications',...(can(account,'view_members')||can(account,'add_members')?['Members']:[]),...(can(account,'attendance')?['Attendance']:[]),...(can(account,'renewals')?['Renewals']:[]),...(can(account,'reminders')?['WhatsApp']:[])]; }
export function visibleMembers(state: State, account: Account) { if(account.role==='super_admin'||!account.active)return []; return state.members.filter(m => m.gymId === account.gymId && (account.role !== 'member' || m.id === account.memberId)); }
export function dues(state: State, account: Account) { const ids = new Set(visibleMembers(state, account).map(m => m.id)); return state.memberships.filter(m => ids.has(m.memberId) && balance(state, m) > 0); }

export function absentMemberships(state: State, account: Account) {
  return visibleMembers(state, account).map(member => currentMembership(state, member.id)).filter((membership): membership is Membership => !!membership && membership.start <= today() && days(membership.expiry) >= 0 && -days(membership.start) >= 7 && !state.attendance.some(a => a.memberId === membership.memberId && -days(a.date) >= 0 && -days(a.date) < 7));
}

export function settingsFor(state:State,gymId:string):GymSettings { return state.settings.find(s=>s.gymId===gymId)||{gymId,address:'',email:'',phone:state.clients.find(c=>c.id===gymId)?.mobile||'',timezone:'Asia/Kolkata',currency:'INR',receiptPrefix:'GP',workingHours:'06:00–22:00',expiryWindow:7,reminderWindows:[7,3,1,0,-3],attendanceTarget:50,discountLimit:10}; }
export function todayFor(state:State,gymId:string,instant=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:settingsFor(state,gymId).timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(instant);}
export function memberStatus(state:State,member:Member) { if(member.active===false)return 'Inactive';const m=currentMembership(state,member.id);const t=todayFor(state,member.gymId);return !m?'No membership':m.expiry<t?'Expired':m.start>t?'Upcoming':days(m.expiry,t)<=settingsFor(state,member.gymId).expiryWindow?'Expiring':'Active'; }
export function can(account:Account,permission:Permission) {return account.active&&(account.role==='owner'||account.role==='staff'&&(account.permissions||['payments']).includes(permission)||account.role==='member'&&['payments','attendance'].includes(permission));}
export function subscriptionStatus(state:State,gymId:string):SubscriptionStatus {
 const gym=state.clients.find(c=>c.id===gymId);if(!gym)return 'SUSPENDED';const status=gym.status||'ACTIVE';
 if(['SUSPENDED','CANCELLED','READ_ONLY','EXPIRED'].includes(status))return status;
 const t=todayFor(state,gymId);if(status==='TRIAL')return (gym.trialEnd||gym.expiry)<t?'EXPIRED':'TRIAL';
 const late=-days(gym.expiry,t);if(late<=0)return status;
 if(late<=state.platform.graceDays)return 'GRACE_PERIOD';if(late<=state.platform.graceDays+state.platform.readOnlyDays)return 'READ_ONLY';return 'SUSPENDED';
}
export function authorize(state:State,account:Account,permission:Permission|'owner'|'platform',write=true) {
 const actual=state.accounts.find(a=>a.id===account.id);
 if(!actual?.active||actual.role!==account.role||actual.gymId!==account.gymId||actual.memberId!==account.memberId)throw new Error('This demo account is unavailable.');
 if(permission==='platform'){if(actual.role!=='super_admin')throw new Error('Platform access is unavailable.');return;}
 if(actual.role==='super_admin'||permission==='owner'&&actual.role!=='owner'||permission!=='owner'&&!can(actual,permission))throw new Error('This action is unavailable for this demo role.');
 const status=subscriptionStatus(state,actual.gymId);
 if(['SUSPENDED','CANCELLED','EXPIRED'].includes(status)&&actual.role!=='member')throw new Error('Gym subscription access is suspended. Contact GymPay support.');
 if(write&&status==='READ_ONLY')throw new Error('Gym is in read-only mode. Changes are disabled until billing is resolved.');
}
export function audit(state:State,account:Account,action:string,entityId:string,before:unknown,after:unknown,reason='') {
 state.audit.push({id:id(),gymId:account.role==='super_admin'?(after as {gymId?:string;id?:string})?.gymId||state.clients.find(c=>c.id===entityId)?.id||'':account.gymId,actorId:account.id,action,entityId,at:new Date().toISOString(),reason,before:JSON.stringify(before??null),after:JSON.stringify(after??null)});
}
export function upgradeState(state:State):State {
 state.audit??=[];state.settings??=[];state.tickets??=[];state.platform??={trialDays:14,graceDays:7,readOnlyDays:7,supportEmail:'support@gympay.example',messageQuota:1000};
 state.platformPayments??=state.clients.filter(c=>c.paid>0).map(c=>({id:'platform-'+c.id,gymId:c.id,plan:c.subscription,amount:c.paid,tax:0,discount:0,date:today(),reference:'DEMO-'+c.id,status:'successful'}));
 for(const [i,c] of state.clients.entries()){c.status??='ACTIVE';c.city??=i?'Bengaluru':'Chennai';c.email??='';c.created??=shift(today(),-60);c.lastActivity??=new Date().toISOString();c.memberLimit??=500;c.interval??='monthly';c.gatewayReference??='Not connected';if(!state.settings.some(s=>s.gymId===c.id))state.settings.push(settingsFor(state,c.id));}
 for(const [i,m] of state.members.entries()){m.code??='GP-'+String(i+1).padStart(5,'0');m.active??=true;m.consent??=false;m.email??='';m.emergency??='';m.created??=state.memberships.find(p=>p.memberId===m.id)?.created||new Date().toISOString();}
 for(const p of state.payments){p.status??='successful';p.recordedBy??=state.accounts.find(a=>a.role==='owner'&&a.gymId===state.members.find(m=>m.id===p.memberId)?.gymId)?.id||'owner';p.created??=p.date+'T12:00:00Z';p.receipt??='GP-'+p.id.slice(0,8).toUpperCase();p.reference??='';p.source??='Migrated manual record';}
 for(const p of state.plans)p.active??=true;
 for(const r of state.reminders){r.status??='queued';r.attempts??=0;r.recipient??=state.members.find(m=>m.id===r.memberId)?.mobile||'';}
 state.schemaVersion=3;return state;
}
export function editMember(state:State,account:Account,memberId:string,change:{name:string;email:string;emergency:string;birthday:string;consent:boolean},reason='Profile correction') {
 const member=visibleMembers(state,account).find(m=>m.id===memberId);if(!member)throw new Error('Member unavailable.');
 if(account.role==='member'){if(member.id!==account.memberId)throw new Error('Member unavailable.');authorize(state,account,'payments');}else authorize(state,account,'edit_members');
 if(!change.name.trim())throw new Error('Name is required.');if(change.birthday&&change.birthday>todayFor(state,account.gymId))throw new Error('Birthday cannot be in the future.');
 const before={...member};Object.assign(member,change,{name:change.name.trim()});const user=state.accounts.find(a=>a.memberId===member.id);if(user)user.name=member.name;audit(state,account,'MEMBER_UPDATED',member.id,before,member,reason);
}
export function deactivateMember(state:State,account:Account,memberId:string,reason:string) {
 authorize(state,account,'owner');if(!reason.trim())throw new Error('A reason is required.');const member=visibleMembers(state,account).find(m=>m.id===memberId);if(!member)throw new Error('Member unavailable.');const before={...member};member.active=member.active===false; audit(state,account,'MEMBER_STATUS_CHANGED',member.id,before,member,reason);
}
export function correctPayment(state:State,account:Account,paymentId:string,action:'refunded'|'voided',reason:string) {
 authorize(state,account,'owner');if(!reason.trim())throw new Error('A reason is required.');const p=state.payments.find(p=>p.id===paymentId);if(!p||state.members.find(m=>m.id===p.memberId)?.gymId!==account.gymId)throw new Error('Payment unavailable.');if(p.status!=='successful')throw new Error('Only a successful payment can be refunded or voided.');const before={...p};p.status=action;p.reason=reason;p.changedAt=new Date().toISOString();audit(state,account,'PAYMENT_'+action.toUpperCase(),p.id,before,p,reason);
}
export function createDemoOrder(state:State,account:Account,membershipId:string,amount:number) {
 authorize(state,account,'payments');const m=state.memberships.find(m=>m.id===membershipId);if(!m||!visibleMembers(state,account).some(member=>member.id===m.memberId))throw new Error('Membership unavailable.');
 if(state.payments.some(p=>p.membershipId===membershipId&&p.status==='pending'))throw new Error('A payment is already pending. Resolve it before trying again.');
 if(amount<=0||!Number.isFinite(amount)||amount>balance(state,m))throw new Error('Invalid payment amount.');
 const p:Payment={id:id(),memberId:m.memberId,membershipId,amount,date:todayFor(state,account.gymId),method:'Demo online',status:'pending',recordedBy:account.id,created:new Date().toISOString(),source:'Demo order - unverified',reference:'DEMO-'+id().slice(0,8)};state.payments.push(p);audit(state,account,'DEMO_ORDER_CREATED',p.id,null,p);return p.id;
}
export function resolveDemoOrder(state:State,account:Account,paymentId:string,outcome:'successful'|'failed'|'cancelled') {
 authorize(state,account,'payments');const p=state.payments.find(p=>p.id===paymentId);if(!p||!visibleMembers(state,account).some(m=>m.id===p.memberId))throw new Error('Payment unavailable.');if(p.status!=='pending')return;
 const m=state.memberships.find(m=>m.id===p.membershipId)!;if(outcome==='successful'&&p.amount>balance(state,m))throw new Error('Balance has changed. Cancel this order and retry.');
 const before={...p};p.status=outcome;p.source='Simulated backend outcome - no real transfer';p.changedAt=new Date().toISOString();if(outcome==='successful')p.receipt=settingsFor(state,account.gymId).receiptPrefix+'-'+id().slice(0,8).toUpperCase();audit(state,account,'DEMO_ORDER_'+outcome.toUpperCase(),p.id,before,p,'Explicit frontend simulation');
}
export function collectionSummary(payments:Payment[],from:string,to:string) {
 const inRange=(d:string)=>d>=from&&d<=to;
 const gross=payments.filter(p=>['successful','refunded'].includes(p.status||'successful')&&inRange(p.date)).reduce((s,p)=>s+p.amount,0);
 const refunds=payments.filter(p=>p.status==='refunded'&&inRange((p.changedAt||p.date).slice(0,10))).reduce((s,p)=>s+p.amount,0);
 return {gross,refunds,net:gross-refunds,failed:payments.filter(p=>p.status==='failed'&&inRange(p.date)).length,pending:payments.filter(p=>p.status==='pending'&&inRange(p.date)).length};
}
export function updateSubscription(state:State,account:Account,gymId:string,patch:Partial<Client>,reason:string) {
 authorize(state,account,'platform');if(!reason.trim())throw new Error('A reason is required for subscription changes.');const gym=state.clients.find(c=>c.id===gymId);if(!gym)throw new Error('Gym unavailable.');const before={...gym};
 if(patch.fee!==undefined&&(!Number.isFinite(patch.fee)||patch.fee<0))throw new Error('Subscription fee must be valid.');
 Object.assign(gym,patch,{id:gym.id,reason});audit(state,account,'SUBSCRIPTION_CHANGED',gym.id,before,gym,reason);
}
export function saveStaff(state:State,account:Account,staffId:string,name:string,mobile:string,permissions:Permission[],active:boolean,reason:string) {
 authorize(state,account,'owner');mobile=normalizeMobile(mobile);if(!name.trim()||!/^\d{10}$/.test(mobile))throw new Error('Enter a staff name and valid mobile.');
 if(state.accounts.some(a=>a.mobile===mobile&&a.id!==staffId))throw new Error('Mobile is already in use.');if(!reason.trim())throw new Error('Reason is required for staff access changes.');
 const old=state.accounts.find(a=>a.id===staffId);if(old&&(old.gymId!==account.gymId||old.role!=='staff'))throw new Error('Staff unavailable.');const before=old?{...old}:null;
 const next:Account={id:old?.id||id(),name:name.trim(),mobile,role:'staff',gymId:account.gymId,permissions:[...new Set(permissions)],active};if(old)Object.assign(old,next);else state.accounts.push(next);audit(state,account,'STAFF_ACCESS_CHANGED',next.id,before,next,reason);
}
export function savePlan(state:State,account:Account,plan:Plan) {
 authorize(state,account,'owner');if(plan.gymId!==account.gymId||!plan.name.trim()||plan.fee<0||!Number.isFinite(plan.fee)||!Number.isInteger(plan.months)||plan.months<1)throw new Error('Enter a valid plan and whole-month duration.');
 const old=state.plans.find(p=>p.id===plan.id);if(old&&old.gymId!==account.gymId)throw new Error('Plan unavailable.');const before=old?{...old}:null;if(old)Object.assign(old,plan);else state.plans.push({...plan,id:plan.id||id()});audit(state,account,'PLAN_SAVED',plan.id,before,plan,'Historical membership prices unchanged');
}
export function saveSettings(state:State,account:Account,settings:GymSettings,gymName:string) {
 authorize(state,account,'owner');if(settings.gymId!==account.gymId||!gymName.trim()||settings.expiryWindow<0||settings.expiryWindow>60||settings.discountLimit<0||settings.discountLimit>100)throw new Error('Enter valid gym settings.');
 try{new Intl.DateTimeFormat('en-CA',{timeZone:settings.timezone});}catch{throw new Error('Choose a valid timezone.');}
 const before=settingsFor(state,account.gymId);const i=state.settings.findIndex(s=>s.gymId===account.gymId);if(i<0)state.settings.push(settings);else state.settings[i]=settings;state.clients.find(c=>c.id===account.gymId)!.name=gymName.trim();audit(state,account,'GYM_SETTINGS_CHANGED',account.gymId,before,settings);
}
export function queueMessages(state:State,account:Account,memberIds:string[],kind:string,window=0) {
 authorize(state,account,'reminders');if(memberIds.length>1&&account.role==='staff'&&!can(account,'bulk_reminders'))throw new Error('Bulk reminders are not permitted.');let count=0;
 for(const memberId of memberIds){const member=visibleMembers(state,account).find(m=>m.id===memberId);if(!member)throw new Error('Member unavailable.');if(!member.consent)continue;const membership=currentMembership(state,member.id);const date=todayFor(state,member.gymId);
 if(state.reminders.some(r=>r.memberId===memberId&&r.membershipId===membership?.id&&r.kind===kind&&r.window===window&&r.date===date&&r.status!=='cancelled'))continue;
 const r:Reminder={id:id(),memberId,kind,date,membershipId:membership?.id,window,status:'queued',recipient:member.mobile,attempts:0,recordedBy:account.id};state.reminders.push(r);count++;audit(state,account,'MESSAGE_QUEUED',r.id,null,{...r,recipient:'••••'+member.mobile.slice(-4)});
 }return count;
}
export function retryMessage(state:State,account:Account,reminderId:string) {
 authorize(state,account,'reminders');const r=state.reminders.find(r=>r.id===reminderId);if(!r||!visibleMembers(state,account).some(m=>m.id===r.memberId))throw new Error('Message unavailable.');if(r.status!=='failed'||(r.attempts||0)>=3)throw new Error('Retry is unavailable or the limit was reached.');const before={...r};r.attempts=(r.attempts||0)+1;r.status='queued';r.error='';audit(state,account,'MESSAGE_RETRIED',r.id,before,r);
}
export function createTicket(state:State,account:Account,subject:string,description:string,priority:string) {
 if(!state.accounts.some(a=>a.id===account.id&&a.active)||!subject.trim()||!description.trim())throw new Error('Subject and details are required.');
 const ticket:Ticket={id:'TKT-'+id().slice(0,8).toUpperCase(),gymId:account.gymId,accountId:account.id,subject:subject.trim(),description:description.trim(),priority,status:'Open',created:new Date().toISOString(),resolution:''};state.tickets.push(ticket);audit(state,account,'SUPPORT_TICKET_CREATED',ticket.id,null,ticket);return ticket.id;
}
export function resolveTicket(state:State,account:Account,ticketId:string,status:Ticket['status'],resolution:string) {
 if(account.role==='super_admin')authorize(state,account,'platform');else authorize(state,account,'owner');const ticket=state.tickets.find(t=>t.id===ticketId&&(account.role==='super_admin'||t.gymId===account.gymId));if(!ticket)throw new Error('Ticket unavailable.');if(status==='Resolved'&&!resolution.trim())throw new Error('Resolution notes are required.');const before={...ticket};Object.assign(ticket,{status,resolution});audit(state,account,'SUPPORT_TICKET_UPDATED',ticket.id,before,ticket,resolution);
}
export function receiptFor(state:State,account:Account,paymentId:string) {
 const payment=state.payments.find(p=>p.id===paymentId);const member=visibleMembers(state,account).find(m=>m.id===payment?.memberId);if(!payment||!member||!['successful','refunded','voided'].includes(payment.status||'successful'))throw new Error('Receipt unavailable.');
 const membership=state.memberships.find(m=>m.id===payment.membershipId)!;const gym=state.clients.find(g=>g.id===member.gymId)!;
 return {payment,member,membership,gym,settings:settingsFor(state,gym.id)};
}




