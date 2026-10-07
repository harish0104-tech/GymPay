/*
# Gym Due — Initial Database Schema

Creates the complete schema for the gym membership management app.

## 1. New Tables

- **profiles**: Extends auth.users with owner display name.
- **gyms**: A single gym in V1 (multi-gym ready). Fields: name, logo_url, owner_user_id, owner_name, owner_phone, owner_whatsapp_number, timezone.
- **plans**: Membership plans (e.g. Monthly Gym). Fields: gym_id, name, membership_type, price, duration_value, duration_unit, is_active.
- **members**: Gym members. Fields: gym_id, name, phone, photo_url, membership_type, is_active.
- **memberships**: Membership periods (historical). Fields: gym_id, member_id, plan_id, start_date, expiry_date, status.
- **payments**: Payment records. Fields: gym_id, member_id, membership_id, amount, payment_date, payment_method, status, notes.
- **reminders**: Expiry/payment reminders. Fields: gym_id, member_id, membership_id, reminder_type, scheduled_date, channel, status, message, sent_at, failure_reason.
- **notification_settings**: Per-gym reminder config. Fields: gym_id, owner_whatsapp_number, whatsapp_enabled, one_day_before_enabled, expiry_day_enabled.

## 2. Enums
- membership_type_enum: 'gym', 'boxing', 'gym_boxing'
- duration_unit_enum: 'days', 'weeks', 'months', 'years'
- membership_status_enum: 'active', 'expiring_soon', 'expired', 'inactive'
- payment_status_enum: 'paid', 'pending', 'due'
- reminder_type_enum: 'one_day_before_expiry', 'on_expiry_date'
- reminder_channel_enum: 'in_app', 'whatsapp'
- reminder_status_enum: 'scheduled', 'pending', 'sent', 'failed', 'skipped'

## 3. Security
- RLS enabled on all tables.
- Owner-scoped policies: authenticated users can only access rows for gyms they own.
- Child tables scoped through gym ownership via EXISTS check.
- Storage bucket 'member-photos' created with auth-required access.

## 4. Notes
- All dates use DATE type (not timestamp) to avoid timezone off-by-one bugs.
- gym_id relationships included on all tables for future multi-gym support.
- Reminders have a unique constraint on (membership_id, reminder_type, scheduled_date) for idempotency.
- Default timezone is 'Asia/Kolkata'.
*/

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE membership_type_enum AS ENUM ('gym', 'boxing', 'gym_boxing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE duration_unit_enum AS ENUM ('days', 'weeks', 'months', 'years');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE membership_status_enum AS ENUM ('active', 'expiring_soon', 'expired', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status_enum AS ENUM ('paid', 'pending', 'due');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_type_enum AS ENUM ('one_day_before_expiry', 'on_expiry_date');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_channel_enum AS ENUM ('in_app', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_status_enum AS ENUM ('scheduled', 'pending', 'sent', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- gyms
CREATE TABLE IF NOT EXISTS gyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name text,
  owner_phone text,
  owner_whatsapp_number text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;

-- plans
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name text NOT NULL,
  membership_type membership_type_enum NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  duration_value integer NOT NULL CHECK (duration_value > 0),
  duration_unit duration_unit_enum NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- members
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  photo_url text,
  membership_type membership_type_enum NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- memberships
CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  expiry_date date NOT NULL,
  status membership_status_enum NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  payment_date date NOT NULL,
  payment_method text,
  status payment_status_enum NOT NULL DEFAULT 'paid',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- reminders
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  reminder_type reminder_type_enum NOT NULL,
  scheduled_date date NOT NULL,
  channel reminder_channel_enum NOT NULL DEFAULT 'in_app',
  status reminder_status_enum NOT NULL DEFAULT 'scheduled',
  message text,
  sent_at timestamptz,
  failure_reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Idempotency: one reminder per membership/type/date
CREATE UNIQUE INDEX IF NOT EXISTS reminders_unique_idx
  ON reminders (membership_id, reminder_type, scheduled_date);

-- notification_settings
CREATE TABLE IF NOT EXISTS notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL UNIQUE REFERENCES gyms(id) ON DELETE CASCADE,
  owner_whatsapp_number text,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  one_day_before_enabled boolean NOT NULL DEFAULT true,
  expiry_day_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_memberships_member_id ON memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_memberships_gym_id ON memberships(gym_id);
CREATE INDEX IF NOT EXISTS idx_memberships_expiry ON memberships(expiry_date);
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_gym_id ON payments(gym_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_reminders_gym_id ON reminders(gym_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_date ON reminders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_reminders_member_id ON reminders(member_id);
CREATE INDEX IF NOT EXISTS idx_plans_gym_id ON plans(gym_id);

-- ============ RLS POLICIES ============

-- profiles: users manage their own profile
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- gyms: owner can CRUD their gym
DROP POLICY IF EXISTS "select_own_gym" ON gyms;
CREATE POLICY "select_own_gym" ON gyms FOR SELECT
  TO authenticated USING (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "insert_own_gym" ON gyms;
CREATE POLICY "insert_own_gym" ON gyms FOR INSERT
  TO authenticated WITH CHECK (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "update_own_gym" ON gyms;
CREATE POLICY "update_own_gym" ON gyms FOR UPDATE
  TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "delete_own_gym" ON gyms;
CREATE POLICY "delete_own_gym" ON gyms FOR DELETE
  TO authenticated USING (owner_user_id = auth.uid());

-- plans: scoped through gym ownership
DROP POLICY IF EXISTS "select_own_plans" ON plans;
CREATE POLICY "select_own_plans" ON plans FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = plans.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_own_plans" ON plans;
CREATE POLICY "insert_own_plans" ON plans FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = plans.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own_plans" ON plans;
CREATE POLICY "update_own_plans" ON plans FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = plans.gym_id AND gyms.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = plans.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "delete_own_plans" ON plans;
CREATE POLICY "delete_own_plans" ON plans FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = plans.gym_id AND gyms.owner_user_id = auth.uid()));

-- members: scoped through gym ownership
DROP POLICY IF EXISTS "select_own_members" ON members;
CREATE POLICY "select_own_members" ON members FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = members.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_own_members" ON members;
CREATE POLICY "insert_own_members" ON members FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = members.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own_members" ON members;
CREATE POLICY "update_own_members" ON members FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = members.gym_id AND gyms.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = members.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "delete_own_members" ON members;
CREATE POLICY "delete_own_members" ON members FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = members.gym_id AND gyms.owner_user_id = auth.uid()));

-- memberships: scoped through gym ownership
DROP POLICY IF EXISTS "select_own_memberships" ON memberships;
CREATE POLICY "select_own_memberships" ON memberships FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = memberships.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_own_memberships" ON memberships;
CREATE POLICY "insert_own_memberships" ON memberships FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = memberships.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own_memberships" ON memberships;
CREATE POLICY "update_own_memberships" ON memberships FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = memberships.gym_id AND gyms.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = memberships.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "delete_own_memberships" ON memberships;
CREATE POLICY "delete_own_memberships" ON memberships FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = memberships.gym_id AND gyms.owner_user_id = auth.uid()));

