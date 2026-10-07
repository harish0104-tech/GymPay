/*
# Seed Sample Data Function

Creates a SECURITY DEFINER function that seeds demo members, plans, and payments
for a given gym. Called after onboarding when the user opts to load sample data.

## Security
- SECURITY DEFINER so it can insert related records in one transaction
- Verifies the caller owns the gym before seeding
- Returns void on success
*/

CREATE OR REPLACE FUNCTION seed_sample_data(p_gym_id uuid)
RETURNS void AS $$
DECLARE
  v_plan_gym uuid;
  v_plan_boxing uuid;
  v_plan_both uuid;
  v_member1 uuid;
  v_member2 uuid;
  v_member3 uuid;
  v_member4 uuid;
  v_member5 uuid;
  v_member6 uuid;
  v_mbr1 uuid;
  v_mbr2 uuid;
  v_mbr3 uuid;
  v_mbr4 uuid;
  v_mbr5 uuid;
  v_mbr6 uuid;
  v_today date := CURRENT_DATE;
  v_tomorrow date := CURRENT_DATE + 1;
  v_yesterday date := CURRENT_DATE - 1;
  v_last_month date := CURRENT_DATE - interval '1 month';
BEGIN
  -- Verify ownership
  PERFORM 1 FROM gyms WHERE id = p_gym_id AND owner_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to seed data for this gym';
  END IF;

  -- Create plans
  INSERT INTO plans (gym_id, name, membership_type, price, duration_value, duration_unit, is_active)
  VALUES
    (p_gym_id, 'Monthly Gym', 'gym', 1200, 1, 'months', true),
    (p_gym_id, 'Monthly Boxing', 'boxing', 1500, 1, 'months', true),
    (p_gym_id, 'Gym + Boxing Monthly', 'gym_boxing', 2000, 1, 'months', true)
  RETURNING id INTO v_plan_gym, v_plan_boxing, v_plan_both;

  -- Member 1: Pranjeevan — Active, expires in 12 days
  INSERT INTO members (gym_id, name, phone, membership_type, is_active)
  VALUES (p_gym_id, 'Pranjeevan', '9876543210', 'gym', true)
  RETURNING id INTO v_member1;

  INSERT INTO memberships (gym_id, member_id, plan_id, start_date, expiry_date, status)
  VALUES (p_gym_id, v_member1, v_plan_gym, v_today - 18, v_today + 12, 'active')
  RETURNING id INTO v_mbr1;

  INSERT INTO payments (gym_id, member_id, membership_id, amount, payment_date, payment_method, status)
  VALUES (p_gym_id, v_member1, v_mbr1, 1200, v_today - 18, 'UPI', 'paid');

  -- Member 2: Karthik — Expiring tomorrow
  INSERT INTO members (gym_id, name, phone, membership_type, is_active)
  VALUES (p_gym_id, 'Karthik', '9876501234', 'boxing', true)
  RETURNING id INTO v_member2;

  INSERT INTO memberships (gym_id, member_id, plan_id, start_date, expiry_date, status)
  VALUES (p_gym_id, v_member2, v_plan_boxing, v_today - 29, v_tomorrow, 'expiring_soon')
  RETURNING id INTO v_mbr2;

  INSERT INTO payments (gym_id, member_id, membership_id, amount, payment_date, payment_method, status)
  VALUES (p_gym_id, v_member2, v_mbr2, 1500, v_today - 29, 'Cash', 'paid');

  -- Member 3: Arjun — Expired yesterday (payment due)
  INSERT INTO members (gym_id, name, phone, membership_type, is_active)
  VALUES (p_gym_id, 'Arjun', '9123456780', 'gym', true)
  RETURNING id INTO v_member3;

  INSERT INTO memberships (gym_id, member_id, plan_id, start_date, expiry_date, status)
  VALUES (p_gym_id, v_member3, v_plan_gym, v_today - 31, v_yesterday, 'expired')
  RETURNING id INTO v_mbr3;

  INSERT INTO payments (gym_id, member_id, membership_id, amount, payment_date, payment_method, status)
  VALUES (p_gym_id, v_member3, v_mbr3, 1200, v_today - 31, 'UPI', 'paid');

  -- Member 4: Priya — Pending payment
  INSERT INTO members (gym_id, name, phone, membership_type, is_active)
  VALUES (p_gym_id, 'Priya', '9988776655', 'gym_boxing', true)
  RETURNING id INTO v_member4;

  INSERT INTO memberships (gym_id, member_id, plan_id, start_date, expiry_date, status)
  VALUES (p_gym_id, v_member4, v_plan_both, v_today - 5, v_today + 25, 'active')
  RETURNING id INTO v_mbr4;

  INSERT INTO payments (gym_id, member_id, membership_id, amount, payment_date, payment_method, status)
  VALUES (p_gym_id, v_member4, v_mbr4, 2000, v_today - 5, null, 'pending');

  -- Member 5: Vikram — Inactive
  INSERT INTO members (gym_id, name, phone, membership_type, is_active)
  VALUES (p_gym_id, 'Vikram', '9000111222', 'gym', false)
  RETURNING id INTO v_member5;

  INSERT INTO memberships (gym_id, member_id, plan_id, start_date, expiry_date, status)
  VALUES (p_gym_id, v_member5, v_plan_gym, v_today - 60, v_today - 30, 'inactive')
  RETURNING id INTO v_mbr5;

  INSERT INTO payments (gym_id, member_id, membership_id, amount, payment_date, payment_method, status)
  VALUES (p_gym_id, v_member5, v_mbr5, 1200, v_today - 60, 'Cash', 'paid');

  -- Member 6: Sneha — Active, expires in 20 days, Gym + Boxing
  INSERT INTO members (gym_id, name, phone, membership_type, is_active)
  VALUES (p_gym_id, 'Sneha', '9445566778', 'gym_boxing', true)
  RETURNING id INTO v_member6;

  INSERT INTO memberships (gym_id, member_id, plan_id, start_date, expiry_date, status)
  VALUES (p_gym_id, v_member6, v_plan_both, v_today - 10, v_today + 20, 'active')
  RETURNING id INTO v_mbr6;

  INSERT INTO payments (gym_id, member_id, membership_id, amount, payment_date, payment_method, status)
  VALUES (p_gym_id, v_member6, v_mbr6, 2000, v_today - 10, 'Card', 'paid');

  -- Add historical payment for Pranjeevan (previous month)
  INSERT INTO payments (gym_id, member_id, membership_id, amount, payment_date, payment_method, status)
  VALUES (p_gym_id, v_member1, v_mbr1, 1200, v_last_month, 'Cash', 'paid');

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
