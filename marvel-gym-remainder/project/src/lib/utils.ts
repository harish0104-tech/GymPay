import type { MembershipType, DurationUnit, MembershipStatus, PaymentStatus } from './supabase';

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatCurrency(amount: number): string {
  return '₹' + new Intl.NumberFormat('en-IN').format(amount);
}

export function todayInKolkata(): string {
  const now = new Date();
  const kolkataTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const year = kolkataTime.getFullYear();
  const month = String(kolkataTime.getMonth() + 1).padStart(2, '0');
  const day = String(kolkataTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysUntilExpiry(expiryDate: string): number {
  const today = new Date(todayInKolkata() + 'T00:00:00');
  const expiry = new Date(expiryDate + 'T00:00:00');
  const diff = expiry.getTime() - today.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getMembershipStatus(expiryDate: string, isActive: boolean): MembershipStatus {
  if (!isActive) return 'inactive';
  const days = daysUntilExpiry(expiryDate);
  if (days < 0) return 'expired';
  if (days <= 1) return 'expiring_soon';
  return 'active';
}

export function getStatusLabel(status: MembershipStatus): string {
  switch (status) {
    case 'active': return 'Active';
    case 'expiring_soon': return 'Expiring Soon';
    case 'expired': return 'Expired';
    case 'inactive': return 'Inactive';
  }
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'paid': return 'Paid';
    case 'pending': return 'Pending';
    case 'due': return 'Due';
  }
}

export function getDaysRemainingText(expiryDate: string, isActive: boolean): string {
  if (!isActive) return 'Inactive';
  const days = daysUntilExpiry(expiryDate);
  if (days === 1) return 'Expires Tomorrow';
  if (days === 0) return 'Expires Today';
  if (days < 0) return `${Math.abs(days)} Days Overdue`;
  return `${days} Days Remaining`;
}

export function getMembershipTypeLabel(type: MembershipType): string {
  switch (type) {
    case 'gym': return 'Gym';
    case 'boxing': return 'Boxing';
    case 'gym_boxing': return 'Gym + Boxing';
  }
}

export function getDurationLabel(value: number, unit: DurationUnit): string {
  const unitLabel = unit === 'days' ? 'Day' : unit === 'weeks' ? 'Week' : unit === 'months' ? 'Month' : 'Year';
  return `${value} ${unitLabel}${value > 1 ? 's' : ''}`;
}

export function calculateExpiryDate(startDate: string, durationValue: number, durationUnit: DurationUnit): string {
  const date = new Date(startDate + 'T00:00:00');
  if (durationUnit === 'days') {
    date.setDate(date.getDate() + durationValue);
  return toDateStr(date);
  }
  if (durationUnit === 'weeks') {
    date.setDate(date.getDate() + durationValue * 7);
    return toDateStr(date);
  }
  if (durationUnit === 'months') {
    date.setMonth(date.getMonth() + durationValue);
    date.setDate(date.getDate() - 1);
    return toDateStr(date);
  }
  // years
  date.setFullYear(date.getFullYear() + durationValue);
  date.setDate(date.getDate() - 1);
  return toDateStr(date);
}

function toDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getGreeting(): string {
  const hour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  const h = parseInt(hour);
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function getRelativeDateLabel(dateStr: string): string {
  const today = todayInKolkata();
  const yesterday = new Date(new Date(today + 'T00:00:00').getTime() - 86400000);
  const yStr = toDateStr(yesterday);
  if (dateStr === today) return 'Today';
  if (dateStr === yStr) return 'Yesterday';
  return formatDate(dateStr);
}
