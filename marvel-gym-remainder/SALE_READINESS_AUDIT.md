# Sale-readiness audit — Marvel Fitness Culture

Date: 8 September 2026

## Decision

**Not ready for an unrestricted paid launch or a production-ready handover.** The application has a usable frontend and real membership workflows, but source inspection identifies defects in financial correctness, tenant isolation, notification delivery, and operational reliability.

Use fictional data for demonstrations now. Start a supervised real-data pilot only after the security, payment, and notification blockers below are fixed and tested. Do not promise guaranteed reminders, accounting accuracy, or a fully supported product based on the build passing.

## Scope and evidence limits

This is a repository-based review of the frontend workflows, shared utilities, authentication, storage policies, database schema and migration evolution, all three notification functions, PWA update logic, and deployment configuration. Important findings were traced across callers and database definitions. It is not a certification that every runtime path is correct.

No production database was modified, no real reminders were dispatched, and no destructive or cross-account exploit was attempted. Production RLS policies, deployed functions, secrets, cron execution, backups, and mobile delivery remain unverified. Findings about SQL describe the supplied migration definitions; live exposure depends on what has actually been deployed.

### Checks executed

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed; covers `src`, not a Deno typecheck of Edge Functions |
| `npm run build` | Passed; approximately 504 KB main JavaScript, with Vite's chunk-size warning |
| `npm run lint` | Failed: **23 errors, 7 warnings** |
| Automated functional/security suite | No such test suite or test script identified in the supplied repository |
| Authenticated multi-account browser test | Not performed |
| Fresh database migration replay | Not performed; a blocking seed migration was identified statically |
| Real push delivery / restore drill | Not performed |

The source is enough to justify a no-go decision even without a live exploit or device test. Fixing lint alone will not resolve the substantive issues.

## What is already useful

- Owner login, gym provisioning, plans, member profiles, and photos.
- Membership expiry and renewal UI.
- Payment records, filters, and summaries.
- Responsive Dashboard and navigation.
- Owner-scoped RLS on the main business tables.
- Reminder previews, explicit empty/error states, and notification-device registration.
- A scheduled notification queue with claim locking, per-device records, and intended retry handling.
- Build metadata and a service worker.

These are a good starting point for a small-gym product. The remaining work is primarily correctness and reliability, not another visual redesign.

## P0 — Security blockers

### 1. Photo storage is not isolated by gym

**Evidence:** `project/supabase/migrations/20260818084505_001_initial_schema.sql:337–360`. The bucket is public. Read policies allow bucket-wide access; authenticated update/delete policies check only the bucket ID, not gym ownership. Later photo migrations change size limits rather than replacing this access model. Uploads use a gym-ID path in `AddMemberModal.tsx`, but the SQL does not enforce ownership of that path.

**Impact:** Under these policies, another authenticated account can target another gym's photo objects, and public URLs expose images without an owner session. This is not equivalent to verified isolation of member photos.

**Fix:** Make the bucket private; authorize every operation by the owning gym encoded in a validated path; remove broad permissive policies; use authenticated downloads or short-lived signed URLs. Plan migration of stored public URLs and cleanup of orphan uploads.

**Acceptance:** With two test accounts, B cannot list/read/upload/replace/delete A's objects, and anonymous access fails. A can still view and replace its photos.

### 2. Legacy notification endpoints do not consistently authorize callers

**Evidence:** `daily-reminders/index.ts` checks authentication only when `gym_id` is supplied. Omitting that field enters all-gym processing with a service-role client. `dispatch-notifications/index.ts` checks method but contains no caller/ownership verification before service-role processing.

**Impact:** A callable endpoint can permit a user to trigger work outside their gym. Gateway JWT validation is not a substitute for owner authorization; actual anonymous reachability depends on deployed gateway settings.

**Fix:** Authenticate every invocation. Require a verified scheduler credential for global runs, or derive an owner's gym from their verified session. Restrict method and scope, add rate limits, and retire unused legacy endpoints once consumers migrate.

