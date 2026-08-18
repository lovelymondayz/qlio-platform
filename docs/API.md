# Qlio API Reference

All responses are JSON. Errors have the shape:

```json
{ "error": "slot_taken", "message": "That time was just taken. Please pick another." }
```

`error` is a stable machine code; `message` is a human sentence safe to show a customer.

---

## Public (no authentication)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness + DB ping |
| `GET` | `/api/public/b/:slug` | Business, services, schedule, live queue counts |
| `GET` | `/api/public/b/:slug/slots?service_id=&date=` | Bookable times for a day |
| `POST` | `/api/public/b/:slug/book` | Create booking → returns `receipt_token` |
| `GET` | `/api/public/b/:slug/display` | Waiting-room screen snapshot |
| `GET` | `/api/public/b/:slug/display/ws` | Waiting-room live socket |
| `GET` | `/api/public/receipt/:token` | Full receipt (ticket, queue position, business) |
| `GET` | `/api/public/receipt/:token/ws` | Receipt live socket |
| `POST` | `/api/public/receipt/:token/cancel` | Customer self-cancel (before check-in only) |
| `POST` | `/api/public/find` | Recover booking — requires `phone` **and** `code` |

### `POST /api/public/b/:slug/book`

```json
{
  "service_id": 12,
  "kind": "appointment",        // or "queue"
  "date": "2026-08-19",
  "time": "14:30",              // omit for queue
  "name": "Arji Surya",
  "phone": "081234567890",
  "email": "",
  "notes": "",
  "origin": "online"            // or "kiosk"
}
```

→ `201 { "receipt_token": "…", "booking_code": "QL-8F29A4", "receipt_url": "/r/…" }`

Error codes: `invalid_name`, `invalid_phone`, `invalid_service`, `appointments_disabled`,
`queue_disabled`, `time_required`, `slot_taken`, `fully_booked`, `rate_limited`.

---

## Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` | Open self-serve business registration |
| `POST` | `/api/auth/login` | Returns JWT + `business_slug` + `role` + `setup_step` |

Login error codes distinguish `invalid_credentials` (no such email) from `wrong_password`,
so the UI can highlight the right field.

---

## Staff (JWT required — `Authorization: Bearer <token>`)

### Any staff role

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/staff/me` | Current session context |
| `GET` | `/api/staff/dashboard?date=` | Today's counts + averages |
| `GET` | `/api/staff/bookings?from=&to=&status=` | Calendar data |
| `GET` | `/api/staff/analytics?days=7\|30` | Volume, peak hours, top services |
| `POST` | `/api/staff/scan` | `{token}` or `{code}` → booking preview |
| `POST` | `/api/staff/checkin` | Confirm arrival; issues queue ticket |
| `GET` | `/api/staff/queue?date=` | Live board snapshot |
| `GET` | `/api/staff/queue/ws?token=<jwt>` | Live board socket |
| `POST` | `/api/staff/queue/call-next` | Pull longest-waiting ticket |
| `POST` | `/api/staff/queue/:id/:action` | `recall` `serving` `complete` `skip` `cancel` |
| `POST` | `/api/staff/queue/:id/transfer` | Move ticket to another counter |

### Owner / Manager only

| Method | Path |
|---|---|
| `GET` `PUT` | `/api/staff/business` |
| `PUT` | `/api/staff/schedule` |
| `GET` `POST` `PUT` `DELETE` | `/api/staff/services[/:id]` |
| `GET` `POST` `PUT` `DELETE` | `/api/staff/counters[/:id]` |
| `GET` `POST` `PUT` `DELETE` | `/api/staff/staff[/:id]` |
| `GET` | `/api/staff/audit` |

`DELETE` on services and staff is a **soft** delete (`is_active = FALSE`) to preserve
booking history. Counters are hard-deleted since tickets reference them nullably.

---

## WebSocket events

| Event | Room | Meaning |
|---|---|---|
| `booking.created` | `biz:<id>` | New appointment booked |
| `queue.joined` | `biz:<id>` | Someone took a queue number |
| `queue.changed` | `biz:<id>` | Any state change — boards should refresh |
| `booking.cancelled` | `biz:<id>` | Customer self-cancelled |
| `receipt.updated` | `rcpt:<token>` | This customer's receipt changed |
| `almost.turn` | `rcpt:<token>` | Customer is within N of the front |
| `your.turn` | `rcpt:<token>` | Called — payload carries `counter` |

Clients should treat every event as "refetch", not as authoritative state. The payload is a
hint for animation and notification; the REST endpoint is the source of truth.
