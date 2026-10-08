// Browser-only data store. No server, credentials, or network requests.
export * from './types';
// Existing screens use heterogeneous records with optional joined fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const key = 'gympay-frontend-v1';
const now = new Date().toISOString();
const date = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
function seed(): Record<string, Row[]> {
  const plans = ['gym', 'boxing', 'gym_boxing'].map((type, i) => ({ id: `plan-${i}`, gym_id: 'local-gym', name: ['Monthly Gym', 'Monthly Boxing', 'Gym & Boxing'][i], membership_type: type, price: [1200,1500,2200][i], duration_value: 1, duration_unit: 'months', is_active: true, created_at: now, updated_at: now }));
  const members = ['Arjun Kumar', 'Priya Sharma', 'Rahul Singh'].map((name,i) => ({ id: `member-${i}`, gym_id: 'local-gym', name, phone: `900000000${i}`, photo_url: null, membership_type: plans[i].membership_type, is_active: true, created_at: now, updated_at: now }));
  const memberships = members.map((m,i) => ({ id: `membership-${i}`, gym_id: 'local-gym', member_id: m.id, plan_id: plans[i].id, start_date: date(-25), expiry_date: date([5,1,-2][i]), status: ['active','expiring_soon','expired'][i], created_at: now, updated_at: now }));
  return { gyms: [{ id: 'local-gym', name: 'Gym Pay', owner_user_id: 'local-user', owner_name: 'Demo Owner', owner_phone: '', owner_whatsapp_number: null, logo_url: null, timezone: 'Asia/Kolkata', created_at: now, updated_at: now }], profiles: [{ id: 'local-user', display_name: 'Demo Owner', created_at: now, updated_at: now }], plans, members, memberships, payments: members.map((m,i) => ({ id: `payment-${i}`, gym_id: 'local-gym', member_id: m.id, membership_id: memberships[i].id, amount: plans[i].price, payment_date: date(-25), payment_method: 'cash', status: i===2 ? 'pending' : 'paid', notes: 'Demo payment', created_at: now, updated_at: now })), reminders: [] };
}
function read(): Record<string, Row[]> {
  const saved = localStorage.getItem(key);
  if (saved) { try { const data = JSON.parse(saved); for (const gym of data.gyms ?? []) { if (gym.name === 'Marvel Fitness Culture' || gym.name === 'MFC') gym.name = 'Gym Pay'; } return data; } catch { /* Restore invalid local demo data. */ } }
  const data = seed(); localStorage.setItem(key, JSON.stringify(data)); return data;
}
function write(data: Record<string, Row[]>) { localStorage.setItem(key, JSON.stringify(data)); }
function joinRow(table: string, row: Row, selection: string, data: Record<string, Row[]>): Row {
  const result = { ...row };
  if (selection.includes('plan:plans')) result.plan = data.plans.find(p => p.id === row.plan_id);
  if (selection.includes('member:members')) result.member = data.members.find(m => m.id === row.member_id);
  if (selection.includes('membership:memberships')) { const m = data.memberships.find(m => m.id === row.membership_id); result.membership = m ? joinRow('memberships', m, 'plan:plans(*)', data) : null; }
  if (table === 'members' && selection.includes('latest_membership:memberships')) result.latest_membership = data.memberships.filter(m => m.member_id === row.id).map(m => joinRow('memberships',m,'plan:plans(*)',data));
  if (selection.includes('delivery_logs:')) result.delivery_logs = [];
  return result;
}
class LocalQuery {
  private filters: ((row: Row) => boolean)[] = [];
  private action = 'select'; private values: Row[] = []; private selection = '*';
  private sort?: { field: string; ascending: boolean }; private start = 0; private end = Infinity;
  private one = false; private head = false;
  constructor(private table: string) {}
  select(selection = '*', options?: { count?: string; head?: boolean }) { this.selection = selection; this.head = options?.head ?? false; return this; }
  eq(field: string, value: unknown) { this.filters.push(r => r[field] === value); return this; }
  in(field: string, values: unknown[]) { this.filters.push(r => values.includes(r[field])); return this; }
  gte(field: string, value: string) { this.filters.push(r => r[field] >= value); return this; }
  lt(field: string, value: string) { this.filters.push(r => r[field] < value); return this; }
  order(field: string, options?: { ascending?: boolean }) { this.sort = { field, ascending: options?.ascending ?? true }; return this; }
  range(start: number, end: number) { this.start = start; this.end = end + 1; return this; }
  limit(count: number) { this.end = count; return this; }
  abortSignal(_signal: AbortSignal) { return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  insert(values: Row | Row[]) { this.action = 'insert'; this.values = Array.isArray(values) ? values : [values]; return this; }
  upsert(values: Row | Row[], _options?: unknown) { this.action = 'upsert'; this.values = Array.isArray(values) ? values : [values]; return this; }
  update(values: Row) { this.action = 'update'; this.values = [values]; return this; }
  delete() { this.action = 'delete'; return this; }
  private execute() {
    try {
      const data = read(); const table = data[this.table] ?? (data[this.table] = []);
      let rows = table.filter(r => this.filters.every(f => f(r)));
      if (this.action === 'insert' || this.action === 'upsert') {
        rows = this.values.map(v => {
          const existing = this.action === 'upsert' ? table.find(r => v.id ? r.id === v.id : v.gym_id && r.gym_id === v.gym_id) : undefined;
          if (existing) { Object.assign(existing, v, { updated_at: new Date().toISOString() }); return existing; }
          const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...v }; table.push(row); return row;
        });
      } else if (this.action === 'update') rows.forEach(r => Object.assign(r, this.values[0], { updated_at: new Date().toISOString() }));
      else if (this.action === 'delete') {
        data[this.table] = table.filter(r => !rows.includes(r));
        if (this.table === 'members') for (const related of ['memberships','payments','reminders']) data[related] = (data[related] ?? []).filter(r => !rows.some(m => m.id === r.member_id));
      }
      if (this.action !== 'select') write(data);
      const count = rows.length;
      if (this.sort) { const { field, ascending } = this.sort; rows = [...rows].sort((a,b) => String(a[field]).localeCompare(String(b[field])) * (ascending ? 1 : -1)); }
      rows = rows.slice(this.start, this.end).map(r => joinRow(this.table,r,this.selection,data));
      return { data: this.head ? null : this.one ? rows[0] ?? null : rows, count, error: null as { message: string } | null };
    } catch (error) { return { data: null, count: 0, error: { message: error instanceof Error ? error.message : 'Unable to save browser data.' } }; }
  }
  then<TResult1 = ReturnType<LocalQuery['execute']>, TResult2 = never>(resolve?: ((value: ReturnType<LocalQuery['execute']>) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return Promise.resolve(this.execute()).then(resolve,reject); }
}
export const localData = {
  from: (table: string) => new LocalQuery(table),
  storage: { from: (_bucket: string) => ({
    upload: async (name: string, blob: Blob, _options?: unknown) => {
      try { const value = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); }); localStorage.setItem(`gympay-photo:${name}`,value); return { error: null }; }
      catch { return { error: { message: 'Photo could not be stored in this browser.' } }; }
    },
    getPublicUrl: (name: string) => ({ data: { publicUrl: localStorage.getItem(`gympay-photo:${name}`) ?? '' } }),
  }) },
};
