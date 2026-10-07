import type { MembershipType } from '@/lib/supabase';
import { getMembershipTypeLabel } from '@/lib/utils';

interface MembershipTypeBadgeProps {
  type: MembershipType;
  className?: string;
}

export default function MembershipTypeBadge({ type, className = '' }: MembershipTypeBadgeProps) {
  const showGym = type === 'gym' || type === 'gym_boxing';
  const showBoxing = type === 'boxing' || type === 'gym_boxing';
  const label = getMembershipTypeLabel(type);

  return (
    <span
      role="img"
      aria-label={`${label} membership`}
      title={label}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-full border border-ink-200 bg-white px-2 shadow-sm ${className}`}
    >
      {showGym && (
        <img src="/membership-gym.png" alt="" aria-hidden="true" className="h-6 w-10 object-contain" />
      )}
      {showBoxing && (
        <img src="/membership-boxing.png" alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
      )}
    </span>
  );
}
