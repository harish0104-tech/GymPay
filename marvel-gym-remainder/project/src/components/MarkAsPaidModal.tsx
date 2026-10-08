import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { localData, type Member, type Membership, type Plan } from '@/lib/localData';
import { calculateExpiryDate, formatCurrency } from '@/lib/utils';
import Modal from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';

interface MarkAsPaidModalProps {
  open: boolean;
  onClose: () => void;
  member: Member | null;
  membership: Membership | null;
  plan: Plan | null;
  onPaid: () => void;
}

const paymentMethods = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'];

export default function MarkAsPaidModal({ open, onClose, member, membership, plan, onPaid }: MarkAsPaidModalProps) {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [loading, setLoading] = useState(false);

  const expectedAmount = plan?.price ?? 0;

  const handlePaid = async () => {
    if (!member || !membership || !plan || !gym) return;
    const paidAmount = parseFloat(amount || String(expectedAmount));
    if (isNaN(paidAmount) || paidAmount < 0) {
      toast('Please enter a valid amount.', 'error');
      return;
    }
    setLoading(true);
    try {
      // 1. Create payment record
      const { error: payError } = await localData.from('payments').insert({
        gym_id: gym.id,
        member_id: member.id,
        membership_id: membership.id,
        amount: paidAmount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        status: 'paid',
      });
      if (payError) throw new Error('Failed to record payment');

      // 2. Calculate next membership period
      const today = new Date().toISOString().slice(0, 10);
      const newStartDate = today;
      const newExpiry = calculateExpiryDate(newStartDate, plan.duration_value, plan.duration_unit);

      // 3. Create new membership period
      const { data: newMembershipData, error: mbrError } = await localData.from('memberships').insert({
        gym_id: gym.id,
        member_id: member.id,
        plan_id: plan.id,
        start_date: newStartDate,
        expiry_date: newExpiry,
        status: 'active',
      }).select().limit(1);
      if (mbrError || !newMembershipData || newMembershipData.length === 0) throw new Error('Failed to create new membership');
      const newMembership = (Array.isArray(newMembershipData) ? newMembershipData[0] : newMembershipData);

      // 4. Update old membership to expired (preserve history)
      await localData.from('memberships').update({ status: 'expired' }).eq('id', membership.id);

      // 5. Update member to active
      await localData.from('members').update({ is_active: true }).eq('id', member.id);

      // 6. Mark any pending/due payments for old membership as paid (skip)
      await localData.from('payments')
        .update({ status: 'paid' })
        .eq('membership_id', membership.id)
        .eq('status', 'pending');

      toast('Payment recorded successfully');
      onPaid();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to record payment', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reset amount when opening
  const handleOpen = () => {
    setAmount(String(expectedAmount));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod('Cash');
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Mark as Paid">
      <div className="space-y-4" onClick={handleOpen}>
        <div className="bg-ink-100 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-ink-500">Member</span>
            <span className="font-semibold">{member?.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-500">Current Plan</span>
            <span className="font-semibold">{plan?.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-500">Expected Amount</span>
            <span className="font-semibold">{formatCurrency(expectedAmount)}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Payment Amount</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="input-field"
            placeholder={String(expectedAmount)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Payment Date</label>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="input-field" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  paymentMethod === m ? 'bg-brand-yellow text-brand-pure' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={handlePaid} disabled={loading} className="btn-primary flex-1">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Recording...</> : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
