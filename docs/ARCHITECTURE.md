# Qlio Architecture

## 1. Multi-tenancy

Every tenant-scoped table carries `business_id`. Enforcement happens at the query layer —
`business_id` always comes from the **JWT claim**, never from a request body or URL param:

```go
bizID := middleware.BizID(c)   // from JWT
db.Pool.Query(ctx, `... WHERE business_id=$1 ...`, bizID)
```

This makes cross-tenant reads structurally impossible on authenticated routes: a staff
member cannot craft a request that reaches another business's data, because the scope is
never accepted as input.

## 2. Data model (16 tables)

```
businesses ──┬── staff ──── staff_schedule
             ├── business_schedule
             ├── business_settings
             ├── services ──── service_staff ──┐
             ├── counters ◄────────────────────┘
             ├── customers
             ├── bookings ──┬── queue_tickets ──── ticket_counters
             │              ├── checkins
             │              └── notifications
             ├── service_samples   (wait-time learning)
             └── audit_log
rate_hits    (global, IP-bucketed)
```

## 5. Cancellation policy

Customers **cannot** cancel their own booking. A booked slot is a commitment to the
business, so cancelling requires contacting them — the receipt shows the business phone
number instead of a cancel button.

Staff resolve bookings in two places:

| Situation | Where | Endpoint |
|---|---|---|
| Customer never arrived / phoned to cancel, **before check-in** | Appointment calendar | `PUT /api/staff/bookings/:id/status` → `confirmed` \| `no_show` \| `cancelled` |
| Customer is already in the queue | Queue board | `POST /api/staff/queue/:id/cancel` |

Both write to `audit_log` against the staff member who acted, so cancellations are always
attributable. The booking endpoint only accepts transitions **out of `pending_checkin`**;
anything already checked in or closed returns `already_processed`.

There is deliberately **no reschedule**. Staff close the booking and the customer books
again, which keeps slot-conflict logic in exactly one place (the booking path).

If self-service cancellation is wanted later, it should be a **request → owner approves**
flow rather than an immediate delete.

## 6. Ticket numbering

Per business, per day, per service prefix. Allocation is atomic:

```sql
INSERT INTO ticket_counters (business_id, service_date, prefix, last_seq)
VALUES ($1, $2::date, $3, 1)
ON CONFLICT (business_id, service_date, prefix)
DO UPDATE SET last_seq = ticket_counters.last_seq + 1
RETURNING last_seq
```

Two simultaneous bookings can never receive the same number — the second waits on the row
lock and gets `last_seq + 1`. Numbers reset daily and render as `A001`, `A024`, `D042`.

## 3. Appointment ≠ instant service (§13)

This is the concept most competitors get wrong, and Qlio models it explicitly.

A **queue** booking receives its ticket at booking time.
An **appointment** receives its ticket **at check-in**, not at booking.

```
Booked 14:30  →  arrives 14:22  →  staff scans  →  ticket D042 issued
                                                    current queue: D039
                                                    people ahead: 3
```

An appointment is a *promise to be seen around that time*, not a guarantee of instant
service. Issuing the queue number at check-in gives businesses real operational flexibility
and keeps the queue honest: whoever actually arrived and checked in is in line.

## 4. Security model

### The token is the identity

| Concern | Design |
|---|---|
| QR payload | `/r/<24-char base62 CSPRNG>` — nothing else |
| Sequential IDs | Never exposed publicly |
| Payload trust | Zero. Server resolves token → booking |
| Cross-tenant scan | Scan query filters on scanning staff's `business_id` → not-found |
| Replay | `SELECT … FOR UPDATE` + `UNIQUE(checkins.booking_id)` |
| Status guard | Check-in only proceeds from `pending_checkin` |
| Booking lookup | Requires phone **AND** booking code, 5 per 15 min per IP |
| Passwords | bcrypt (default cost) |
| Role escalation | `UpdateStaff` refuses `owner`; `WHERE role <> 'owner'`; rank ceiling stops peer promotion |
| Rate limits | DB-backed sliding window: signup, login, booking, find |

### Role hierarchy (§24)

All five roles are ranked, so permissions are a threshold rather than a list.
Before this, one gate (`RequireRole("owner","manager")`) guarded config and
every other role collapsed into "some staff member" — a `provider` had exactly
the same reach as a `receptionist`.

| Role | Rank | Can do |
|---|---|---|
| owner | 50 | everything, plus deactivate staff |
| manager | 40 | all config: services, counters, staff, schedule, analytics |
| receptionist | 30 | scan, check in, queue, resolve + reschedule bookings |
| provider | 20 | scan, check in, queue |
| staff | 10 | view the board, move the queue |

Enforced by `middleware.RequireRank(min)`. Two extra rules close the peer-escalation
hole: a caller cannot create or assign a role at or above their own rank, and
cannot edit a staff member at or above their own rank. So a manager can no longer
mint a second manager, and only an owner can deactivate anyone.

`is_super` bypasses every check — it is the platform operator, not a tenant role.

### Why phone-only lookup was rejected

The brief (§29) allows "phone number **or** booking ID". Phone-only is enumerable — anyone
could walk the number space and read other customers' names, services, and times. Qlio
requires both factors. This is a deliberate deviation, documented here.

## 5. Real-time

A single in-process hub with two room types:

- `biz:<id>` — staff queue boards + waiting-room displays
- `rcpt:<token>` — one customer's receipt page

```
Staff presses Call Next
  → UPDATE queue_tickets SET state='called'
  → Broadcast biz:<id>   "queue.changed"   (boards + display refresh)
  → Broadcast rcpt:<tok> "your.turn"       (customer sees IT'S YOUR TURN)
  → markAlmostUp() flags the next N waiting → "almost.turn"
```

Broadcasts are non-blocking: a slow consumer's frame is dropped rather than stalling the
queue. Every client also keeps a polling fallback (8–45s depending on socket state), so a
proxy that kills WebSockets degrades the experience instead of breaking it.

WebSocket routes take the JWT as a **query parameter** because browsers cannot set headers
on an upgrade request. `middleware.BizFromToken` validates it and returns the scope.

## 6. Wait-time estimation (§27)

```
est_minutes = (people_ahead × avg_service_seconds) / (active_counters × 60)
```

`avg_service_seconds` is a rolling average of the last 20 completions **for that service**,
falling back to the last 30 for the business, then the configured `duration_min`, then 15
minutes. Samples are recorded on `complete` (from `serving_at`, or `called_at` if service
was never explicitly started), and outliers outside 30s–6h are discarded.

Always labelled "(estimate)" in the UI. Never presented as a promise.

## 7. Three UX surfaces, one codebase

| Surface | Design target |
|---|---|
| **Customer** | Mobile-first, one obvious action per screen, no jargon, giant QR |
| **Staff** | Large type, low click count, keyboard-friendly, no confirm dialogs |
| **Display** | Readable across a room, dark theme, zero interaction |

Accessibility (§36): visible focus rings, `prefers-reduced-motion` honoured, 3.5rem minimum
touch targets, and status is **always** icon + text — never colour alone.

## 8. The offline ticket (kvinn's requirement)

`lib/ticket.ts` renders the receipt to a 900×1500 PNG on a canvas: business name, service,
time, giant ticket number, high-EC QR with a white quiet-zone frame, booking ID, and the
instruction line. The customer saves it to their gallery and shows the **image** at the
counter. This works with no signal, no battery-draining page load, and no account.

`shareTicket()` additionally offers the Web Share API so the image can go straight to
WhatsApp; it falls back to copying the receipt link.
