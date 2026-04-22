# Deep Audit — 2026-04-22 (Phase 1 findings)

**Auditor:** Michael Burnham (AI)
**Scope:** Beyond the structure audit — data-model coherence, auth flow,
Firestore security posture, UX-glue sanity, inline-script / CSP
implications. This document complements `AUDIT_2026-04-22.md` (structure).

---

## 🔴 SHOW-STOPPER: Firestore security rules unknown

**I cannot read the rules from outside the Firebase project.** This
session's gcloud is authed to a different project (`studio-7107090270-b2521`,
Revenue Curator Pro), not `hamburg-door-ops`.

**Why this is a showstopper:**
- Most new Firebase projects start in **"test mode"**: rules are
  `allow read, write: if request.time < <30 days from now>;` — which
  expires silently and then the app starts 403'ing.
- Or they start in **"production mode"**: rules are
  `allow read, write: if false;` — which means the app can't do anything.
- Or they've been left in test mode past the 30-day expiry, in which case
  they **allowed any internet stranger to read/write every doc** the whole
  time.

**Action required from William:** go to the Firebase Console →
Firestore → Rules and paste back the current `firestore.rules` content.
I'll then:
1. Tell you whether they're safe or not.
2. Check them in to the repo at `firestore.rules` so they're
   version-controlled.
3. Propose a tightened ruleset that matches the actual collections and
   auth model.

