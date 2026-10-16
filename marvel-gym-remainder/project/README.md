# Gym Pay — multi-tenant gym management app

The browser and React Native app use the same responsive frontend. The native app is an Expo / React Native WebView shell, not a separate copy of the screens.

## Run the website

```powershell
cd E:\PROJECTS\GymPay\marvel-gym-remainder\project
npm ci
npm run dev -- --host 0.0.0.0
```

Open the URL Vite prints. For a physical phone, use the computer's LAN IP and keep both devices on the same network.

## Run the native app

```powershell
cd E:\PROJECTS\GymPay\marvel-gym-remainder\mobile
npm ci
npm start
```

Create `mobile/.env` with `EXPO_PUBLIC_WEB_URL=http://YOUR_COMPUTER_LAN_IP:5173` for local development. Restart Expo after changing it. The shell can infer the development host from Expo. Production requires an explicit HTTPS URL serving the updated website; it never defaults to the old MFC deployment. The website must be running when testing locally. Native app and browser local storage are separate; frontend-only mode does not synchronize devices.

## Demo accounts

All sample accounts use OTP **123456**. Codes expire after five minutes. No SMS is sent. The account associated with the mobile number determines the role; the login has no role selector.

| Role | Mobile | Access |
| --- | --- | --- |
| Super Admin | 9999999999 | Client gym subscriptions and payment summaries |
| Gym Owner | 9999999998 | Full gym administration |
| Gym Staff | 9999999997 | Payments and pending dues only |
| Member | 9000000000 / 9000000001 / 9000000002 | Own membership, attendance and payments |

Existing frontend demo records are migrated on first use. The login screen lists the available accounts. Adding a member creates their local login; adding staff creates a payments-only login. Owners can disable staff accounts.

## Workflows

- Add Member: name, mobile, plan, editable fee, start/expiry, Paid/Pending/Partial, amount received, optional birthday. Paid receives the full fee; Pending receives zero; Partial requires an amount between zero and the fee. Duplicate mobiles and overpayments are rejected.
- Member profile: current membership, start/expiry, fee, receipts, remaining balance, membership status and payment history. Owners can open a prepared WhatsApp message, record payment, and extend membership. WhatsApp sends only after the user sends it in WhatsApp.
- Payments settle the selected membership. Renewals create a distinct period and fee, preserve old balances, and start after the latest booked period. A future renewal does not remove the current period's attendance eligibility.
- Attendance: one check-in and check-out per member per India calendar day, with an active membership required.
- Reports: daily collections, monthly revenue, expenses and net collection. Reminder lists calculate expiry (next seven days), dues, renewals, birthdays and seven-day absences on screen. Queued reminders are deduplicated per day and type.
- Super Admin: separate sample platform billing records for gym clients, rather than member-level gym revenue.

## Demo boundaries

When no production Supabase environment is configured, the app uses the original demo accounts and stores demo data in `localStorage` under `gympay-workflow-v2`; the active demo account is in `sessionStorage`. Demo role checks are not server-side security. Member checkout in demo mode records a simulated payment without transferring money.

## Production SaaS backend foundation

The repository now includes a Supabase/Postgres multi-tenant schema and a server-side staff-account provisioning function. `supabase/migrations/20261016090000_multitenant_core.sql` creates separate gym workspaces, users, plans, members, memberships, payments, attendance, expenses, reminders, settings, and audit events. Row Level Security ties gym data to the signed-in profile; staff access is permission-scoped in the database. The `invite-staff` Edge Function verifies the caller is the gym owner before it provisions or updates a staff identity. The service-role key is used only inside that function and must never be exposed to the website.

To prepare a Supabase project:

1. Copy `.env.example` to `.env` and enter the project's URL and publishable key.
2. Apply the SQL migration with the Supabase CLI (`supabase link`, then `supabase db push`).
3. Set the `GYMPAY_APP_ORIGIN` Edge Function secret to the exact HTTPS website origin and deploy `invite-staff` (`supabase functions deploy invite-staff`). Supabase provides the URL, anon key, and service-role key to deployed functions; keep the service-role key server-side.
4. Enable phone OTP and configure an SMS provider in Supabase Auth before inviting staff or allowing owner signup.

When both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set, the website switches to phone-OTP owner signup/sign-in and loads the signed-in gym's data through Supabase PostgREST. Owner actions are sent through one transactional database RPC protected by RLS. Staff accounts are created or updated through the owner-only Edge Function, and staff access is enforced again by database policies. With no Supabase environment configured, the app remains in local demo mode. Existing demo data is never automatically imported into a production project.

This production foundation currently provisions gym owners and staff. Member authentication, platform-wide administration, subscription billing, payment gateway settlement, WhatsApp/SMS reminders, backups and monitoring still need their respective providers and implementation before launch. The schema and app require a real Supabase project, enabled phone OTP/SMS delivery, an applied migration, and deployed Edge Function; those external services cannot be activated from this workspace.

## Verification

```powershell
npm test
npm run typecheck
npm run build
```

In `mobile`: `npm run typecheck` and `npm run build:bundles`.
