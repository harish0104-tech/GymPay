# Marvel Fitness Culture — Multi-Gym Sale Readiness Plan

**Audit date:** 15 September 2026  
**Reviewed scope:** React/Vite web app, Expo Android/iOS wrapper, Supabase schema and migrations, authentication, payments, memberships, storage, scheduled reminders, Firebase/Expo push setup, PWA behavior, and build configuration.

## Executive decision

**The app is not ready to sell as a self-service product to multiple gyms yet.** It is suitable for demonstrations with fictional data. It can become suitable for a small, supervised pilot after the P0 items in this document are fixed and verified. Do not onboard unrelated paid gyms or promise reliable accounting and reminders in the current state.

| Release level | Current decision | Requirement to proceed |
| --- | --- | --- |
| Demo with fictional data | Ready | Use a separate demo tenant and resettable data |
| Pilot with one cooperative gym | Not yet | Complete every P0 item and pilot acceptance tests |
| Multiple paid gyms | Not ready | Complete P0 and P1, add tenant roles, billing, operations, and legal controls |
| Public app-store launch | Not ready | Complete release, privacy, support, monitoring, and store review work |

The product has a useful base: owner authentication, plans, members, memberships, payments, responsive screens, notification preferences, a scheduled notification queue, Expo/Firebase device registration, and owner-scoped row-level security on the main tables. The remaining work is mostly security, data correctness, reliability, tenancy, and operations.

## Verification performed

| Check | Result | Meaning |
| --- | --- | --- |
| Web `npm run typecheck` | **Passed** | Web TypeScript compiles |
| Web `npm run build` | **Passed** | Vite production build completes |
| Web `npm run lint` | **Failed: 24 errors, 9 warnings** | Release quality gate is not clean |
| Mobile `npm run typecheck` | **Passed** | Expo wrapper TypeScript compiles |
| Mobile `npm run build:bundles` | **Passed** | Android and iOS bundles export successfully |
| Mobile notification tests | **Passed: 4/4** | Bridge validation and local notification behavior pass covered cases |
| Real scheduled notification | **Limited evidence** | A user-provided Android screenshot shows a 9:00 notification, but does not prove scheduler, retry, receipt, or multi-device reliability |
| Two-account tenant attack test | **Not performed** | Live tenant isolation is not proven |
| Clean database migration replay | **Not performed** | A fresh environment is not proven reproducible |
| Backup restoration drill | **Not performed** | Recoverability is not proven |

Build success only proves that the code compiles. It does not prove payment correctness, tenant isolation, reliable push delivery, or production operations.

## P0 — Must fix before any real-data pilot

### 1. Isolate member photos

The `member-photos` bucket is created as public. Current policies allow any authenticated user to insert, read, update, or delete any object in that bucket without proving that the path belongs to their gym.

**Required change**

- Make the bucket private.
- Store objects under a validated path such as `<gym_id>/<member_id>/<uuid>.jpg`.
- Add storage policies that derive the signed-in user's permitted gym and validate the first path segment.
- Return short-lived signed URLs for display.
- Migrate existing public URLs and delete orphan objects safely.

**Acceptance test:** owner B cannot list, read, upload, replace, or delete owner A's photos, even when B knows the complete object path. Anonymous reads must fail.

### 2. Enforce tenant consistency in the database

Business tables contain `gym_id`, but relationships such as membership → member → plan and payment → member → membership are independent foreign keys. A crafted write can combine identifiers from different gyms while the row-level policy checks only the row's `gym_id`.

**Required change**

- Add composite unique keys such as `(gym_id, id)` to tenant-owned parent tables.
- Replace independent references with composite foreign keys, for example `(gym_id, member_id)` → `members(gym_id, id)`.
- Apply the same rule to plans, memberships, payments, reminders, devices, and notification records.
- Audit existing rows and repair inconsistent records before enabling constraints.
- Add automated tests using two unrelated gym accounts.

**Acceptance test:** cross-gym references fail at database level through direct Supabase API requests and through application flows.

### 3. Secure every notification endpoint

Legacy reminder/dispatch functions use the service-role client. Some paths do not consistently authenticate the caller or prove gym ownership. Any global processing route must be scheduler-only.

**Required change**

- Keep one canonical notification pipeline and retire unused legacy functions.
- Require a strong scheduler secret or platform-native verified scheduler identity for global runs.
- For owner-triggered tests, verify the bearer token and derive the gym from the user session.
- Never accept an arbitrary `gym_id` as authorization.
- Add rate limits, structured logs, request IDs, and safe error responses.

**Acceptance test:** anonymous calls, owner A targeting gym B, and owner calls requesting a global run all return 401/403 without creating notification work.

### 4. Make payment and renewal operations atomic

