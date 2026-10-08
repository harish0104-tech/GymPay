import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { localData, type Plan, type MembershipType } from '@/lib/localData';
import { calculateExpiryDate, getMembershipTypeLabel, formatCurrency } from '@/lib/utils';
import { validateImageUpload } from '@/lib/imageUpload';
import Modal from '@/components/ui/Modal';
import { Camera, Upload, Loader2 } from 'lucide-react';

interface AddMemberModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddMemberModal({ open, onClose, onSaved }: AddMemberModalProps) {
  const { gym } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [membershipType, setMembershipType] = useState<MembershipType>('gym');
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [manualExpiry, setManualExpiry] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !gym) return;
    localData.from('plans').select('*').eq('gym_id', gym.id).eq('is_active', true).order('name')
      .then(({ data }) => setPlans(data as Plan[] ?? []));
  }, [open, gym]);

  const selectedPlan = plans.find(p => p.id === planId);

  useEffect(() => {
    if (selectedPlan && !manualExpiry) {
      setExpiryDate(calculateExpiryDate(startDate, selectedPlan.duration_value, selectedPlan.duration_unit));
    }
  }, [selectedPlan, startDate, manualExpiry]);

  const filteredPlans = plans.filter(p => p.membership_type === membershipType);

  const handlePhotoSelect = (file: File | null) => {
    if (!file) return;
    const validationError = validateImageUpload(file);
    if (validationError) {
      toast(validationError, 'error');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const resizeImage = (file: File, maxSize: number = 400): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > height) {
            if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
          } else {
            if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not supported')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => {
            if (blob) resolve(blob); else reject(new Error('Failed to compress'));
          }, 'image/jpeg', 0.8);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const resetForm = () => {
    setName(''); setPhone(''); setMembershipType('gym'); setPlanId('');
    setStartDate(new Date().toISOString().slice(0, 10));
    setExpiryDate(''); setManualExpiry(false); setPaymentStatus('paid');
    setPhotoUrl(null); setPhotoFile(null); setPhotoPreview(null);
  };

  const handleSave = async (closeAfterSave = true) => {
    if (!gym) return;
    if (!name.trim()) { toast('Please enter a name.', 'error'); return; }
    if (!/^[0-9]{10}$/.test(phone)) { toast('Phone number must contain exactly 10 digits.', 'error'); return; }
    if (!planId) { toast('Please select a plan.', 'error'); return; }
    if (!expiryDate) { toast('Please set an expiry date.', 'error'); return; }
    if (!photoFile && !photoUrl) { toast('Please capture or upload a member photo.', 'error'); return; }

    setLoading(true);
    try {
      let finalPhotoUrl = photoUrl;
      if (photoFile) {
        setUploadingPhoto(true);
        const blob = await resizeImage(photoFile);
        const fileName = `${gym.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const { error: uploadError } = await localData.storage.from('member-photos')
          .upload(fileName, blob, { contentType: 'image/jpeg' });
        if (uploadError) throw new Error('Failed to upload photo');
        const { data: { publicUrl } } = localData.storage.from('member-photos').getPublicUrl(fileName);
        finalPhotoUrl = publicUrl;
        setUploadingPhoto(false);
      }

      const { data: memberData, error: memberError } = await localData.from('members')
        .insert({
          gym_id: gym.id,
          name: name.trim(),
          phone: phone.trim(),
          photo_url: finalPhotoUrl,
          membership_type: membershipType,
          is_active: true,
        })
        .select()
        .limit(1);

      if (memberError || !memberData || memberData.length === 0) throw new Error('Failed to add member');
      const member = (Array.isArray(memberData) ? memberData[0] : memberData);

      const { data: membershipData, error: membershipError } = await localData.from('memberships')
        .insert({
          gym_id: gym.id,
          member_id: member.id,
          plan_id: planId,
          start_date: startDate,
          expiry_date: expiryDate,
          status: 'active',
        })
        .select()
        .limit(1);

      if (membershipError || !membershipData || membershipData.length === 0) throw new Error('Failed to create membership');
      const membership = (Array.isArray(membershipData) ? membershipData[0] : membershipData);

      if (paymentStatus === 'paid' && selectedPlan) {
        await localData.from('payments').insert({
          gym_id: gym.id,
          member_id: member.id,
          membership_id: membership.id,
          amount: selectedPlan.price,
          payment_date: new Date().toISOString().slice(0, 10),
          payment_method: null,
          status: 'paid',
        });
      } else if (paymentStatus === 'pending' && selectedPlan) {
        await localData.from('payments').insert({
          gym_id: gym.id,
          member_id: member.id,
          membership_id: membership.id,
          amount: selectedPlan.price,
          payment_date: startDate,
          payment_method: null,
          status: 'pending',
        });
      }

      toast('Member added successfully');
      resetForm();
      onSaved();
      if (closeAfterSave) {
        onClose();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add member', 'error');
    } finally {
      setLoading(false);
      setUploadingPhoto(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ADD MEMBER"
      variant="default"
    >
      <div className="space-y-4">
        {/* Photo upload */}
        <div className="flex flex-col items-center gap-3 pb-4 pt-2">
          <div className="relative">
            <button type="button" aria-label="Take or choose member photo" onClick={() => setShowPhotoOptions(true)} className="member-photo-placeholder flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-brand-yellow-ink/50 bg-brand-yellow/10">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow">
                  <Camera className="h-8 w-8 text-ink-900" />
                </span>
              )}
            </button>
            {photoPreview && (
              <button
                onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}
                className="absolute -top-1 -right-1 w-6 h-6 bg-status-danger text-white rounded-full flex items-center justify-center text-xs"
              >×</button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowPhotoOptions(true)}
              className="text-sm font-semibold uppercase tracking-wide text-ink-700"
            >
              {photoPreview ? 'Change Photo' : 'Take / Choose Photo'}
            </button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={e => handlePhotoSelect(e.target.files?.[0] ?? null)}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => handlePhotoSelect(e.target.files?.[0] ?? null)}
          />
        </div>

        {showPhotoOptions && (
          <div className="fixed inset-0 z-[70] flex items-end bg-black/70" onClick={() => setShowPhotoOptions(false)}>
            <div className="w-full rounded-t-2xl border-t border-ink-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
              onClick={event => event.stopPropagation()}>
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-300" />
              <p className="mb-4 text-center font-semibold text-ink-900">Add member photo</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { setShowPhotoOptions(false); cameraInputRef.current?.click(); }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-brand-yellow/50 bg-brand-yellow/10 p-5 text-brand-yellow-ink">
                  <Camera className="h-7 w-7" />
                  <span className="text-sm font-semibold">Take Photo</span>
                </button>
                <button type="button" onClick={() => { setShowPhotoOptions(false); uploadInputRef.current?.click(); }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-ink-300 bg-ink-100 p-5 text-ink-700">
                  <Upload className="h-7 w-7" />
                  <span className="text-sm font-semibold">Upload Photo</span>
                </button>
              </div>
              <button type="button" onClick={() => setShowPhotoOptions(false)} className="mt-3 w-full py-3 text-sm text-ink-600">Cancel</button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Member name" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Phone Number *</label>
          <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} type="tel" maxLength={10} pattern="[0-9]{10}" autoComplete="tel-national" aria-label="Phone number (10 digits)" className="input-field" placeholder="9876543210" inputMode="tel" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Membership Type *</label>
          <div className="grid grid-cols-3 gap-2">
            {(['gym', 'boxing', 'gym_boxing'] as MembershipType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setMembershipType(t); setPlanId(''); }}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  membershipType === t ? 'bg-brand-yellow text-brand-pure' : 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-100'
                }`}
              >
                {getMembershipTypeLabel(t)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Plan *</label>
          <select value={planId} onChange={e => setPlanId(e.target.value)} className="input-field">
            <option value="">Select a plan</option>
            {filteredPlans.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatCurrency(p.price)}
              </option>
            ))}
          </select>
          {filteredPlans.length === 0 && (
            <p className="text-xs text-status-warning mt-1">No active plans for {getMembershipTypeLabel(membershipType)}. Create one in Plans first.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">Start Date *</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Expiry Date {!manualExpiry && <span className="text-ink-400 font-normal">(auto)</span>}
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              disabled={!manualExpiry}
              className="input-field disabled:bg-ink-100 disabled:text-ink-500"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-500 cursor-pointer">
          <input type="checkbox" checked={manualExpiry} onChange={e => setManualExpiry(e.target.checked)} className="rounded" />
          Manually override expiry date
        </label>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Initial Payment</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentStatus('paid')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                paymentStatus === 'paid' ? 'bg-status-active text-white' : 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-100'
              }`}
            >Paid</button>
            <button
              type="button"
              onClick={() => setPaymentStatus('pending')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                paymentStatus === 'pending' ? 'bg-status-pending text-white' : 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-100'
              }`}
            >Pending</button>
          </div>
        </div>

        <div className="sticky -bottom-4 z-10 -mx-4 grid grid-cols-2 gap-3 border-t border-ink-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur md:static md:-mx-0 md:px-0">
          <button onClick={onClose} className="btn-ghost w-full border border-ink-300 py-3 text-sm">Cancel</button>
          <button onClick={() => handleSave(true)} disabled={loading || uploadingPhoto} className="btn-primary w-full py-3.5 text-sm">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : uploadingPhoto ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : 'Save Member'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
