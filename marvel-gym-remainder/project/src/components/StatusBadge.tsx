import type { MembershipStatus, PaymentStatus } from '@/lib/supabase';
import { getStatusLabel, getPaymentStatusLabel } from '@/lib/utils';

export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  switch (status) {
    case 'active': return <span className="badge-active">{getStatusLabel(status)}</span>;
    case 'expiring_soon': return <span className="badge-warning">{getStatusLabel(status)}</span>;
    case 'expired': return <span className="badge-danger">{getStatusLabel(status)}</span>;
    case 'inactive': return <span className="badge-inactive">{getStatusLabel(status)}</span>;
  }
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  switch (status) {
    case 'paid': return <span className="badge-active">{getPaymentStatusLabel(status)}</span>;
    case 'pending': return <span className="badge-pending">{getPaymentStatusLabel(status)}</span>;
    case 'due': return <span className="badge-danger">{getPaymentStatusLabel(status)}</span>;
  }
}