`MarkAsPaidModal` currently inserts a paid payment, creates a new membership, expires the old membership, activates the member, and updates pending payments in separate browser requests. Several update results are not checked. A failure can leave partial data, and a retry can duplicate money or memberships.

**Required change**

- Decide whether “Mark as paid” settles an existing invoice, records a standalone payment, or renews a membership. Use separate actions when these are different business events.
- Implement each business operation as one authenticated PostgreSQL RPC transaction.
- Add an idempotency key so double-clicks, network retries, and timeouts cannot duplicate a collection or renewal.
- Check every database result and return a complete receipt to the frontend.
- Use one canonical expiry-date function in the database.

**Acceptance test:** inject a failure at every step. The full operation commits exactly once or nothing commits. Paying a ₹1,200 due amount increases collected revenue by exactly ₹1,200.

### 5. Fix the payment form reset defect

The modal attaches its initialization handler to the whole content container. Clicks bubble from fields and buttons, resetting the typed amount, date, and payment method.

**Required change:** initialize fields when the modal opens or the selected membership changes. Remove the container `onClick` reset.

**Acceptance test:** enter a custom amount and date, select UPI, move between all controls, and submit. The exact entered values must persist.

### 6. Unregister push devices on logout

Signing out does not disable the current notification-device binding. A shared phone can continue receiving the previous owner's member information.

**Required change**

- Before sign-out, call an authenticated RPC that disables or removes the current installation token.
- Re-bind the device after the next successful login.
- Clear account-specific in-app notification state and badge counts.
- Verify foreground messages belong to the active user and gym.

**Acceptance test:** after owner A logs out and owner B logs in on the same phone, no notification containing A's member data appears.

### 7. Prove the 9:00 reminder pipeline end to end

A displayed notification proves one delivery, not daily reliability. The current dispatcher can mark a job as sent after the final retry even when every delivery failed, because the final branch does not preserve a terminal failed state.

**Required change**

- Mark a job `sent` only when at least one valid destination succeeds or the explicitly defined in-app fallback succeeds.
- Mark exhausted temporary failures as terminal `failed` and surface them to an operator.
- Check errors from every upsert/update.
- Store provider ticket IDs and, for Expo, query push receipts after submission.
- Monitor the scheduler invocation, jobs created, jobs claimed, device deliveries, disabled tokens, and all-clear results separately.
- Add an authenticated “Send test in 2–3 minutes” flow and show its final delivery status.

**Acceptance test:** cover active app, background app, killed app, offline phone, revoked permission, invalid token, two devices, logout, retry, and no-members-due days. Verify the configured gym timezone rather than the server timezone.

## Frontend work

### P1 — Required for multiple paid gyms

#### Tenant onboarding and access

- Add a clear create-gym/join-gym onboarding flow.
- Add a gym switcher only if a user belongs to more than one gym.
- Add staff invitations with roles such as owner, manager, receptionist, and read-only accountant.
- Hide actions in the UI based on permissions, while keeping the database/backend as the authority.
- Show the active gym name and branch consistently so staff cannot edit the wrong tenant.

#### Billing and entitlements

- Add plan selection, trial state, subscription state, invoices, cancellation, and failed-payment recovery.
- Disable paid features based on server-provided entitlements.
- Show member, branch, staff, storage, and notification limits before the user reaches them.
- Do not rely on frontend-only checks for plan enforcement.

#### Membership and payment correctness

- Separate “collect payment,” “settle due,” “renew membership,” “change plan,” and “correct a record.”
- Show a confirmation containing member, amount, payment date, plan period, and resulting expiry.
- Generate immutable receipt numbers and allow a reversible void/refund flow with a reason.
- Keep an audit trail rather than deleting financial history.
- Use consistent definitions for active, expiring, expired, overdue, paid, partially paid, voided, and refunded.

#### Lists, dashboards, and scale

- Replace fixed record limits with server-side pagination or cursor-based loading.
- Make dashboard totals, cards, filters, and exports use the same backend query definitions.
- Refresh/invalidate caches after every mutation and on returning to a screen.
- Add explicit loading, empty, permission-denied, offline, and retry states.
- Prevent stale tabs from overwriting newer edits by using record versions or updated timestamps.

#### Notifications

- Show permission state, registered device state, last successful delivery, and last error.
- Explain that Android system notification icons are monochrome masks; keep the MFC silhouette legible at small size.
- Let owners choose reminder time and timezone, with a preview of the next run.
- Provide notification history from the canonical delivery tables, not a separate approximation.
- Add retry and “send test” actions only for authorized owners/managers.

#### Mobile application

- Decide whether the WebView wrapper is the supported product or a temporary delivery method.
- If retained, test file uploads, camera permissions, downloads, deep links, Google sign-in, offline behavior, back navigation, process death, and external links.
- Add production error handling for WebView load failures and incompatible web versions.
- Define an EAS Update policy for JavaScript/assets. Native configuration changes such as notification icons, permissions, Firebase files, SDK upgrades, and native libraries still require a new store/build release.
- Remove user-facing update prompts if silent updates are the chosen policy, but keep controlled rollback and minimum-supported-version handling.

