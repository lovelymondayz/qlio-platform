# Qlio File Structure

```
qlio-platform/
├── docker-compose.yml          db(5438) + backend(8087) + frontend(3007)
├── update.sh                   pull → build --no-cache → up --force-recreate → health
├── .env                        secrets (gitignored)
├── .env.example                template
├── README.md
│
├── backend/
│   ├── Dockerfile              multi-stage, distroless-ish alpine, non-root
│   ├── go.mod / go.sum
│   ├── cmd/server/main.go      route table + server bootstrap
│   ├── migrations/
│   │   ├── 001_core.sql        businesses, staff, schedule, settings
│   │   ├── 002_services.sql    services, service_staff, counters, staff_schedule
│   │   ├── 003_bookings.sql    customers, bookings, queue_tickets, ticket_counters
│   │   └── 004_ops.sql         checkins, notifications, audit_log, samples, rate_hits
│   └── internal/
│       ├── config/config.go        env loading, fails fast on missing secrets
│       ├── db/db.go                pgx pool w/ retry + auto-migrate on boot
│       ├── models/
│       │   ├── models.go           Business, Staff, Service, Counter, Schedule
│       │   └── booking.go          Booking, Ticket, Receipt, QueueSnapshot
│       ├── middleware/
│       │   ├── auth.go             JWT issue/parse, RequireRole, BizID scope
│       │   └── cors.go             hand-rolled (gin-contrib/cors needs Go 1.25)
│       ├── util/
│       │   ├── token.go            CSPRNG receipt tokens, booking codes, slugify
│       │   └── http.go             structured errors, phone normalise/mask
│       ├── ws/hub.go               room-based broadcast hub, ping/pong, backoff
│       └── handlers/
│           ├── queue_engine.go     ticket allocation, wait estimation, push helpers
│           ├── public.go           business page, slot generation
│           ├── booking.go          booking creation + rate limiting
│           ├── receipt.go          token → receipt, find, cancel
│           ├── auth.go             signup, login, me
│           ├── checkin.go          scan + check-in (the security core)
│           ├── queue.go            board, call next, actions, transfer, sockets
│           ├── business.go         business profile + schedule
│           ├── admin.go            services, counters, staff CRUD
│           └── dashboard.go        stats, bookings list, analytics, audit
│
└── frontend/
    ├── Dockerfile              node build → nginx serve
    ├── nginx.conf              SPA fallback + /api proxy w/ WS upgrade
    ├── vite.config.ts          port 3007, dev proxy to :8087
    ├── tailwind.config.js      brand palette, animations
    └── src/
        ├── main.tsx
        ├── App.tsx             router — fixed paths BEFORE /:slug catch-all
        ├── index.css           design system: .btn .card .field .chip
        ├── types/index.ts      mirrors Go models
        ├── lib/
        │   ├── api.ts          fetch wrapper, session, ApiError, openSocket
        │   ├── format.ts       money, dates, status meta, categories
        │   └── ticket.ts       PNG ticket renderer, share, .ics calendar
        ├── hooks/useLive.ts    useLiveSocket, usePolling, useBrowserNotify
        ├── components/UI.tsx   Spinner, ErrorBox, Empty, Alert, Steps, Modal
        └── pages/
            ├── public/LandingPage.tsx
            ├── customer/
            │   ├── BusinessEntry.tsx    /:slug — three big choices
            │   ├── BookingFlow.tsx      wizard: service → time → details → confirm
            │   ├── ReceiptPage.tsx      /r/:token — ticket, QR, live queue
            │   ├── FindBooking.tsx      phone + code recovery
            │   ├── KioskPage.tsx        walk-in tablet, auto-reset
            │   └── DisplayScreen.tsx    waiting-room TV, chime on call
            └── staff/
                ├── Auth.tsx             login + signup
                ├── SetupWizard.tsx      5-step onboarding
                ├── StaffLayout.tsx      sidebar / bottom tabs + role gating
                ├── DashboardPage.tsx    today at a glance
                ├── ScannerPage.tsx      webcam QR → CHECK IN
                ├── QueuePage.tsx        live board + call/recall/complete
                ├── BookingsPage.tsx     day / week / month calendar
                ├── AnalyticsPage.tsx    volume, peak hours, top services
                ├── SettingsPage.tsx     tab shell
                ├── BusinessTab.tsx      profile, hours, business QR
                ├── ServicesTab.tsx      service CRUD (+ Toggle component)
                └── TeamTab.tsx          counters + staff CRUD
```

## Conventions

- Every project gets its **own** `update.sh` (not a shared universal script).
- Deploy is always `build --no-cache && up -d --force-recreate` — never `restart`.
- Backend errors return `{error: "<code>", message: "<human sentence>"}` so the frontend
  can branch on the code while showing plain language to the user.
- Frontend never says "Authenticate", "Create reservation", or "Queue enrollment". It says
  "Continue", "Book Appointment", "Join Queue".
