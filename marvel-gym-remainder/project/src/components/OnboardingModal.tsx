import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase, type MembershipType, type DurationUnit } from '@/lib/supabase';
import { getMembershipTypeLabel } from '@/lib/utils';
import { Loader2, Check, ChevronRight } from 'lucide-react';

interface OnboardingModalProps {
  onComplete: (addFirstMember?: boolean) => void;
}

interface OnboardingDraft {
  step: number;
  gymName: string;
  ownerName: string;
  ownerPhone: string;
  planName: string;
  planType: MembershipType;
  planPrice: string;
  planDuration: string;
  planUnit: DurationUnit;
}

const defaultDraft: OnboardingDraft = {
  step: 0,
  gymName: '',
  ownerName: '',
  ownerPhone: '',
  planName: 'Monthly Gym',
  planType: 'gym',
  planPrice: '1200',
  planDuration: '1',
  planUnit: 'months',
};

function getDraftKey(userId?: string) {
  return userId ? `mfc:plan-first-onboarding-draft:${userId}` : null;
}

function loadDraft(userId?: string): OnboardingDraft {
  const key = getDraftKey(userId);
  if (!key) return defaultDraft;
  try {
    const saved = localStorage.getItem(key);
    return saved ? { ...defaultDraft, ...JSON.parse(saved) } : defaultDraft;
  } catch {
    return defaultDraft;
  }
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const { user, gym } = useAuth();
  const { toast } = useToast();
  const [initialDraft] = useState(() => loadDraft(user?.id));
  const [step, setStep] = useState(initialDraft.step);
  const [saving, setSaving] = useState(false);

  const [planName, setPlanName] = useState(initialDraft.planName);
  const [planType, setPlanType] = useState<MembershipType>(initialDraft.planType);
  const [planPrice, setPlanPrice] = useState(initialDraft.planPrice);
  const [planDuration, setPlanDuration] = useState(initialDraft.planDuration);
  const [planUnit, setPlanUnit] = useState<DurationUnit>(initialDraft.planUnit);
  const steps = ['First Plan', 'Add Member'];

  useEffect(() => {
    const key = getDraftKey(user?.id);
    if (!key) return;
    const draft: OnboardingDraft = {
      step,
      gymName: '',
      ownerName: '',
      ownerPhone: '',
      planName,
      planType,
      planPrice,
      planDuration,
      planUnit,
    };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // Storage can be unavailable in strict private-browser modes.
    }
  }, [user?.id, step, planName, planType, planPrice, planDuration, planUnit]);

  const finishOnboarding = (addFirstMember = false) => {
    const key = getDraftKey(user?.id);
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Completing onboarding must not be blocked by unavailable storage.
      }
    }
    onComplete(addFirstMember);
  };

  const handleCreatePlan = async () => {
    if (!gym) { toast('Gym account is not ready yet. Please try again.', 'error'); return; }
    if (!planName.trim()) { toast('Plan name is required.', 'error'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('plans').insert({
        gym_id: gym.id,
        name: planName.trim(),
        membership_type: planType,
        price: parseFloat(planPrice) || 0,
        duration_value: parseInt(planDuration) || 1,
        duration_unit: planUnit,
        is_active: true,
      });
      if (error) throw new Error('Failed to create plan');
      setStep(1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create plan', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-brand-pure flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md my-auto">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <img src="/mfc-icon-v2-192.png" alt="Marvel Fitness Culture" className="w-16 h-16 rounded-xl object-cover" />
          <h1 className="font-display text-2xl text-white tracking-wide">MARVEL FITNESS CULTURE</h1>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex-1">
              <div className={`h-1 rounded-full transition-colors ${i <= step ? 'bg-brand-yellow' : 'bg-ink-800'}`} />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl tracking-wide">CREATE FIRST PLAN</h2>
                <p className="text-ink-500 text-sm mt-1">Set up your first membership plan.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Plan Name *</label>
                <input value={planName} onChange={e => setPlanName(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Membership Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['gym', 'boxing', 'gym_boxing'] as MembershipType[]).map(t => (
                    <button key={t} type="button" onClick={() => setPlanType(t)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium ${planType === t ? 'bg-brand-yellow text-brand-pure' : 'bg-ink-100 text-ink-700'}`}>
                      {getMembershipTypeLabel(t)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">Price (₹)</label>
                <input type="number" value={planPrice} onChange={e => setPlanPrice(e.target.value)} className="input-field" min="0" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">Duration</label>
                  <input type="number" value={planDuration} onChange={e => setPlanDuration(e.target.value)} className="input-field" min="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">Unit</label>
                  <select value={planUnit} onChange={e => setPlanUnit(e.target.value as DurationUnit)} className="input-field">
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </div>
              </div>
              <button onClick={handleCreatePlan} disabled={saving} className="btn-primary w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Plan'} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-status-active-bg rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-status-active" />
              </div>
              <div>
                <h2 className="font-display text-2xl tracking-wide">PLAN CREATED!</h2>
                <p className="text-ink-500 text-sm mt-1">Now add your first member to this plan.</p>
              </div>
              <button onClick={() => finishOnboarding(true)} className="btn-primary w-full">
                Add First Member <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
