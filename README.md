# Ticket Forge Unity — Hamburg Door Staff Portal

Field-service operations app for **Hamburg Overhead Door**.

Built as a Netlify static site + Netlify Functions backend, with **Firebase**
(Auth + Firestore + Storage) for data and auth. The core idea: paper-form
parity on screen + a dispatch board + a mobile tech view, all backed by the
same Firestore collections.

- **Live site:** Netlify deploy of the `main` branch (publish dir: `public/`)
- **Firebase project:** `hamburg-door-ops` (William, registered 2026-04-21)
- **Repo:** `sparkyandtheo/152026-ticket-forge-unity`

---

## 🧭 The three views

| View | URL | Who |
|---|---|---|
| **Admin — Docs Dashboard** | `/dashboard` | Office staff (default) |
| **Dispatcher — Board** | `/dispatch` | Whoever schedules techs |
| **Field Tech — Mobile** | `/mobile` | Service/install techs on phones |
| **🎞️ Interactive Demo** | `/demo` | Anyone (no login needed) — 90-second walkthrough |

All three pages share the same top-right dropdown to switch roles. A staff
member can move between views without re-logging-in because auth state is
global (Firebase Auth + `onAuthStateChanged`).

---

## 📁 Repo layout

```
152026-ticket-forge-unity/
├── netlify.toml              # Build config + headers (CSP, cache, security)
├── functions/                # Netlify serverless functions (stubs)
│   ├── lead-time.js          # TODO: lead-time lookup
│   └── transcribe.js         # TODO: audio transcription
├── public/                   # Netlify publish dir (static site root)
│   ├── _redirects            # Pretty URLs + SPA fallback
│   ├── index.html            # Google sign-in (THE login page)
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker (network-first, cache fallback)
│   ├── assets/
│   │   └── css/forms.css     # Paper-form styles (used by all 6 form views)
│   ├── js/
│   │   ├── firebase-config.js  # Firebase init + persistence
│   │   ├── auth.js             # Google sign-in + redirect logic
│   │   ├── db.js               # DB facade (saveDoc, getDoc, getNewId, etc.)
│   │   ├── form-utils.js       # setVal, setChk, autoGrow, rolodex, highlight
│   │   └── controllers/
│   │       └── dispatch.js     # Dispatch board drag-and-drop + grid
│   └── views/
│       ├── forms/              # The 6 paper-parity forms
│       │   ├── dashboard.html    (docs overview + search)
│       │   ├── phone_message.html
│       │   ├── sales_call.html
│       │   ├── quote.html
│       │   ├── work_order.html
│       │   ├── service.html
│       │   └── invoice.html
│       ├── mobile/
│       │   └── index.html        (tech job list + detail view)
│       └── office/
│           └── dispatch.html     (dispatch board)
└── AUDIT_2026-04-22.md         # Structure audit (what was fixed and why)
```

### Path conventions

All JS module imports use **absolute paths** (`/js/...`). Never relative
(`../../js/...`). This means you can move a view to a different folder depth
without breaking imports.

### Firestore collections

| Collection | Purpose |
|---|---|
| `customers` | Rolodex. Keyed by phone number when possible. |
| `phone_messages` | Intake slips. |
| `sales_leads` | Sales calls / leads. |
| `quotes` | Quotes & proposals. |
| `work_orders` | Installation tickets. |
| `service_tickets` | Service visits. |
| `invoices` | Invoices. |
| `counters` | Sequential ID generator (atomic transactions). |

Every doc has `lastUpdated: serverTimestamp()` — the dashboard sorts by it.

---

## 🏗️ Running locally

1. Install the Netlify CLI if you don't have it:
   ```bash
   npm install -g netlify-cli
   ```
2. Link to the site (once):
   ```bash
   netlify link
   ```
3. Run dev:
   ```bash
   netlify dev
   ```

Netlify dev serves the static site from `public/`, runs functions in
`functions/`, and honors `_redirects` and `netlify.toml`.

### Environment

No build-time env vars today. Firebase config is public by design (embedded
in `firebase-config.js`). Access is enforced by **Firestore security rules**
and Firebase Auth, not by hiding the config.

When functions grow real logic, secrets go in `.env` locally and in Netlify
UI for prod. See `.env.example`.

---

## 🚢 Deploy

- Push to `main` → Netlify auto-deploys (default Netlify Git integration).
- Manual: `netlify deploy --prod`.

---

## 🧪 Automated tests

Zero-dependency test harness at `tests/run.js`. Run before you push:

```bash
node tests/run.js
```

Covers (20 tests, all green as of 2026-04-22):
- Round-trip save/load for every form (phone message, sales call, quote,
  work order, service ticket, invoice)
- Every cross-form conversion preserves customer identity + account #
- Dispatch board drag-and-drop semantics
- ID generators (independence, monotonicity, startFrom)
- Full end-to-end pipelines: repair-call and new-install
- Customer rolodex phone-key lookup
- Dashboard search index coverage

The harness uses a pure-JS mock of Firestore (`tests/mock-db.js`) and pure-JS
translations of every form's save/load logic (`tests/form-adapters.js`). If
you change a form's schema, update the matching adapter and re-run.

---

## 🎞️ Demo for coworkers

Two modes, pick whichever fits:

**1. Interactive walkthrough (recommended, safe):**
Send your coworker to `https://<site>/demo`. They click PLAY. 90-second
narrated tour of the whole system. Fake data, zero side effects, works
without login. Source: `public/demo/walkthrough.js`.

**2. Live UI cassette (advanced, drives real forms):**
Used for internal smoke-testing. Load from any page:

```js
await import('/demo/cassette.js');
HamburgDemo.play();
```

Requires being signed in; writes tagged DEMO docs to Firestore. Source:
`public/demo/cassette.js`.

---

## 🔍 Smoke tests after deploy

1. `/` → Google sign-in card appears.
2. Sign in → redirect to `/views/forms/dashboard.html`.
3. Dashboard loads all 5 stacks (intake / quotes / work orders / service / invoices).
4. Create a phone message → save → appears in dashboard intake stack.
5. Click role dropdown → Dispatch → board loads, drag a card to a slot.
6. Mobile view (`/mobile`) → shows your scheduled jobs.
7. Logout → back to `/`.

---

## 📝 Known TODOs

- Real icons for PWA (`public/assets/img/icons/icon-192.png` + `-512.png`), then add back to `manifest.json`
- Implement `functions/lead-time.js` (lead-time lookup for parts)
- Implement `functions/transcribe.js` (voice-note → text for tech notes)
- Firestore security rules review (collections listed above)
- Tighten CSP — remove `unsafe-inline` / `unsafe-eval` after moving inline scripts into modules

See `AUDIT_2026-04-22.md` for a full deferred-items list.
