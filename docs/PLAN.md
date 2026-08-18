# Qlio Build Plan

## Status: Phase 1–3 complete · deployed · live at https://qlio.arjism.com

---

## ✅ Runtime-verified against the live stack

Not "compiles" — actually driven by real requests:

| Flow | Result |
|---|---|
| Signup → auto-slug | `toko-budi`, JWT, owner role |
| Slot generation | 24 available tomorrow; 0 today (past closing) — timezone-correct |
| Book appointment | `QL-8L4KCU`, 24-char CSPRNG token |
| Receipt, no auth | loads; phone masked `6281******890` |
| Double-book same slot | `slot_taken` |
| Find by phone alone | **rejected** — `both_required` |
| Find by phone + code | resolves |
| Scan (full URL payload) | `found:true`, `can_check_in:true` |
| Check-in | issues ticket **`A001`** — §13 appointment→queue |
| Replay same QR | **rejected** — `already_processed` |
| Cross-tenant scan | **not-found** |
| Cross-tenant check-in | **not-found** |
| No JWT | `unauthorized` |
| Call next | `A001` called, `A002` auto-flipped to `almost` |
| Serving → transfer → complete | Counter 2, `completed:1` |
| Recall / skip | `called` / `no_show` |
| Empty queue | `queue_empty` — clean failure |
| `avg_wait_min` | **7** — from real timestamps |
| Audit log | all 7 staff actions attributed |
| Public HTTPS | 6/6 requests HTTP 200 |
| **Backup → wipe → restore** | 17 tables recovered, 0 errors, **owner login still works** |

---

## ✅ Built

### Backend (Go 1.22 · compile + vet verified)

- [x] 16-table schema across 4 idempotent migrations, auto-applied on boot
- [x] pgx/v5 pool with connection retry (15 attempts) — survives DB starting after app
- [x] JWT auth (HS256, 14-day) + 5-role RBAC + hand-rolled CORS
- [x] Open self-serve signup with unique slug generation and sane defaults seeded
- [x] Public: business page, slot generation (honours schedule + breaks + taken slots + past times)
- [x] Booking creation: validation, per-service daily caps, slot clash detection, rate limiting
- [x] Atomic per-day/per-prefix ticket allocation
- [x] Receipt resolution from opaque token + live queue position
- [x] Booking recovery (phone AND code, rate-limited)
- [x] Customer self-cancel before check-in
- [x] **Scan** — cross-tenant safe, accepts token / full URL / manual code
- [x] **Check-in** — row-locked, replay-proof, issues queue ticket for appointments
- [x] Queue control: call-next (SKIP LOCKED), recall, serving, complete, skip, cancel, transfer
- [x] `markAlmostUp` — flags next N so their receipts warn them
- [x] Service-duration sampling on complete → feeds wait estimator
- [x] Services / counters / staff / schedule CRUD with soft-delete + owner protection
- [x] Dashboard, bookings list, analytics (daily, peak hours, top services), audit log
- [x] WebSocket hub: per-business + per-receipt rooms, ping/pong, drop-on-slow-consumer

### Frontend (React 18 + Vite 5 + TS + Tailwind · tsc + build verified)

- [x] Landing page — hero, core-idea section, 9-step journey, value props, categories, CTA
- [x] Business entry `/:slug` — three big choices, live queue peek, services preview
- [x] Booking wizard — service → time (14-day strip + slot grid) → details → confirm
- [x] **Receipt `/r/:token`** — ticket, giant QR, live queue, IT'S YOUR TURN banner
- [x] **Save Ticket as Image** — 900×1500 canvas PNG, works offline
- [x] Web Share (→ WhatsApp) + hand-rolled `.ics` Add to Calendar
- [x] Browser notifications + vibration on call
- [x] Find booking, kiosk (auto-reset), waiting-room display (with chime)
- [x] Staff: login/signup, 5-step setup wizard, layout w/ role gating + setup enforcement
- [x] Dashboard, scanner (webcam + manual fallback), queue board, calendar, analytics
- [x] Settings: business profile + hours + printable QR, services CRUD, team CRUD
- [x] Accessibility: focus rings, reduced-motion, 3.5rem targets, icon+text status

### Ops

- [x] Multi-stage Dockerfiles (backend non-root + healthcheck)
- [x] docker-compose with DB healthcheck gating backend start
- [x] nginx SPA fallback + `/api` proxy with WebSocket upgrade
- [x] Per-project `update.sh` (build --no-cache + up --force-recreate + health checks)
- [x] Generated secrets in `.env`, `.env.example` committed
- [x] README, ARCHITECTURE, STRUCTURE, API docs

---

## 🔄 Remaining (non-blocking)

- [x] Docker build + deploy
- [x] Public HTTPS via Cloudflare Tunnel
- [x] E2E runtime verification
- [x] GitHub repo + push
- [x] Verified DB backup + restore + nightly cron
- [ ] **Off-site backup copy** — dumps currently share the DB's disk (see docs/BACKUP.md)
- [ ] Lazy-load `/biz/*` routes so customers don't download the staff app (643KB → ~350KB)
- [ ] Move `rate_hits` cleanup out of the request path into a periodic job

---

## 📋 Deferred (agreed with kvinn)

| Item | Why deferred |
|---|---|
| Notifications: email / SMS / WhatsApp | Needs a paid gateway. Table + settings exist; browser push works. "Discuss later." |
| Payments | Prices are display-only, paid in person. kvinn charges the business owner, not customers. |
| Staff per-day schedules | Table exists (`staff_schedule`), no UI yet |
| Service ↔ staff assignment | Table exists (`service_staff`), no UI yet |
| Auto no-show timer | Setting exists (`auto_noshow_min`), no worker yet |
| Super-admin cross-tenant console | `is_super` claim honoured in RBAC, no UI |

---

## Known constraints

- **Vite 5 pinned** — Vite 8's rolldown native binding cannot install on this VPS.
- **Go 1.22** — `gin-contrib/cors` latest needs 1.25, so CORS is hand-written.
- Bundle is 643KB / 195KB gzip in one chunk. Acceptable now; if it grows, lazy-load the
  staff routes (`React.lazy`) since customers never load them.