#### Accessibility and quality

- Fix all lint failures and make lint a CI gate.
- Add labels, keyboard navigation, visible accessible focus, correct color contrast, and minimum touch target sizes.
- Test common phone widths, tablet, desktop, browser zoom, and long names/numbers.
- Add route-level error boundaries and a support/error reference code.

## Backend work

### P1 — Required for a sellable service

#### One trusted business API

- Move multi-step financial and membership changes into authenticated transactional RPCs or server functions.
- Validate tenant membership, role, input ranges, and record state on the server.
- Require idempotency keys for payments, renewals, invitations, imports, and webhook events.
- Return stable error codes that the frontend can translate into useful messages.

#### Staff and tenant authorization

- Replace the single `gyms.owner_user_id` access model with a `gym_users` membership table.
- Centralize permission checks in carefully reviewed SQL helper functions.
- Keep owner-only operations separate from daily staff tasks.
- Add invite expiry, acceptance, revocation, and ownership transfer.

#### Notifications and jobs

- Consolidate daily generation and delivery around `scheduled_notifications` and per-device delivery records.
- Use claim locking, bounded retries, exponential backoff, terminal failure, and idempotency.
- Record provider response IDs and delivery receipts where supported.
- Alert on missed scheduler runs, growing queues, repeated failures, and zero registered devices.
- Redact tokens, member details, and secrets from logs.

#### Subscription billing

- Integrate a payment provider using hosted checkout where possible.
- Verify webhook signatures and process each event once.
- Store provider customer/subscription IDs, current entitlement, renewal date, grace period, and cancellation state.
- Never store raw card details.
- Decide tax invoice and GST handling with a qualified accountant for the markets where the product is sold.

#### Operations

- Create separate local, staging, and production Supabase projects and credentials.
- Add health checks for authentication, database access, scheduler freshness, queue depth, and push delivery.
- Add centralized exception reporting and structured logs with tenant-safe metadata.
- Define support severity, response targets, maintenance windows, and an incident procedure.
- Add rate limiting and abuse protection to authentication, imports, exports, invitations, and notification tests.

## Database work

### Recommended multi-tenant model

Use one shared application and one shared database with strict tenant isolation. Each gym is a tenant. Offer separate branded binaries only as a premium operational choice because each binary adds credentials, store listings, builds, testing, and support work.

Recommended core tables:

| Table | Purpose |
| --- | --- |
| `gyms` | Tenant identity, timezone, locale, branding, lifecycle status |
| `gym_users` | User membership in a gym, role, status, joined date |
| `gym_invites` | Time-limited staff invitations and intended role |
| `branches` | Optional locations under a gym |
| `plans` | Tenant-owned membership products |
| `members` | Tenant-owned customer records |
| `memberships` | Historical membership periods |
| `invoices` | Amount owed and due state |
| `payments` | Money actually received |
| `payment_allocations` | Links payments to invoices; supports partial payments |
| `scheduled_notifications` | Canonical notification jobs |
| `notification_devices` | User/install token bindings |
| `notification_deliveries` | Per-device attempts and provider results |
| `subscriptions` | The gym's SaaS subscription state |
| `entitlements` | Limits/features derived from subscription |
| `audit_events` | Append-only record of sensitive changes |

### Required database controls

- Put `gym_id NOT NULL` on every tenant-owned row.
- Enforce same-gym parent relationships with composite foreign keys.
- Write RLS against active `gym_users` membership and role, not only ownership.
- Test every table and storage bucket as anonymous, owner A, staff A, owner B, and service role.
- Keep service-role credentials only in trusted server environments.
- Add unique constraints for phone/member identifiers according to the chosen business rule.
- Add indexes that match tenant-scoped filtering and pagination, normally starting with `gym_id`.
- Use `timestamptz` for events and UTC storage; use a gym timezone only when calculating local schedules.
- Use database-side date arithmetic for membership expiry and test month-end/leap-year cases.
- Use soft deletion or explicit archival for financial/audit records; define retention for personal data.

### Migration, backup, and recovery

- Remove environment-specific seed data from production migrations.
- Replay all migrations against an empty database in CI.
- Add a documented rollback or forward-fix procedure for every release.
- Enable automated backups and point-in-time recovery appropriate to the paid plan.
- Perform and record a restoration drill before launch, then repeat it on a schedule.
- Provide tenant export and account deletion workflows, including storage objects and notification tokens.

## Testing required before sale

### Automated tests