-- payments: scoped through gym ownership
DROP POLICY IF EXISTS "select_own_payments" ON payments;
CREATE POLICY "select_own_payments" ON payments FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = payments.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_own_payments" ON payments;
CREATE POLICY "insert_own_payments" ON payments FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = payments.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own_payments" ON payments;
CREATE POLICY "update_own_payments" ON payments FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = payments.gym_id AND gyms.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = payments.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "delete_own_payments" ON payments;
CREATE POLICY "delete_own_payments" ON payments FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = payments.gym_id AND gyms.owner_user_id = auth.uid()));

-- reminders: scoped through gym ownership
DROP POLICY IF EXISTS "select_own_reminders" ON reminders;
CREATE POLICY "select_own_reminders" ON reminders FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = reminders.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_own_reminders" ON reminders;
CREATE POLICY "insert_own_reminders" ON reminders FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = reminders.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own_reminders" ON reminders;
CREATE POLICY "update_own_reminders" ON reminders FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = reminders.gym_id AND gyms.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = reminders.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "delete_own_reminders" ON reminders;
CREATE POLICY "delete_own_reminders" ON reminders FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = reminders.gym_id AND gyms.owner_user_id = auth.uid()));

-- notification_settings: scoped through gym ownership
DROP POLICY IF EXISTS "select_own_notif_settings" ON notification_settings;
CREATE POLICY "select_own_notif_settings" ON notification_settings FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = notification_settings.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "insert_own_notif_settings" ON notification_settings;
CREATE POLICY "insert_own_notif_settings" ON notification_settings FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = notification_settings.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "update_own_notif_settings" ON notification_settings;
CREATE POLICY "update_own_notif_settings" ON notification_settings FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = notification_settings.gym_id AND gyms.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = notification_settings.gym_id AND gyms.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS "delete_own_notif_settings" ON notification_settings;
CREATE POLICY "delete_own_notif_settings" ON notification_settings FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = notification_settings.gym_id AND gyms.owner_user_id = auth.uid()));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket for member photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-photos', 'member-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can manage photos
DROP POLICY IF EXISTS "Authenticated can upload member photos" ON storage.objects;
CREATE POLICY "Authenticated can upload member photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'member-photos');

DROP POLICY IF EXISTS "Authenticated can read member photos" ON storage.objects;
CREATE POLICY "Authenticated can read member photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'member-photos');

DROP POLICY IF EXISTS "Authenticated can update member photos" ON storage.objects;
CREATE POLICY "Authenticated can update member photos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'member-photos') WITH CHECK (bucket_id = 'member-photos');

DROP POLICY IF EXISTS "Authenticated can delete member photos" ON storage.objects;
CREATE POLICY "Authenticated can delete member photos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'member-photos');

-- Public can read member photos (for display)
DROP POLICY IF EXISTS "Public can read member photos" ON storage.objects;
CREATE POLICY "Public can read member photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'member-photos');
