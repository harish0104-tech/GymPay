import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { localData, type Gym, type Profile } from '@/lib/localData';
const user = { id: 'local-user', email: 'demo@local', user_metadata: { display_name: 'Demo Owner' } };
interface ContextValue { user: typeof user; profile: Profile | null; gym: Gym | null; refreshGym: () => Promise<void>; }
const AuthContext = createContext<ContextValue | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [gym, setGym] = useState<Gym | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  async function refreshGym() {
    const result = await localData.from('gyms').select('*').eq('id', 'local-gym').single();
    setGym(result.data as Gym);
    const owner = await localData.from('profiles').select('*').single();
    setProfile(owner.data as Profile);
  }
  useEffect(() => { void refreshGym(); }, []);
  return <AuthContext.Provider value={{ user, gym, profile, refreshGym }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('Missing local app context'); return context; }