**Acceptance:** Anonymous calls, owner A specifying gym B, and owner calls omitting gym scope cannot dispatch global work. Only the scheduler can perform a global run. Test without contacting real recipients.

### 3. Child references are not constrained to the same tenant

**Evidence:** Initial schema memberships/payments/reminders use independent `gym_id`, `member_id`, and related foreign keys. Their write policies validate the row's gym ownership but do not validate that referenced members, plans, and memberships belong to that gym. No composite tenant constraints were identified in subsequent migrations.

**Impact:** A crafted write can produce inconsistent cross-gym references when another record ID is known. Service-role notification processing then trusts these relationships. This is a data-integrity and potential disclosure issue, not proof that all table reads bypass RLS.

**Fix:** Add composite unique keys and tenant-consistent foreign keys, or equivalent database validation. Apply ownership checks inside transactional RPCs and verify existing records before enabling constraints.

**Acceptance:** Cross-gym references are rejected at database level even through direct API requests. Normal same-gym writes continue to work.

### 4. Logout does not detach push delivery from a shared device

**Evidence:** `AuthContext.tsx:133` signs out without disabling the registered notification device. FCM dispatch selects enabled devices for the old owner. The registration RPC can reassign a token when explicitly registered, but simply signing out does not revoke it. Foreground subscription setup is not scoped to the currently authenticated user.

**Impact:** A shared phone/browser may continue receiving the previous owner's member information after logout.

**Fix:** Define and implement device binding on login/logout; revoke or disable the old binding before losing authorization, handle failure, clear account-specific badge/state, and ensure foreground messages match the active account.

**Acceptance:** After A signs out and B signs in, A's reminders never display to B. Test both foreground and closed-app delivery.

## P1 — Payment and membership blockers

### 5. Mark as Paid can count the same collection twice

**Evidence:** `MarkAsPaidModal.tsx:40` inserts a paid record. Lines 75 onward also change existing pending records for the old membership to paid.

**Example:** A ₹1,200 pending entry becomes paid and another ₹1,200 paid entry is inserted. Totals can show ₹2,400 for one ₹1,200 collection.

**Fix:** Model a collection once: settle the existing receivable, or maintain separate invoices and payment allocations. Do not count a pending placeholder and a new receipt as two collections. Support a unique operation key for retries.

**Acceptance:** Settle a pending ₹1,200 amount and verify collected total increases by exactly ₹1,200, including double-click, timeout, and retry cases.

### 6. Payment form resets user-entered details on clicks

**Evidence:** `MarkAsPaidModal.tsx:101` attaches `onClick={handleOpen}` to the entire form. `handleOpen` resets amount, date, and payment method. Child clicks bubble to it.

**Impact:** Selecting UPI can be reset to Cash; clicking another field can replace a typed amount/date.

**Fix:** Initialize on modal opening or selected membership change using lifecycle/state logic, not a container click handler. Reset only when intended.

**Acceptance:** Enter a custom amount, earlier date, and UPI; move between controls and submit. Persist exactly those values.

### 7. Saving and renewing are not atomic

**Evidence:** Add Member uploads a photo and inserts member, membership, and payment separately; payment insert errors are not checked before success. Mark as Paid writes payment, creates a membership, and changes old records in separate requests; several errors are ignored. Member editing also performs separate related writes.

**Impact:** Failure leaves partial records; a retry can duplicate members, memberships, or collections. An owner may see success despite a missing payment.

**Fix:** Use transactional server/database operations with verified ownership, validation, and idempotency keys. Stage photos separately and clean up on failure. Return explicit results and handle every error.

**Acceptance:** Inject failure at every step. Either the whole business operation commits once or nothing commits, apart from safely cleaned staging objects.

### 8. Paying an existing debt always creates a renewal

**Evidence:** Mark as Paid sets `newStartDate` to today, creates a new membership, expires the previous one, and links the payment to the previous membership. It updates pending records but not due records.

**Impact:** Paying late for an existing period grants a new period; early renewal can discard remaining days. Payment and renewal history become ambiguous.

