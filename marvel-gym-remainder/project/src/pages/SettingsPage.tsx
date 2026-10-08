import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { localData } from '@/lib/localData';
import { useToast } from '@/components/ui/Toast';
import { Building2 } from 'lucide-react';
export default function SettingsPage() {
  const { gym, refreshGym } = useAuth(); const { toast } = useToast();
  const [name,setName] = useState(''); const [owner,setOwner] = useState(''); const [phone,setPhone] = useState('');
  useEffect(() => { setName(gym?.name ?? ''); setOwner(gym?.owner_name ?? ''); setPhone(gym?.owner_phone ?? ''); }, [gym]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!gym) return;
    const { error } = await localData.from('gyms').update({ name: name.trim(), owner_name: owner.trim(), owner_phone: phone.trim() }).eq('id',gym.id);
    if (error) return toast(error.message,'error'); await refreshGym(); toast('Settings saved in this browser.');
  }
  return <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6"><h1 className="font-heading text-2xl font-bold">Settings</h1>
    <p className="text-ink-500">Frontend demo. Changes are saved only in this browser. Login, cloud sync, WhatsApp delivery and push notifications are unavailable.</p>
    <form onSubmit={save} className="card space-y-4 p-6"><h2 className="flex items-center gap-2 text-lg font-bold"><Building2 className="h-5 w-5"/>Gym details</h2>
      <label className="block">Gym name<input required className="input mt-2 w-full" value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="block">Owner name<input className="input mt-2 w-full" value={owner} onChange={e=>setOwner(e.target.value)}/></label>
      <label className="block">Phone<input className="input mt-2 w-full" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
      <button className="btn-primary" type="submit">Save changes</button>
    </form></div>;
}