**Recommended rules (as a starting point, to paste into Firebase Console
after we confirm what's there now):**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Any signed-in staff can read/write business documents.
    // Later: gate by custom claims (role=admin|dispatch|tech) for real RBAC.
    match /{collection}/{doc}
      where collection in [
        'customers',
        'phone_messages',
        'sales_leads',
        'quotes',
        'work_orders',
        'service_tickets',
        'invoices',
        'counters'
      ] {
      allow read, write: if request.auth != null
                         && request.auth.token.email.matches('.*@hamburgdoor[.]com');
    }

    // Default deny everything else.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Notes:
- The email-domain gate assumes all staff use `@hamburgdoor.com` Google
  accounts. If some use personal Gmail, we'd switch to a `staff` Firestore
  doc + `request.auth.uid in staff` pattern instead.
- `counters` collection needs write access (because `DB.getNewId()` runs a
  transaction on it).

---

## 🔴 Data-model drift (save writes ≠ load reads)

I read every `saveTicket()` and `loadForm()` pair side by side. Several
fields the form **saves** are **not read back** on load, or vice versa —
which means reopening a saved doc silently loses fields.

### Site address: `siteAddress` vs `siteAddress1/siteAddress2` vs `siteAddress/siteAddress2`

| Form | Save field(s) | Load field(s) |
|---|---|---|
| `phone_message.html` | `siteAddress1`, `siteAddress2` | `siteAddress1`, `siteAddress2` | ✅ |
| `sales_call.html` | `siteAddress1`, `siteAddress2` | `siteAddress1`, `siteAddress2` | ✅ |
| `service.html` | `siteAddress1`, `siteAddress2` | `siteAddress1`, `siteAddress2` | ✅ |
| `quote.html` | `siteAddress` (single) | `siteAddress` (single) | ✅ (but schema differs) |
| `work_order.html` | `siteAddress` (single) | `siteAddress` (single) | ✅ (but schema differs) |
| `invoice.html` | — none — | — none — | ✅ (but schema differs) |

**Problem:** two schemas for site address across six forms. When
`quote.html` converts to `work_order`, it copies `siteAddress` → fine.
When `phone_message.html` converts to `quote`, it passes
`siteAddress1`/`siteAddress2` into the `quotes` collection, but
`quote.html`'s load function reads `data.siteAddress` (singular), so
**the site address silently disappears on the next open**.

**Fix:** pick one shape. Recommend `siteAddress1` + `siteAddress2` (two
lines, matches how USPS addresses actually render on paper and lines up
with the rolodex shape). Update `quote.html` and `work_order.html` to
save/load both.

### Account number: `accountId` vs `accountNumber`

| Form | Save | Load |
|---|---|---|
| `phone_message.html` | `accountId` | `accountId` | ✅ |
| `quote.html` | `accountId` | `accountId` | ✅ |
| `invoice.html` | `accountId` | `accountId` | ✅ |
| `sales_call.html` | `accountNumber` | `accountNumber` | ✅ |
| `service.html` | `accountNumber` | `accountNumber` | ✅ |
| `work_order.html` | `accountNumber` | `accountNumber` | ✅ |

**Problem:** same field, two names. A customer with account `12345` has
`accountId=12345` in their phone message and `accountNumber=12345` in
their work order — the dashboard search index and rolodex won't correlate.

**Fix:** standardize on `accountId`. Update the three back-office forms to
save/load `accountId`.

### Dashboard search coverage (dashboard.html)

The dashboard indexes these fields for search:
```
displayId, displayName, phone, email, address1, address2,
siteAddress, siteAddress1, siteAddress2, jobNumber, poNumber
```

Missing from the index but saved by at least one form:
- `rep` (who opened the ticket)
- `accountId` / `accountNumber`
- `description` (the actual notes — people WILL search these)
- `custSig`, `techSig` (signature names, searchable for audits)
- `items[].desc` (line items — "did we quote anyone for that door model?")

**Fix:** add these to the search index in `dashboard.html` loadLiveDocs().

### `ticketNumber` inconsistency

Every form stores its sequential ID in `ticketNumber`. But:
- `phone_message.html` has no ID generator — it uses Firestore's auto-ID
  and the `ticketNumber` field stays empty (or whatever the user typed into
  `msg-id` — unvalidated).
- `invoice.html` uses the typed-in `inv-no` field as the Firestore doc ID
  **AND** as `ticketNumber`. If a user types `"INV-001"` with spaces or
  special chars, Firestore will 400 because `/` is forbidden in doc IDs
  and some characters are escaped.

**Fix:** add an ID generator for phone messages (start at 800000, say),
and sanitize `inv-no` before using as doc ID.

---

## 🟡 Counter collisions

`DB.getNewId('work_order', 500000)` is called in:
- `work_order.html` (new WO)
- `quote.html` convertToWorkOrder (also new WO)
- `service.html` — doesn't call it (services use `service` counter, 700000)

All fine. But note: `sales_call.html` sets `sales-no` to the literal
string `"S-NEW"` instead of calling `DB.getNewId`. So two sales leads
saved at the same time both get `ticketNumber = "S-NEW"` and overwrite
each other on the dashboard's display. They still have distinct
Firestore doc IDs (auto-generated) so data isn't lost, but the UI is
confusing.

**Fix:** add `DB.getNewId('sales', 400000)` on fresh sales_call load.

---

## 🟡 Auth flow bugs

### Login page allows reaching the dashboard before auth finishes

`public/index.html`:
```js
await AuthService.loginWithGoogle();
// AuthState listener in auth.js will handle the redirect
localStorage.setItem('user_role', 'office');
```

The comment is right: `onAuthStateChanged` in `auth.js` handles the
redirect. But there's no `return` or `await` on the redirect itself, so
the function completes and the button is clickable again. Rapid
double-click → two popups → annoying but not broken. Low priority.

### No session/role check beyond "logged in"

All three views (dashboard, dispatch, mobile) check `if (!user) redirect`,
but nothing checks **which** role. Any signed-in Google account can reach
any view. `localStorage.user_role` is set but never read.

**For this app's users (5-person door company), that's probably fine.**
But it means the rules above (email-domain gate) are the only real
security boundary. Document this.

### Mobile logout doesn't clean localStorage

`signOut(auth)` fires, but `localStorage.user_role` lingers. Not a bug,
just noise.

---

## 🟡 CSP is permissive

Current:
```
default-src 'self' 'unsafe-inline' 'unsafe-eval' data: <firebase + google> ...
```

`unsafe-inline` + `unsafe-eval` are required today because:
- Every view has a large inline `<script type="module">` block
- The Firebase SDK uses `eval` internally for some features

**To tighten (future work, not blocking):**
1. Extract every inline `<script>` block into a sibling `.js` file per view
   (`dashboard.html` → `views/forms/dashboard.js`).
2. Remove `'unsafe-inline'` from `script-src`.
3. Firebase SDK can work without `'unsafe-eval'` if you use the modular
   `firebase/app` imports (which we already do).

This is a 2–3 hour project. Worth doing before Hamburg Door goes to paying
customers.

---

## 🟡 Service worker caches stale copies of the shell

Even after this session's fix, `sw.js` is network-first with cache fallback.
If the network is slow (not offline), users might see the last-cached
copy of `dashboard.html` or `forms.css` for a second before the new one
loads. For a static tool this is usually fine, but if you push a
breaking CSS change, users might see an unstyled page for a moment until
SW revalidates.

**Not a bug. Just flagging.** To fix "properly" would mean adding a
`skipWaiting()` + `clients.claim()` in the SW and bumping `CACHE_NAME`
on every deploy.

---

## 🟢 Things that are actually right

- Firestore transactions for sequential IDs (`DB.getNewId`) — uses
  `runTransaction`, atomic, correct.
- Offline persistence via `enableMultiTabIndexedDbPersistence` — good
  PWA posture.
- Auto-redirect on auth change — centralized in `auth.js`, not scattered.
- Every form has `status` field — the dashboard + dispatch filter on
  this consistently.
- `lastUpdated: serverTimestamp()` on every save — dashboard ordering
  works.
- Print styles work cleanly across forms (tested by reading the CSS).

---

## 📋 Punch list (in priority order)

1. **[BLOCKER]** William pastes Firestore rules so we can verify
   they're not open to the internet.
2. **[HIGH]** Standardize site address: pick `siteAddress1`/`siteAddress2`
   everywhere; fix `quote.html` + `work_order.html` to match.
3. **[HIGH]** Standardize account field: `accountId` everywhere; fix
   `sales_call.html` + `service.html` + `work_order.html`.
4. **[HIGH]** Add phone-message ID generator (currently none).
5. **[MEDIUM]** Sanitize `inv-no` before using as Firestore doc ID.
6. **[MEDIUM]** Add sales-lead ID generator.
7. **[MEDIUM]** Expand dashboard search index.
8. **[LOW]** Extract inline `<script>` blocks → tighten CSP.
9. **[LOW]** Clean `localStorage` on logout.

Fixes for 2–7 are in the follow-up commits on this branch.