**Fix:** Separate **Record payment** from **Renew membership**. Specify start-date rules for early and late renewal; allow an explicit start date where appropriate. Allocate payment to the intended obligation/period. Define partial payments and discounts or clearly reject them.

**Acceptance:** Test early renewal, late renewal, paying debt without renewal, partial payment, and zero-price plans against written business rules.

### 9. Expiry calculation differs between frontend and database

**Evidence:** `utils.ts:91` uses JavaScript `setMonth`; SQL `calculate_expiry_date` uses PostgreSQL interval arithmetic. JavaScript can overflow at month ends. The add/payment/edit flows also use `toISOString().slice(0,10)` while reminders use Kolkata dates.

**Example:** A one-month membership starting 31 January 2026 rolls into March in JavaScript before the one-day subtraction, unlike PostgreSQL's month clamp. Before 05:30 IST, a UTC-derived current date is the previous calendar day.

**Fix:** Define inclusive/exclusive date rules and use one tested calendar implementation, preferably server authoritative. Use date-only Kolkata semantics consistently. Add database validation for start/expiry order and plan compatibility.

**Acceptance:** Frontend and backend agree for 28–31 January, leap-day starts, day/week plans, and midnight IST.

### 10. Editing unrelated member details can change expiry

**Evidence:** `EditMemberModal` initializes `manualExpiry` false and recalculates when the plan loads, even when an existing membership has a manually entered expiry.

**Impact:** Opening Edit to change a phone/name and saving can overwrite a custom expiry.

**Fix:** Preserve existing dates until the user explicitly changes the plan/start date or selects recalculate.

**Acceptance:** Edit only a name on a custom-expiry member; expiry remains identical.

## P1 — Reminder correctness blockers

### 11. Automatic notifications and visible history use different stores

**Evidence:** FCM dispatch writes `in_app_notifications`, `scheduled_notifications`, and `scheduled_notification_deliveries`. `RemindersPage.tsx` reads `reminders` and `notification_delivery_logs`, and Send Now calls legacy `daily-reminders`. No frontend reader for the new in-app history was found.

**Impact:** Automatic push may be sent while Sent stays empty; Failed may omit actual FCM failures. UI previews improve visibility but do not resolve delivery-history consistency.

**Fix:** Choose a canonical notification pipeline and history model. Route automatic and manual sends through it, map old history, and expose per-channel/device outcomes. Retire duplicate schedules and document the final architecture.

**Acceptance:** One automatic event produces one visible history item with accurate status; manual retry updates it without sending twice to already successful devices.

### 12. Final FCM retry failure is incorrectly marked sent

**Evidence:** `send-due-notifications/index.ts` only enters its failure branch when `temporaryFailure && job.attempts < 3`; otherwise it marks the job sent. Thus a temporary failure on attempt three goes to sent. All invalid-device responses can also reach sent with no successful push.

**Fix:** Keep terminal failure distinct from success, partial success, and in-app-only delivery. Record successful device count; persist terminal errors and add controlled retry tooling.

**Acceptance:** Mock three provider failures: the final result is failed, never sent. Test zero devices, all invalid tokens, mixed success, and recovery separately.

### 13. Dispatch exceptions and ignored persistence errors compromise history

**Evidence:** Firebase OAuth occurs before writing in-app records; outer dispatch lacks a recovery catch. Network exceptions can interrupt a batch after claims. Many database writes and device-query errors are unchecked. The claim function eventually recovers stale claims but attempts are capped.

**Fix:** Save in-app outcomes independently, validate every persistence result, isolate jobs with try/catch, make retries observable, and distinguish no devices from a failed device query. Handle provider configuration errors without losing in-app visibility.

**Acceptance:** OAuth failure, database failure, network timeout, and one poisoned job cannot silently lose the whole batch or report false success.

### 14. Latest-membership and notification-preference rules are inconsistent

