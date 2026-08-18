# Qlio — Rebuild-From-Scratch Prompt

Paste the block below into a capable coding agent to regenerate this entire project from
nothing. It is written as a complete specification, not a summary — every decision that
took iteration to get right the first time is stated explicitly so it does not have to be
rediscovered.

**Use this when:** the repo is gone, you want to rebuild on a different stack, or you want
a second implementation to compare against.

**Do not use this when:** the repo still exists. Cloning is faster and exact — see
[`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).

---

## The prompt

````
Build a production-ready multi-tenant SaaS called **Qlio** — a universal appointment,
queue, and QR check-in platform for service businesses (clinics, dentists, workshops,
barbershops, salons, repair shops, trainers, consultants, government offices).

Tagline: "Book. Scan. Queue. Done."

## Core concept — get this right or nothing else matters

Customers **never create an account**. When someone books, the server issues a
cryptographically random receipt token. The URL `/r/<token>` IS their ticket, their
identity, and their live status page. The QR code they show staff contains **only that
token**. Everything is resolved server-side from it.

An **appointment is not a queue ticket**. Booking an appointment reserves a time slot.
The customer receives their queue ticket number **at check-in**, not at booking. Walk-ins
get a ticket immediately. This distinction is the heart of the product — most competitors
conflate the two and it produces wrong behaviour.

## Stack (non-negotiable)

- Backend: **Go 1.22 + GIN + pgx/v5 + PostgreSQL 16**
- Frontend: **React 18 + Vite 5 + TypeScript + Tailwind + react-router-dom v6**
  (NOT Next.js. Pin Vite to 5.x — Vite 8's rolldown native binding fails on small VPSes.)
- Deploy: Docker Compose, three services (db, backend, frontend)
- Do NOT add: an ORM, Redis, a message queue, a payment SDK, or a component library.
  Keep the dependency list tiny. Total npm deps should be ~5 runtime packages.
- `gin-contrib/cors` requires Go 1.25 — **hand-roll CORS middleware** instead.

## Database — 17 tables

businesses, staff, business_schedule, business_settings, services, service_staff,
counters, staff_schedule, customers, bookings, queue_tickets, ticket_counters, checkins,
notifications, audit_log, service_samples, rate_hits

Rules:
- Every tenant-scoped table carries `business_id` with `ON DELETE CASCADE`.
- Migrations are plain `.sql` files applied **automatically on boot** in filename order.
  Every statement must be idempotent (`IF NOT EXISTS`) so re-running is safe. No separate
  migrate command, no migration library.
- `businesses.slug` is unique and auto-generated from the business name.
- `bookings.receipt_token` unique, indexed — this is the lookup key.
- `checkins.booking_id` has a **UNIQUE index** — this is what makes QR replay impossible.
- `ticket_counters(business_id, service_date, prefix)` unique — the atomic ticket sequencer.
- `service_samples` stores completed service durations for rolling wait estimates.

## Security requirements — implement exactly

1. **Receipt token**: 24 chars from a CSPRNG (`crypto/rand`), alphabet excluding
   lookalikes (no 0/O/1/l/I). Never expose a sequential database id publicly.
2. **QR payload is the token only.** The scan endpoint must accept a bare token OR a full
   URL and extract the token. Never trust anything else in the payload.
3. **Tenant scope always comes from the JWT claim**, never from a request parameter. A
   staff member scanning another business's token must get **not-found** — never a
   permission error, which would confirm the token exists.
4. **Check-in is replay-proof**: `SELECT ... FOR UPDATE` on the booking plus the unique
   index on `checkins.booking_id`. Second scan returns `already_processed`.
5. **Booking recovery requires phone AND booking code.** Phone alone is enumerable — a
   caller could walk the number space and read other customers' names and appointments.
   Rate-limit to 5 attempts / 15 min per IP.
6. **Mask phone numbers** in any publicly-readable response (`6281******890`).
7. **Passwords**: bcrypt. **Roles**: owner > manager > receptionist > staff > provider.
   Receptionist can scan and drive the queue but must be **403** on services, business
   settings, staff management, and the audit log.
8. Prevent privilege escalation: reject any attempt to set a role outside the allowed set,
   and make the owner account impossible to disable or delete.

## Ticket numbering

Per-business, per-day, per-service-prefix. `A024` = prefix `A`, sequence 24. Resets daily.
Implement with a row-locked upsert:

```sql
INSERT INTO ticket_counters (business_id, service_date, prefix, last_seq)
VALUES ($1,$2,$3,1)
ON CONFLICT (business_id, service_date, prefix)
DO UPDATE SET last_seq = ticket_counters.last_seq + 1
RETURNING last_seq;
```

This must be correct under concurrent requests. Never `SELECT MAX()+1`.

## Wait estimate

`(people_ahead × rolling_avg_service_minutes) / active_counters`

Rolling average over that business's last 20 completed services for that service type;
fall back to the service's configured duration when there is no history. Always label it
as an estimate in the UI — never present it as a promise.

## Real-time

WebSocket hub with two room types:
- `biz:<business_id>` — staff queue boards and the waiting-room display
- `rcpt:<token>` — the customer's own receipt page

Events: `queue_updated`, `ticket_called`, `ticket_completed`, `receipt_updated`.

WebSocket upgrades cannot send an Authorization header, so accept the JWT as a query
parameter for the socket endpoint only. Include ping/pong keepalive and client-side
reconnect with backoff.

## Routes

Public / customer:
```
/                    landing page (marketing)
/:slug               business entry — Book | Join Queue | Find My Booking
/:slug/book          booking wizard (service → time or queue → details → confirm)
/:slug/find          recover a booking (phone + code)
/r/:token            live receipt — QR, status, position, wait estimate
/kiosk/:slug         walk-in tablet mode (large touch targets)
/display/:slug       waiting-room TV — NOW SERVING board
```

Staff (JWT-gated):
```
/biz/login  /biz/signup  /biz/setup   (5-step onboarding wizard)
/biz        dashboard
/biz/scan   webcam QR scanner (html5-qrcode)
/biz/queue  live queue board — call next, recall, serving, complete, skip, transfer
/biz/bookings   calendar: day / week / month
/biz/analytics  totals, busiest hours, per-service breakdown
/biz/settings   business / services / team tabs
```

## The ticket-as-image requirement

The receipt page must have a **"Save Ticket as Image"** button that renders a ~900×1500
PNG on a `<canvas>`: business name, service, date/time, the ticket number in very large
type, and the QR code with a white quiet-zone frame so it scans reliably off a phone
screen. Use high error correction.

Why: the customer saves it to their gallery and shows the image at the counter. It must
work with **no network connection on the customer's phone**. Also offer Web Share (for
WhatsApp) and a hand-rolled `.ics` download. No third-party services for any of this.

## Three distinct UX surfaces

- **Customer** — mobile-first, huge tap targets, zero jargon, no dead ends. Anyone's
  grandmother must complete a booking without help.
- **Staff** — dense but large type, keyboard-friendly, minimum clicks. Usable while a
  queue of people waits.
- **Landing** — marketing, explains the 9-step customer journey.

Accessibility: visible focus rings, `prefers-reduced-motion` respected, status conveyed by
icon + text (never colour alone), 44px minimum touch targets.

## Timezone — a trap that silently breaks the queue

Every business has its own IANA timezone. **All date logic must use the business's local
date, never the server's.** Store `service_date` as the business-local date at issue time,
and read it back with the same clock.

Get this wrong and the failure is invisible in testing: a Jakarta business (UTC+7) rolls
over to the next day 7 hours before UTC does, so after 17:00 UTC the queue board silently
reports "no one is waiting" while tickets exist in the database stamped with tomorrow's
date. Nothing errors — the queue just appears empty.

Provide one helper and use it everywhere:

```go
// today in the business's own timezone
func localToday(tz string) string {
    loc, err := time.LoadLocation(tz)
    if err != nil { return time.Now().Format("2006-01-02") }
    return time.Now().In(loc).Format("2006-01-02")
}
```

Audit every default: `c.DefaultQuery("date", ...)` on the queue board, dashboard, bookings
list, and public slots must all resolve to the business-local date. In public handlers,
load the business row (and its timezone) **before** computing the date default.

## Do not hardcode entity ids

`services.id`, `counters.id`, and `bookings.id` are **global sequences**, not per-tenant.
A test that hardcodes `service_id: 1` fails on any database with prior data — and it fails
with `invalid_service` or `queue_empty`, which look like app bugs but are actually
tenant-isolation working correctly. Always use the id the API returned.

## Deliberately out of scope

- **No payment step.** Prices are display-only; the business collects in person.
- **No notifications** in v1 (no email/SMS/WhatsApp). The receipt URL is the confirmation.
- Both are deferred by product decision, but leave the `notifications` table in place.

## Docker + deployment

- Multi-stage Dockerfiles. Backend: `golang:1.22-alpine` → `alpine`, non-root user,
  static build (`CGO_ENABLED=0`). Frontend: `node:22-alpine` build → `nginx:1.27-alpine`.
- The **frontend container's own nginx** must proxy `/api/` to the backend by container
  name and provide SPA fallback (`try_files ... /index.html`). Do not depend on a
  host-level reverse proxy — the container must be self-sufficient behind any tunnel.
- Add `logging: json-file, max-size 10m, max-file 3` to **every** service or logs will
  fill the host disk.
- Healthchecks must use **`127.0.0.1`, not `localhost`**: inside these images `localhost`
  resolves to `::1` while the servers bind IPv4-only, so a `localhost` healthcheck is
  refused and the container reports unhealthy while serving perfectly.
- `restart: unless-stopped` on all services.

## Required project files

`README.md`, `Makefile`, `update.sh` (git pull → build --no-cache → up --force-recreate →
health check; never `docker compose restart`), `.env.example`, `.gitignore`, and
`docs/`: `ARCHITECTURE.md`, `STRUCTURE.md`, `PLAN.md`, `API.md`, `BACKUP.md`,
`DISASTER_RECOVERY.md`.

Also `scripts/backup.sh` and `scripts/restore.sh`: gzipped `pg_dump` with a 14-day
retention, and four guards that refuse to keep a bad dump (container up, pg_dump exit
code, minimum file size, `gzip -t`). Non-zero exit on failure. The restore script takes a
safety dump first and requires typing `RESTORE`.

## Definition of done

Do not report success on the basis of compilation. **Drive every flow with real HTTP
requests against the running stack** and paste the actual output:

1. signup → auto-generated slug + JWT
2. add service, set opening hours
3. slot generation respects opening hours and the business timezone
4. book an appointment → 24-char token returned
5. receipt loads with **no auth**, phone masked
6. double-booking the same slot → rejected
7. find by phone alone → **rejected**; phone + code → resolves
8. scan a full receipt URL → resolves
9. check-in → **issues a queue ticket**
10. scan the same QR again → **rejected**
11. a second business scanning the first's token → **not-found**
12. no JWT → unauthorized
13. call next → next ticket flips to "almost your turn"
14. serving → transfer counter → complete
15. recall, skip/no-show, and call-next on an empty queue
16. dashboard and audit log populate
17. receptionist role → 200 on scan/queue, **403** on services/business/staff/audit
18. soft-deleted service disappears from the public page but remains in admin
19. **backup → wipe the database → restore → log in successfully** (proves bcrypt hashes
    survive the round trip; matching row counts alone are not sufficient evidence)
````

---

## Notes for whoever runs this

**Expect ~2 sessions of work.** The original build hit context limits twice. Write files in
small batches; a single very large file write can time out the stream.

**Build order that worked:** migrations → config/db/models → auth+RBAC → queue engine →
public handlers → staff handlers → WebSocket hub → main.go wiring → *compile and vet* →
frontend config → types/lib/hooks → customer pages → staff pages → landing → *typecheck
and build* → Dockerfiles → compose → deploy → E2E → docs.

**Compile early and often.** `go vet ./...` and `tsc -b` caught every real bug in the
original build — a Go dependency requiring a newer toolchain, and a TypeScript union
inference failure. Neither was found by reading the code.

**On this VPS specifically:** the Go container build takes ~12 minutes on 2 cores. Run it
in the background rather than assuming it has hung.
