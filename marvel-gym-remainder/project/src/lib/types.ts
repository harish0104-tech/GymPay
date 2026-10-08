export type MembershipType = 'gym' | 'boxing' | 'gym_boxing';
export type DurationUnit = 'days' | 'weeks' | 'months' | 'years';
export type MembershipStatus = 'active' | 'expiring_soon' | 'expired' | 'inactive';
export type PaymentStatus = 'paid' | 'pending' | 'due';
export type ReminderType = 'one_day_before_expiry' | 'on_expiry_date';
export type ReminderChannel = 'in_app' | 'whatsapp';
export type ReminderStatus = 'scheduled' | 'pending' | 'sent' | 'failed' | 'skipped';

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Gym {
  id: string;
  name: string;
  logo_url: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_whatsapp_number: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  gym_id: string;
  name: string;
  membership_type: MembershipType;
  price: number;
  duration_value: number;
  duration_unit: DurationUnit;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  gym_id: string;
  name: string;
  phone: string;
  photo_url: string | null;
  membership_type: MembershipType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  gym_id: string;
  member_id: string;
  plan_id: string;
  start_date: string;
  expiry_date: string;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
  plan?: Plan;
  member?: Member;
}

export interface Payment {
  id: string;
  gym_id: string;
  member_id: string;
  membership_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  member?: Member;
  membership?: Membership;
}

export interface Reminder {
  id: string;
  gym_id: string;
  member_id: string;
  membership_id: string;
  reminder_type: ReminderType;
  scheduled_date: string;
  channel: ReminderChannel;
  status: ReminderStatus;
  message: string | null;
  sent_at: string | null;
  failure_reason: string | null;
  created_at: string;
  member?: Member;
  membership?: Membership;
}

export interface NotificationSettings {
  id: string;
  gym_id: string;
  owner_whatsapp_number: string | null;
  whatsapp_enabled: boolean;
  one_day_before_enabled: boolean;
  expiry_day_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type NotificationChannel = 'in_app' | 'browser_push';
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface NotificationDeliveryLog {
  id: string;
  reminder_id: string;
  gym_id: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  attempt_count: number;
  provider_message_id: string | null;
  error_message: string | null;
  payload: Record<string, unknown>;
  attempted_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}