**Evidence:** Migration 036's daily producer scans all memberships expiring today without selecting the latest or excluding cancelled/inactive membership status. The membership trigger schedules based on membership status but does not consult the member active flag or expiry-day setting. The worker does not revalidate eligibility before sending. Today's all-clear event can become stale if a due member is added later.

**Impact:** Renewed/inactive members or disabled reminders can still generate notifications, while the UI's latest-membership preview shows something different.

**Fix:** Centralize current-membership eligibility; revalidate before dispatch; reconcile queued events after renewal, deactivation, setting changes, and late additions. Cancel obsolete all-clear events.

**Acceptance:** Create a due membership, renew or deactivate it before dispatch, and confirm no obsolete reminder. Repeat with reminders disabled and a late-added due member.

## P1/P2 — Data consistency and operations

### 15. Dashboard and list filters disagree

Dashboard Active counts `members.is_active`, while Members Active requires computed membership status active. Dashboard expired/due includes today; Members Expired excludes today. Category counts consider active members while corresponding filters can include inactive members. Members Pending currently filters expired memberships rather than payment state.

**Fix:** Establish definitions for each metric and use shared backend queries. Each card's number must equal the linked list's count on the same data snapshot.

### 16. Cached pages remain stale after mutations

`App.tsx` keeps visited pages mounted. Member-profile edits/renewals refresh only the profile. Add Member remounts Dashboard/Members but not Payments. Other mounted views do not automatically reload when revisited.

**Fix:** Use centralized query invalidation after mutations, including plans, payments, members, and summaries; refresh on navigation/foreground where needed.

**Acceptance:** Renew, edit, delete, and add a paid member; all relevant pages immediately agree without a browser refresh.

### 17. Record limits can silently hide data

Payments explicitly loads only 1,000 entries before client filtering; Members and Dashboard use unpaginated collection queries. Backend response limits can truncate histories and summary inputs. Client-side pagination does not retrieve omitted server rows.

**Fix:** Server-side filtering/pagination and database aggregates; deterministic ordering; test above the configured API row limit. Keep full export independent of the visible page.

### 18. Missing error and unsupported-browser handling

Several pages discard query errors and display empty data. Member Profile displays Loading forever if the record is absent. Auth provisioning failure can leave a null gym without a usable recovery path. `isCurrentFcmDeviceEnabled` references `Notification.permission` before checking whether Notification exists.

**Fix:** Explicit loading/success/empty/not-found/error states, retry actions, and capability guards. Prevent old in-flight responses from replacing newer account/page data. Current Reminders polling also needs a request-order/cancellation guard.

### 19. PWA updates can discard unsaved work

`public/sw.js:79` navigates open clients when activating a new worker even though the app presents an optional refresh prompt.

**Fix:** Remove forced navigation; let the user accept an update after saving, or safely persist and restore drafts.

**Acceptance:** Deploy a new build while a member/payment form is edited; the form remains intact until the user accepts refresh.

### 20. Fresh installation and environment separation are unreliable

Migration `010_seed_tomorrow_expiry_members` raises if no gym exists and injects test data into the first gym otherwise. A fresh migration run can therefore fail before onboarding. Later scheduling SQL contains a hard-coded production Supabase function URL; Firebase frontend/build config has production fallbacks.

**Fix:** Move test data to explicitly invoked development seeds, provide a tested clean-install baseline, parameterize environment endpoints, and fail fast on missing configuration. Preserve already-applied migration history through an intentional migration plan. Disable unintended legacy cron jobs.

**Acceptance:** An empty staging project installs without real users or production calls. A second replay/upgrade behaves predictably. Production and staging have distinct data and credentials.

### 21. Account recovery and data ownership tools are missing

No password-reset/recovery UI was identified. No complete owner export/import or account-deletion workflow was identified. Member deletion cascades payment/history removal, and payment deletion is permanent without an audit/void workflow.

**Fix:** Add account recovery, export and restore procedures, a retention policy, and auditable corrections/archiving. Establish a deliberate account-deletion process and recoverability boundaries. Avoid changing historical financial records silently.