- Unit tests for expiry calculation, money rounding, status derivation, notification content, and role decisions.
- Database tests for RLS and storage isolation with two tenants and multiple roles.
- Transaction tests for duplicate submissions and injected failures.
- Integration tests for signup, Google login, gym creation, invitation, member creation, renewal, payment, and logout.
- Notification tests for job creation, claim concurrency, retries, invalid devices, receipts, and timezone behavior.
- End-to-end tests for the critical owner journey on desktop and Android.

### Manual release matrix

| Area | Minimum scenarios |
| --- | --- |
| Authentication | Email, Google, expired session, password recovery, logout, shared device |
| Tenancy | Two unrelated gyms, staff roles, gym switching, direct API attempts |
| Members | Create/edit/archive, photo upload, duplicates, long data, pagination |
| Memberships | Days/weeks/months/years, month-end, leap year, renew/change/cancel |
| Payments | Full/partial, due settlement, duplicate click, failed request, void/refund, totals/export |
| Notifications | Foreground/background/killed/offline, denied permission, invalid token, retry, timezone, all-clear |
| Mobile | Fresh install, upgrade, deep link, back button, camera/gallery, slow/no network |
| Recovery | Restore staging from backup and verify counts/files/auth relationships |

## DevOps and release work

- Add CI for install, typecheck, lint, web build, mobile typecheck/export, database tests, and migration replay.
- Pin supported Node/npm/EAS versions and commit the lockfiles.
- Keep development, staging, and production environment variables separate.
- Store secrets in Supabase/EAS/Vercel secret managers; rotate any secret that has been exposed in screenshots, source control, logs, or chat.
- Add dependency and secret scanning.
- Use release notes, versioning, rollback steps, and a staged rollout.
- Build Android App Bundles for Play Store production; keep APK builds for controlled testing.
- Configure Play Console signing, privacy declarations, data safety form, notification permission explanation, and tester tracks.

## Commercial and legal readiness

- Publish Terms of Service and a Privacy Policy describing member data, photos, notifications, subprocessors, retention, export, and deletion.
- Create a data-processing agreement for gym customers if applicable.
- Define who owns gym/member data and what happens after cancellation.
- Provide an admin-supported export and deletion process before self-service versions exist.
- Create pricing, usage limits, trial terms, refund policy, support channel, and response expectations.
- Obtain legal and accounting review for the countries where the service will be sold.

## Recommended delivery sequence

### Phase 1 — Security and correctness

1. Fix storage isolation and add two-tenant tests.
2. Add tenant-consistent foreign keys and repair existing data.
3. Secure/retire legacy notification functions.
4. Replace payment and renewal browser writes with transactional, idempotent RPCs.
5. Fix payment modal state and device unregistration.

### Phase 2 — Reliable pilot

1. Consolidate notifications and correct terminal retry status.
2. Add delivery receipts, monitoring, and the short-delay test flow.
3. Fix lint, error handling, pagination, stale caches, and inconsistent totals.
4. Create staging, automated CI, migration replay, backups, and a restore drill.
5. Run the complete manual matrix with two test gyms and Android devices.

### Phase 3 — Multi-gym product

1. Add `gym_users`, roles, invitations, and optional branches.
2. Add subscription billing and server-enforced entitlements.
3. Add tenant branding and onboarding.
4. Add audit logs, exports, deletion, and operator tools.
5. Complete legal documents and support procedures.

### Phase 4 — Store and sales launch

1. Run a supervised pilot with one gym for at least one full billing/reminder cycle.
2. Resolve all pilot incidents and reconcile payments against source records.
3. Complete security review and restore drill.
4. Release through staged Play Store testing, then production rollout.
5. Monitor authentication, payments, queue health, delivery failures, crashes, and support tickets.

## Go-live acceptance checklist

The app is ready to sell to multiple gyms only when every item below is evidenced:

- [ ] Two unrelated gym accounts cannot access or alter each other's rows or photos.
- [ ] Staff roles and invitations work and are enforced by RLS/backend checks.
- [ ] Payment and membership operations are transactional and idempotent.
- [ ] Dashboard, payment history, receipts, and exports reconcile exactly.
- [ ] Daily notification scheduling and delivery pass the full device/timezone matrix.
- [ ] Logout reliably removes the previous account's notification binding.
- [ ] All automated checks and lint pass in CI.
- [ ] Migrations replay on an empty staging database.
- [ ] Production backups exist and a restore drill succeeds.
- [ ] Monitoring alerts on missed schedules and failed deliveries.
- [ ] Subscription billing and plan limits are enforced on the server.
- [ ] Privacy, terms, retention, export, deletion, and support processes are published.
- [ ] A supervised pilot completes without unresolved P0/P1 defects.

## Immediate next action

Start with storage isolation and transactional payment/renewal logic. Those issues can expose customer data or corrupt financial records, so adding more branding, white-label builds, or sales automation before fixing them would increase commercial risk. After those changes, create two staging gym accounts and use them for the tenant isolation suite before onboarding a real customer.

