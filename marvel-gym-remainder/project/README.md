# Gym Pay — shared frontend demo

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

Roles and access checks demonstrate the workflow; they are not server-side security. Data lives in `localStorage` under `gympay-workflow-v2`, and the active demo account is in `sessionStorage`. Real OTP authentication, tenant isolation, online payment verification, background jobs and external notification delivery require a backend. Member checkout clearly records a demo payment without transferring money. No backend was added.

## Verification

```powershell
npm test
npm run typecheck
npm run build
```

In `mobile`: `npm run typecheck` and `npm run build:bundles`.
