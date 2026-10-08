import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { localData, type Plan, type MembershipType, type DurationUnit } from '@/lib/localData';
import { formatCurrency, getMembershipTypeLabel, getDurationLabel } from '@/lib/utils';
import Modal from '@/components/ui/Modal';
import { Plus, LayoutGrid, Edit, Ban, CheckCircle2, Loader2, Trash2, Timer } from 'lucide-react';

export default function PlansPage() {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPlans = async () => {
    if (!gym) return;
    setLoading(true);
    const { data } = await localData.from('plans').select('*').eq('gym_id', gym.id).order('created_at', { ascending: false });
    setPlans(data as Plan[] ?? []);
    setLoading(false);
  };

  useEffect(() => { loadPlans(); }, [gym]);

  const handleToggle = async (plan: Plan) => {
    const { error } = await localData.from('plans').update({ is_active: !plan.is_active }).eq('id', plan.id);
    if (error) { toast('Failed to update plan.', 'error'); return; }
    toast(plan.is_active ? 'Plan disabled' : 'Plan enabled');
    loadPlans();
  };

  const handleDelete = async () => {
    if (!gym || !deletingPlan) return;
    setDeleting(true);
    try {
      const { count, error: usageError } = await localData.from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('gym_id', gym.id)
        .eq('plan_id', deletingPlan.id);
      if (usageError) throw new Error('Could not check whether this plan is in use.');
      if ((count ?? 0) > 0) {
        toast('This plan is used by member history and cannot be deleted. Disable it instead.', 'error');
        setDeletingPlan(null);
        return;
      }
      const { error } = await localData.from('plans').delete()
        .eq('id', deletingPlan.id)
        .eq('gym_id', gym.id);
      if (error) throw new Error('Failed to delete plan');
      toast('Plan deleted successfully');
      setDeletingPlan(null);
      await loadPlans();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete plan', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pb-4 pt-7 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-wide">PLANS</h1>
          <p className="text-ink-500 mt-1">Manage your membership plans</p>
        </div>
        <button onClick={() => { setEditingPlan(null); setShowModal(true); }} className="btn-primary h-11 min-w-0 shrink-0 px-4 text-sm sm:px-5 sm:text-base">
          <Plus className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
          <span className="whitespace-nowrap">Add Plan</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-400">Loading plans...</div>
      ) : plans.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-ink-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <LayoutGrid className="w-8 h-8 text-ink-400" />
          </div>
          <h3 className="font-display text-2xl tracking-wide mb-2">NO PLANS YET</h3>
          <p className="text-ink-500 mb-4">Create your first membership plan to start adding members.</p>
          <button onClick={() => { setEditingPlan(null); setShowModal(true); }} className="btn-primary mx-auto">
            <Plus className="w-5 h-5" /> CREATE PLAN
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map(plan => (
            <article key={plan.id} className={`card group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-400 hover:shadow-lg ${!plan.is_active ? 'bg-ink-100/70' : ''}`}>
              <div className={`h-1.5 w-full ${!plan.is_active ? 'bg-ink-300' : 'bg-brand-yellow'}`} />

              <div className="p-5">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div role="img" aria-label={`${getMembershipTypeLabel(plan.membership_type)} plan`} className={`flex h-11 w-11 shrink-0 items-center justify-center gap-0.5 rounded-xl p-1 ${!plan.is_active ? 'bg-ink-200 grayscale' : 'bg-brand-yellow'}`}>
                      {(plan.membership_type === 'gym' || plan.membership_type === 'gym_boxing') && (
                        <img
                          src="/membership-gym.png"
                          alt=""
                          aria-hidden="true"
                          className={`${plan.membership_type === 'gym_boxing' ? 'h-4 w-5' : 'h-6 w-8'} rounded-sm bg-white object-contain`}
                        />
                      )}
                      {(plan.membership_type === 'boxing' || plan.membership_type === 'gym_boxing') && (
                        <img
                          src="/membership-boxing.png"
                          alt=""
                          aria-hidden="true"
                          className={`${plan.membership_type === 'gym_boxing' ? 'h-5 w-5' : 'h-7 w-7'} rounded-sm bg-white object-contain`}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-heading text-xl font-semibold text-ink-900">{plan.name}</h3>
                      <p className="mt-0.5 text-sm text-ink-500">{getMembershipTypeLabel(plan.membership_type)}</p>
                    </div>
                  </div>
                  <span className={`badge shrink-0 ${plan.is_active ? 'badge-active' : 'badge-inactive'}`}>
                    {plan.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-ink-200 bg-ink-100/70">
                  <div className="border-r border-ink-200 p-4">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Price</p>
                    <p className="font-display text-3xl leading-none text-ink-900">{formatCurrency(plan.price)}</p>
                  </div>
                  <div className="p-4">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Duration</p>
                    <p className="flex items-center gap-1.5 font-semibold text-ink-900">
                      <Timer className="h-4 w-4 text-ink-500" />
                      {getDurationLabel(plan.duration_value, plan.duration_unit)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-ink-200 pt-4">
                  <button onClick={() => { setEditingPlan(plan); setShowModal(true); }} className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-ink-200 px-2 text-xs font-semibold text-ink-800 transition-colors hover:bg-ink-100 sm:text-sm">
                    <Edit className="h-4 w-4" /> Edit
                  </button>
                  <button onClick={() => handleToggle(plan)} className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-ink-200 px-2 text-xs font-semibold text-ink-800 transition-colors hover:bg-ink-100 sm:text-sm">
                    {plan.is_active ? <><Ban className="h-4 w-4" /> Disable</> : <><CheckCircle2 className="h-4 w-4" /> Enable</>}
                  </button>
                  <button onClick={() => setDeletingPlan(plan)} className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-status-danger/30 px-2 text-xs font-semibold text-status-danger transition-colors hover:bg-status-danger-bg sm:text-sm">
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {showModal && (
        <PlanModal
          plan={editingPlan}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadPlans(); }}
        />
      )}

      <Modal open={Boolean(deletingPlan)} onClose={() => !deleting && setDeletingPlan(null)} title="Delete Plan" maxWidth="max-w-sm">
        <p className="text-sm text-ink-500">
          Delete <span className="font-semibold text-ink-900">{deletingPlan?.name}</span>? This action cannot be undone.
        </p>
        <div className="mt-5 flex gap-3">
          <button onClick={() => setDeletingPlan(null)} disabled={deleting} className="btn-ghost flex-1">Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

function PlanModal({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(plan?.name ?? '');
  const [membershipType, setMembershipType] = useState<MembershipType>(plan?.membership_type ?? 'gym');
  const [price, setPrice] = useState(plan ? String(plan.price) : '');
  const [durationValue, setDurationValue] = useState(plan ? String(plan.duration_value) : '1');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(plan?.duration_unit ?? 'months');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!gym) return;
    if (!name.trim()) { toast('Plan name is required.', 'error'); return; }
    const priceNum = parseFloat(price || '0');
    if (isNaN(priceNum) || priceNum < 0) { toast('Price must be a valid non-negative number.', 'error'); return; }
    const durNum = parseInt(durationValue || '0');
    if (isNaN(durNum) || durNum <= 0) { toast('Duration must be a positive number.', 'error'); return; }

    setSaving(true);
    try {
      if (plan) {
        const { error } = await localData.from('plans').update({
          name: name.trim(), membership_type: membershipType, price: priceNum,
          duration_value: durNum, duration_unit: durationUnit,
        }).eq('id', plan.id);
        if (error) throw new Error('Failed to update plan');
        toast('Plan updated successfully');
      } else {
        const { error } = await localData.from('plans').insert({
          gym_id: gym.id, name: name.trim(), membership_type: membershipType, price: priceNum,
          duration_value: durNum, duration_unit: durationUnit, is_active: true,
        });
        if (error) throw new Error('Failed to create plan');
        toast('Plan created successfully');
      }
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Operation failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={plan ? 'Edit Plan' : 'Create Plan'}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Plan Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="e.g. Monthly Gym" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Membership Type *</label>
          <div className="grid grid-cols-3 gap-2">
            {(['gym', 'boxing', 'gym_boxing'] as MembershipType[]).map(t => (
              <button key={t} type="button" onClick={() => setMembershipType(t)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium ${membershipType === t ? 'bg-brand-yellow text-brand-pure' : 'bg-ink-100 text-ink-700'}`}>
                {getMembershipTypeLabel(t)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Price (₹) *</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="input-field" placeholder="1200" min="0" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Duration *</label>
            <input type="number" value={durationValue} onChange={e => setDurationValue(e.target.value)} className="input-field" min="1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Unit *</label>
            <select value={durationUnit} onChange={e => setDurationUnit(e.target.value as DurationUnit)} className="input-field">
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : plan ? 'Save Changes' : 'Save Plan'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
