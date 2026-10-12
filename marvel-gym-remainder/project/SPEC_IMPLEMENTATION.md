# Gym Pay specification implementation

Source: GymPay_Dashboard_Requirements_Development_Specification.pdf (14 pages).
Scope agreed with user: frontend demo, shared responsive website rendered in the Expo React Native shell. No backend restored. Demo OTP is 123456. Data persists on the current device/browser only; native and desktop do not synchronize.

## Implemented workflows

- Super Admin: overview and normalized MRR, gym directory and filters, subscription status/plan/trial end overrides with reasons, account directory, separate SaaS revenue ledger, aggregate messaging, support queue, platform policy and audit trail. No member personal records shown in platform tables.
- Owner: dashboard, member search/status/plan/join date filters, member profiles with personal details, period history, ledger/receipts, attendance, reminders and change history. Add member supports paid/pending/partial fees. Plans can be edited or deactivated without changing historical membership fees.
- Payments: offline entries with method/date/reference/recorder/source, pending demo checkout with explicit success/failure/cancel outcomes, idempotent completion, overpayment prevention, owner-only reasoned refund/void, retained ledger and audit entries. PDF receipts mask references.
- Renewals: new periods retain old balances, optional owner discount with reason, optional payment, no automatic extension from a checkout outcome.
- Staff: payment-first default, owner-configured member/attendance/renewal/reminder permissions, own collection summary, no financial corrections or owner settings.
- Member: own membership and days remaining, fee checkout simulation, payment/receipt history, manual attendance, profile contact fields, renewal request requiring approval, notifications and support.
- Operations: reminder windows, recipient review, consent, duplicate suppression, simulated failure/retry limit, local support tickets, expenses, gym settings, SaaS billing/help and subscription access restrictions.
- Reports: date ranges, collections gross/refund/net, methods, staff, dues, membership status, attendance and plan popularity. CSV/XLSX/PDF downloads. Native exports use a validated WebView message and operating-system share sheet.
- Responsive shared layout, phone drawer/bottom navigation, horizontally scrollable paginated tables, labeled controls, empty states and error messages.

## Deliberate frontend limits / production work remaining

- Real OTP, recovery, session expiry/rate limits, tenant isolation and authorization must run on a server. Local role checks are demo behavior and are not a security boundary.
- Payment gateway checkout, signed webhooks, settlement, real refunds, invoices/tax calculation and subscription proration are not connected. Demo receipts must not be treated as proof of a bank transfer.
- WhatsApp template approval, delivery webhooks, provider quotas, scheduled reminders, daily report delivery, consent evidence and background queues require backend services. Queueing never sends a message here.
- Secure rotating QR, biometric/device verification and attendance anti-spoofing are not implemented. Attendance is clearly labeled manual demo.
- Backups, centralized audit immutability, concurrency, cross-device synchronization, server monitoring, billing reconciliation and data retention require backend implementation.
- Platform charts do not invent historical churn/growth. No historical subscription event dataset is available. Platform revenue exports currently support CSV; richer platform PDF/XLSX exports and detailed subscription invoices remain extensions. Gym reports support all three formats.
- Plan durations currently use whole months; currency is INR. Gym logo upload, fine-grained discount approval thresholds, real notification preference delivery and avatar upload remain extensions.
- Native implementation shares the web workflow through WebView; it is not a rewrite into independent native screen components.

## Validation

15 automated domain tests cover role menus, partial payments, validation, tenant/member boundaries, attendance, date edges, renewals, absences, refund reconciliation, pending/idempotent checkout, configurable permissions, read-only/suspended subscriptions, reminder consent/deduplication/retry and historical plan prices. TypeScript and production web build pass. Expo Android and iOS JavaScript bundles export successfully. Physical-device installation and share-sheet execution have not been tested. Browser XLSX download verification was declined and was not retried.

## Role content update

Owner retains the reference dashboard and adds expired memberships, collection by method, configurable expiry window, attendance target, reminder failures and billing attention. Staff has a dedicated counter dashboard with own collection reconciliation, permission-based quick actions, recent arrivals, profile and notifications. Member has scoped home, membership and approval-based renewal selection, dues with due dates, checkout state recovery, receipt history, attendance, editable contact/consent fields, notifications and support. Super Admin gym detail tabs show account information, recorded plan changes, subscription payments, integration status, support and audit history. Unavailable provider data is labeled unavailable rather than represented as delivered messages.


Role-content validation: Owner desktop content, Staff phone layout, Member membership and renewal screens, and Super Admin gym detail tabs were inspected in the browser. Staff and Member 390px views have no horizontal page overflow.

