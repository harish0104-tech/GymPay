import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { supabase, type Member, type Membership, type Plan, type Payment } from '@/lib/supabase';
import { calculateExpiryDate, formatDate, formatCurrency, getMembershipTypeLabel, getMembershipStatus, getDaysRemainingText, getStatusLabel } from '@/lib/utils';
import MemberPhoto from '@/components/MemberPhoto';
import MembershipTypeBadge from '@/components/MembershipTypeBadge';
import { MembershipStatusBadge } from '@/components/StatusBadge';
import MarkAsPaidModal from '@/components/MarkAsPaidModal';
import { ArrowLeft, Phone, CheckCircle2, Edit, UserX, UserCheck, Trash2, X, Loader2 } from 'lucide-react';

interface MemberProfilePageProps {
  memberId: string;
  onBack: () => void;
  onEditMember: (memberId: string) => void;
}

export default function MemberProfilePage({ memberId, onBack, onEditMember }: MemberProfilePageProps) {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [member, setMember] = useState<Member | null>(null);
  const [memberships, setMemberships] = useState<(Membership & { plan: Plan })[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [showInactiveConfirm, setShowInactiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    if (!gym || !memberId) return;
    setLoading(true);
    const [{ data: m }, { data: mbrs }, { data: pays }] = await Promise.all([
      supabase.from('members').select('*').eq('id', memberId).maybeSingle(),
      supabase.from('memberships').select('*, plan:plans(*)').eq('member_id', memberId).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('member_id', memberId).order('payment_date', { ascending: false }),
    ]);
    setMember(m as Member | null);
    setMemberships((mbrs as any) ?? []);
    setPayments((pays as Payment[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [gym, memberId]);

  if (loading || !member) {
    return <div className="p-8 text-center text-ink-400">Loading member...</div>;
  }

  const latestMembership = memberships[0];
  const currentPlan = latestMembership?.plan;
  const status = latestMembership ? getMembershipStatus(latestMembership.expiry_date, member.is_active) : 'inactive';

  const handleToggleInactive = async () => {
    setActionLoading(true);
    const newVal = !member.is_active;
    const { error } = await supabase.from('members').update({ is_active: newVal }).eq('id', member.id);
    if (error) {
      toast('Failed to update member.', 'error');
    } else {
      toast(newVal ? 'Member reactivated' : 'Member marked inactive');
      setShowInactiveConfirm(false);
      loadData();
    }
    setActionLoading(false);
  };

  const handleDelete = async () => {
    setActionLoading(true);
    const { error } = await supabase.from('members').delete().eq('id', member.id);
    if (error) {
      toast('Failed to delete member.', 'error');
    } else {
      toast('Member deleted');
      onBack();
    }
    setActionLoading(false);
  };

  const callUrl = member.phone ? `tel:${member.phone}` : null;

  return (
    <div className="max-w-4xl mx-auto px-4 pb-4 pt-7 md:p-8">
      <button onClick={onBack} className="mb-4 inline-flex h-11 items-center gap-2 rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-900 shadow-sm transition-colors hover:border-ink-500 hover:bg-ink-100">
        <ArrowLeft className="h-5 w-5" /> Back to Members
      </button>

      {/* Header card */}
      <div className="card mb-5 p-4 md:mb-6 md:p-6">
        <div className="flex items-center gap-4">
          <MemberPhoto url={member.photo_url} name={member.name} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2 md:gap-3">
              <h1 className="min-w-0 break-words font-display text-2xl tracking-wide md:text-3xl">{member.name}</h1>
              <MembershipStatusBadge status={status} />
            </div>
            <p className="text-ink-500 flex items-center gap-2">
              <Phone className="w-4 h-4" /> {member.phone}
            </p>
            <div className="mt-2">
              <MembershipTypeBadge type={member.membership_type} />
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-5 grid grid-cols-2 gap-2 md:mt-6 md:flex md:flex-wrap">
          {member.is_active && (
            <button onClick={() => setShowPaidModal(true)} className="btn-primary min-w-0 px-2 text-xs sm:px-3 sm:text-sm">
              <CheckCircle2 className="w-4 h-4" /> Mark as Paid
            </button>
          )}
          <button onClick={() => setShowEditModal(true)} className="btn-secondary min-w-0 px-2 text-xs sm:px-3 sm:text-sm">
            <Edit className="w-4 h-4" /> Edit
          </button>
          {callUrl && (
            <a href={callUrl} className="btn-ghost min-w-0 border border-ink-200 px-2 text-xs sm:px-3 sm:text-sm">
              <Phone className="w-4 h-4" /> Call
            </a>
          )}
          {/* WhatsApp profile action is intentionally hidden until that channel is enabled again. */}
          <button
            onClick={() => setShowInactiveConfirm(true)}
            className="btn-ghost min-w-0 border border-ink-200 px-2 text-xs sm:px-3 sm:text-sm"
          >
            {member.is_active ? <><UserX className="w-4 h-4" /> Mark Inactive</> : <><UserCheck className="w-4 h-4" /> Reactivate</>}
          </button>
        </div>
      </div>

      {/* Info section */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <h3 className="font-heading text-lg font-semibold mb-4">Membership Info</h3>
          <div className="space-y-3">
            <InfoRow label="Membership Type" value={getMembershipTypeLabel(member.membership_type)} />
            <InfoRow label="Current Plan" value={currentPlan?.name ?? '—'} />
            <InfoRow label="Plan Price" value={currentPlan ? formatCurrency(currentPlan.price) : '—'} />
            {latestMembership && (
              <>
                <InfoRow label="Start Date" value={formatDate(latestMembership.start_date)} />
                <InfoRow label="Expiry Date" value={formatDate(latestMembership.expiry_date)} />
                <InfoRow label="Status" value={getDaysRemainingText(latestMembership.expiry_date, member.is_active)} />
              </>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-heading text-lg font-semibold mb-4">Payment History</h3>
          {payments.length === 0 ? (
            <p className="text-ink-400 text-sm">No payments recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between border-b border-ink-200 last:border-0 pb-3 last:pb-0">
                  <div>
                    <p className="font-semibold text-sm">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-ink-400">{formatDate(p.payment_date)} • {p.payment_method ?? '—'}</p>
                  </div>
                  <span className={`badge ${p.status === 'paid' ? 'badge-active' : p.status === 'pending' ? 'badge-pending' : 'badge-danger'}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Membership history */}
      <div className="card p-5 mb-6">
        <h3 className="font-heading text-lg font-semibold mb-4">Membership History</h3>
        {memberships.length === 0 ? (
          <p className="text-ink-400 text-sm">No membership history.</p>
        ) : (
          <div className="space-y-3">
            {memberships.map(m => (
              <div key={m.id} className="flex items-center justify-between border-b border-ink-200 last:border-0 pb-3 last:pb-0">
                <div>
                  <p className="font-semibold text-sm">{m.plan.name}</p>
                  <p className="text-xs text-ink-400">{formatDate(m.start_date)} → {formatDate(m.expiry_date)}</p>
                </div>
                <MembershipStatusBadge status={m.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="card p-5 border-status-danger/20">
        <h3 className="font-heading text-lg font-semibold mb-2 text-status-danger">Danger Zone</h3>
        <p className="text-ink-500 text-sm mb-3">Permanently delete this member and all their records. This cannot be undone.</p>
        <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger">
          <Trash2 className="w-4 h-4" /> Delete Member
        </button>
      </div>

      {/* Modals */}
      <MarkAsPaidModal
        open={showPaidModal}
        onClose={() => setShowPaidModal(false)}
        member={member}
        membership={latestMembership ?? null}
        plan={currentPlan ?? null}
        onPaid={loadData}
      />

      {showEditModal && (
        <EditMemberModal
          member={member}
          membership={latestMembership ?? null}
          onClose={() => setShowEditModal(false)}
          onSaved={() => { setShowEditModal(false); loadData(); }}
        />
      )}

      {showInactiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowInactiveConfirm(false)}>
          <div className="card p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-heading text-lg font-semibold mb-2">
              {member.is_active ? 'Mark as Inactive?' : 'Reactivate Member?'}
            </h3>
            <p className="text-ink-500 text-sm mb-6">
              {member.is_active
                ? 'This member will be excluded from active counts and will not receive expiry reminders.'
                : 'This member will be included in active counts and expiry tracking will resume.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowInactiveConfirm(false)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={handleToggleInactive} disabled={actionLoading} className="btn-secondary flex-1">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="card p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-heading text-lg font-semibold mb-2 text-status-danger">Delete {member.name}?</h3>
            <p className="text-ink-500 text-sm mb-6">This will permanently delete the member, all memberships, and all payment records. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={handleDelete} disabled={actionLoading} className="btn-danger flex-1">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

import Modal from '@/components/ui/Modal';
import { validateImageUpload } from '@/lib/imageUpload';

function EditMemberModal({ member, membership, onClose, onSaved }: { member: Member; membership: Membership | null; onClose: () => void; onSaved: () => void }) {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone);
  const [membershipType, setMembershipType] = useState(member.membership_type);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState(membership?.plan_id ?? '');
  const [startDate, setStartDate] = useState(membership?.start_date ?? new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(membership?.expiry_date ?? '');
  const [manualExpiry, setManualExpiry] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(member.photo_url);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    if (!gym) return;
    supabase.from('plans').select('*').eq('gym_id', gym.id).order('name')
      .then(({ data }) => setPlans(data as Plan[] ?? []));
  }, [gym]);

  const filteredPlans = plans.filter(plan => plan.membership_type === membershipType && (plan.is_active || plan.id === membership?.plan_id));
  const selectedPlan = plans.find(plan => plan.id === planId);

  useEffect(() => {
    if (!selectedPlan || manualExpiry) return;
    setExpiryDate(calculateExpiryDate(startDate, selectedPlan.duration_value, selectedPlan.duration_unit));
  }, [selectedPlan, startDate, manualExpiry]);

  const handlePhotoSelect = (file: File | null) => {
    if (!file) return;
    const validationError = validateImageUpload(file);
    if (validationError) {
      toast(validationError, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const resizeImage = (file: File, maxSize = 400): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > height) { if (width > maxSize) { height = height * maxSize / width; width = maxSize; } }
          else { if (height > maxSize) { width = width * maxSize / height; height = maxSize; } }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('no ctx')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('blob')), 'image/jpeg', 0.8);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { toast('Name is required.', 'error'); return; }
    if (!/^[0-9]{10}$/.test(phone)) { toast('Phone number must contain exactly 10 digits.', 'error'); return; }
    if (!planId) { toast('Please select a plan.', 'error'); return; }
    if (!startDate || !expiryDate) { toast('Start and expiry dates are required.', 'error'); return; }
    setSaving(true);
    try {
      let photoUrl = member.photo_url;
      if (photoFile) {
        const blob = await resizeImage(photoFile);
        const fileName = `${member.gym_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const { error: upErr } = await supabase.storage.from('member-photos').upload(fileName, blob, { contentType: 'image/jpeg' });
        if (upErr) throw new Error('Photo upload failed');
        const { data: { publicUrl } } = supabase.storage.from('member-photos').getPublicUrl(fileName);
        photoUrl = publicUrl;
      }
      const { error } = await supabase.from('members').update({
        name: name.trim(), phone: phone.trim(), membership_type: membershipType, photo_url: photoUrl,
      }).eq('id', member.id);
      if (error) throw new Error('Failed to update member');

      if (membership) {
        const { error: membershipError } = await supabase.from('memberships').update({
          plan_id: planId,
          start_date: startDate,
          expiry_date: expiryDate,
          status: getMembershipStatus(expiryDate, member.is_active),
        }).eq('id', membership.id).eq('gym_id', member.gym_id);
        if (membershipError) throw new Error('Member details were updated, but membership dates could not be saved.');
      } else {
        const { error: membershipError } = await supabase.from('memberships').insert({
          gym_id: member.gym_id,
          member_id: member.id,
          plan_id: planId,
          start_date: startDate,
          expiry_date: expiryDate,
          status: getMembershipStatus(expiryDate, member.is_active),
        });
        if (membershipError) throw new Error('Member details were updated, but the membership could not be created.');
      }
      toast('Member updated successfully');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Edit Member">
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-ink-200 flex items-center justify-center overflow-hidden border-2 border-ink-200">
              {photoPreview ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" /> : null}
            </div>
          </div>
          <button onClick={() => fileInputRef.current?.click()} className="text-sm text-brand-pure font-medium underline">Change Photo</button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => handlePhotoSelect(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Phone *</label>
          <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} type="tel" maxLength={10} pattern="[0-9]{10}" autoComplete="tel-national" aria-label="Phone number (10 digits)" className="input-field" inputMode="tel" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Membership Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(['gym', 'boxing', 'gym_boxing'] as const).map(t => (
              <button key={t} type="button" onClick={() => { setMembershipType(t); setPlanId(''); }}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium ${membershipType === t ? 'bg-brand-yellow text-brand-pure' : 'bg-ink-100 text-ink-700'}`}>
                {getMembershipTypeLabel(t)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Plan *</label>
          <select value={planId} onChange={e => setPlanId(e.target.value)} className="input-field">
            <option value="">Select a plan</option>
            {filteredPlans.map(plan => (
              <option key={plan.id} value={plan.id}>{plan.name} — {formatCurrency(plan.price)}</option>
            ))}
          </select>
          {filteredPlans.length === 0 && <p className="mt-1 text-xs text-status-warning">No plans are available for this membership type.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Start Date *</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Expiry Date {!manualExpiry && <span className="font-normal text-ink-400">(auto)</span>}
            </label>
            <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} disabled={!manualExpiry}
              className="input-field disabled:bg-ink-100 disabled:text-ink-500" />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-500">
          <input type="checkbox" checked={manualExpiry} onChange={e => setManualExpiry(e.target.checked)} className="rounded" />
          Manually override expiry date
        </label>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