### 22. Accessibility and regression coverage need work

Shared Modal lacks dialog semantics, focus trapping/restoration, and keyboard dismissal. The viewport prevents zoom. Lint failures and absence of automated workflow tests allow critical bugs such as the payment reset to survive.

**Fix:** Accessible dialog behavior, zoom support, readable mobile layouts, and automated tests for financial writes, dates, tenant isolation, navigation invalidation, and notification retries. Add Deno checks for server functions and migration tests in CI.

## Recommended work order

| Stage | Deliverable | Exit condition |
| --- | --- | --- |
| 1. Protect data | Storage policies, endpoint authorization, tenant constraints, logout device handling | Two-account isolation tests pass |
| 2. Correct money and dates | Transactional operations, separate renew/pay, form reset fix, calendar rules | No duplicates/partial saves; date fixtures pass |
| 3. Make reminders trustworthy | One pipeline, correct terminal status, eligibility checks, unified history | Simulated failure matrix and real-device tests pass |
| 4. Reconcile screens | Shared metrics, invalidation, pagination, error handling | Dashboard, profiles, payments, and tabs agree |
| 5. Prepare operations | Clean staging install, recovery, backups/export, safe updates, monitoring | Restore and deployment rehearsals pass |
| 6. Pilot and sell | Supervised owner pilot, support process, written scope | Pilot acceptance signed off with unresolved issues documented |

Do not start by adding attendance or an online payment gateway. Those can be future features; correcting existing promised behavior is the immediate priority.

## Minimum acceptance checklist before taking production customers

- [ ] Gym A/B and anonymous isolation tested across tables, photos, RPCs, and functions.
- [ ] Paid/pending/due accounting verified against known totals.
- [ ] Repeated submits and network failures cannot duplicate business operations.
- [ ] Early/late renewals preserve agreed membership rules.
- [ ] Jan 31, leap day, and Kolkata midnight date tests pass.
- [ ] Automatic and manual notification history reconcile.
- [ ] Failed delivery stays failed after retry exhaustion.
- [ ] Disabled/inactive/renewed cases do not receive obsolete reminders.
- [ ] Android, desktop, and supported iPhone flows tested on real devices, including denied permission and offline/reconnect.
- [ ] Logout prevents previous-owner notifications on a shared device.
- [ ] Today/Upcoming/Sent/Failed tested with zero, one, and many records, plus backend failure.
- [ ] All dashboard card counts match their destination lists.
- [ ] More than 1,000 records remain searchable and totals remain exact.
- [ ] Password recovery and invalid-session recovery work.
- [ ] Backup restored into staging and exported member/payment records verified.
- [ ] New deployment does not destroy unsaved form data.
- [ ] Build, lint, frontend tests, function checks, and migration replay pass in CI.
- [ ] Production cron, secrets, functions, database version, and frontend release are recorded and monitored.
- [ ] Support owner, response expectations, hosting payer, maintenance scope, and data ownership are documented.

## Commercial handover requirements

For a one-time gym licence, specify included features, supported devices, deployment ownership, infrastructure charges, bug-fix period, maintenance renewal, customization charges, and export/offboarding arrangements. Do not promise unlimited support or permanent free hosting.

Provide an owner guide, a notification troubleshooting guide, an environment setup template without secrets, a backup/restore runbook, and a release/rollback checklist. Establish appropriate privacy notices and customer terms with qualified review rather than presenting this technical audit as legal advice.

A staff-role system, attendance, online payments, and multi-branch management are not mandatory for a narrowly scoped first sale, provided the customer does not expect them. Reliable records, isolation, recovery, and truthful reminder status are mandatory for the features already offered.

## Final recommendation

Treat the current product as a **pre-sale MVP**, not finished commercial software. Prioritize the confirmed blockers above, then perform an isolated staging test and a supervised gym pilot. Reassess readiness from test evidence and live configuration, not from visual polish or price estimates.

This audit changed documentation only; the application defects listed here have not been fixed by this audit.
