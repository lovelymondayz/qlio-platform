# Qlio Build Plan

## Status: Phase 1–3 code complete, deployment in progress

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

## 🔄 In Progress

- [ ] `docker compose build --no-cache` — running
- [ ] `docker compose up -d` + health verification
- [ ] nginx vhost `qlio.arjism.com` + Cloudflare **Full** SSL
- [ ] **E2E runtime verification** (nothing is runtime-verified yet)
- [ ] GitHub repo `lovelymondayz/qlio-platform` + push

### E2E script to run

```
1. signup → 2. wizard (5 steps) → 3. open /:slug
4. book appointment → 5. receipt loads, QR renders, PNG downloads
6. staff scan (manual code) → 7. CHECK IN → ticket issued
8. call next → 9. receipt shows IT'S YOUR TURN + counter
10. complete → duration sample recorded
11. kiosk walk-in → ticket issued immediately
12. display screen shows now-serving
```

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
