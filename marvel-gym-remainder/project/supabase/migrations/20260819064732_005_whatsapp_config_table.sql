/*
# WhatsApp API Configuration Table

Stores WhatsApp Business API credentials per gym so the edge function can read them server-side.

## 1. New Table
- `whatsapp_config`: gym_id, access_token, phone_number_id, api_version

## 2. Security
- RLS enabled, scoped through gym ownership
- Only the gym owner can read/write their WhatsApp credentials

## 3. Notes
- The edge function reads these using the service role key (bypasses RLS)
- The frontend can write credentials but the token is never exposed in client-side code
- API version defaults to v21.0 (current Meta WhatsApp Cloud API version)
*/

CREATE TABLE IF NOT EXISTS whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL UNIQUE REFERENCES gyms(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  phone_number_id text NOT NULL,
  api_version text NOT NULL DEFAULT 'v21.0',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_whatsapp_config" ON whatsapp_config;
CREATE POLICY "select_own_whatsapp_config" ON whatsapp_config FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = whatsapp_config.gym_id AND gyms.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_whatsapp_config" ON whatsapp_config;
CREATE POLICY "insert_own_whatsapp_config" ON whatsapp_config FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = whatsapp_config.gym_id AND gyms.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_whatsapp_config" ON whatsapp_config;
CREATE POLICY "update_own_whatsapp_config" ON whatsapp_config FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = whatsapp_config.gym_id AND gyms.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = whatsapp_config.gym_id AND gyms.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_whatsapp_config" ON whatsapp_config;
CREATE POLICY "delete_own_whatsapp_config" ON whatsapp_config FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM gyms WHERE gyms.id = whatsapp_config.gym_id AND gyms.owner_user_id = auth.uid()));
