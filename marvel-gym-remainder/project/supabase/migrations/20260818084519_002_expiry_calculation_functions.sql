/*
# Expiry Calculation & Membership Helper Functions

## 1. Functions
- **calculate_expiry_date**: Given a start date, duration value, and unit, returns the expiry date. Handles month lengths, February, leap years correctly using PostgreSQL interval arithmetic.
- **get_current_membership_status**: Given an expiry date and is_active flag, returns the computed membership status (active, expiring_soon, expired, inactive).

## 2. Notes
- Expiry is the day BEFORE the next period starts (e.g. start Apr 1, monthly → expiry Apr 30).
- Uses DATE arithmetic to avoid timezone issues.
- All calculations use Asia/Kolkata date semantics (date-only, no UTC drift).
*/

CREATE OR REPLACE FUNCTION calculate_expiry_date(
  p_start_date date,
  p_duration_value integer,
  p_duration_unit duration_unit_enum
) RETURNS date AS $$
DECLARE
  v_expiry date;
BEGIN
  v_expiry := CASE
    WHEN p_duration_unit = 'days' THEN p_start_date + (p_duration_value || ' days')::interval
    WHEN p_duration_unit = 'weeks' THEN p_start_date + (p_duration_value * 7 || ' days')::interval
    WHEN p_duration_unit = 'months' THEN (p_start_date + (p_duration_value || ' months')::interval) - interval '1 day'
    WHEN p_duration_unit = 'years' THEN (p_start_date + (p_duration_value || ' years')::interval) - interval '1 day'
  END;
  RETURN v_expiry::date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_current_membership_status(
  p_expiry_date date,
  p_is_active boolean,
  p_today date DEFAULT CURRENT_DATE
) RETURNS membership_status_enum AS $$
DECLARE
  v_days_remaining integer;
BEGIN
  IF NOT p_is_active THEN
    RETURN 'inactive';
  END IF;
  
  v_days_remaining := p_expiry_date - p_today;
  
  IF v_days_remaining < 0 THEN
    RETURN 'expired';
  ELSIF v_days_remaining <= 1 THEN
    RETURN 'expiring_soon';
  ELSE
    RETURN 'active';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
