# Qlio — Universal Appointment, Queue & Check-In Platform

> **Book. Scan. Queue. Done.**

Multi-tenant SaaS for any service business that serves customers through appointments or queues.

**The core principle:** customers never need an account. Their booking receipt — a secure
token URL with a QR code — *is* their temporary digital identity.

---

## Live

| Surface | URL | Purpose |
|---|---|---|
| Landing | `/` | Marketing |
| Business page | `/:slug` | Customer entry — book, queue, or find |
| Booking flow | `/:slug/book` | Service → time → details → confirm |
| Find booking | `/:slug/find` | Recovery via phone + booking ID |
| **Receipt** | `/r/:token` | Ticket, QR, live queue. No auth. |
| Kiosk | `/kiosk/:slug` | Walk-in tablet at reception |
| Display | `/display/:slug` | Waiting-room TV screen |
| Business app | `/biz` | Dashboard, scan, queue, bookings, settings |

## Ports

| Service | Port |
|---|---|
| Backend (Go) | `8087` |
| Frontend (nginx) | `3007` |
| PostgreSQL | `5438` |

Domain: **qlio.arjism.com** (Cloudflare **Full** SSL — Flexible breaks POST with 405)

---

## Stack

- **Backend** — Go 1.22, GIN, pgx/v5, PostgreSQL 16, gorilla/websocket, JWT (HS256), bcrypt
- **Frontend** — React 18, Vite 5, TypeScript, Tailwind 3, react-router-dom 6
- **QR** — `qrcode` (generate) + `html5-qrcode` (scan via webcam)
- **Real-time** — WebSocket hub with per-business and per-receipt rooms
- **Deploy** — Docker Compose, nginx, `./update.sh`

## Quick start

```bash
cp .env.example .env       # then fill in real secrets
./update.sh --force        # build + recreate + health check
```

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, security model, real-time design
- [`docs/STRUCTURE.md`](docs/STRUCTURE.md) — file layout
- [`docs/PLAN.md`](docs/PLAN.md) — what's built, what's next
- [`docs/API.md`](docs/API.md) — endpoint reference

## The security model in one paragraph

The QR code contains **only** a 24-character CSPRNG token (`/r/<token>`). It carries no
customer data. The server resolves the token into a booking, and every staff scan is
validated against *the scanning staff member's own business* — a token from another tenant
resolves to not-found. Check-in locks the booking row (`SELECT … FOR UPDATE`) and writes a
unique-indexed `checkins` row, so re-scanning the same QR cannot double-process. Booking
recovery requires phone **and** booking ID together, rate-limited, because phone alone
would let anyone enumerate other customers.
