-- Qlio 003: customers, bookings, queue tickets
CREATE TABLE IF NOT EXISTS customers (
    id          BIGSERIAL PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        VARCHAR(140) NOT NULL,
    phone       VARCHAR(32) NOT NULL,
    email       VARCHAR(160) DEFAULT '',
    visit_count INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_cust_phone ON customers(business_id, phone);

-- status: pending_checkin | checked_in | waiting | almost | called | serving | completed | cancelled | no_show
CREATE TABLE IF NOT EXISTS bookings (
    id            BIGSERIAL PRIMARY KEY,
    business_id   BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_id    BIGINT REFERENCES services(id) ON DELETE SET NULL,
    customer_id   BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    staff_id      BIGINT REFERENCES staff(id) ON DELETE SET NULL,
    kind          VARCHAR(16) NOT NULL DEFAULT 'appointment',
    origin        VARCHAR(16) NOT NULL DEFAULT 'online',
    booking_code  VARCHAR(16) NOT NULL,
    receipt_token VARCHAR(48) NOT NULL,
    customer_name VARCHAR(140) NOT NULL,
    customer_phone VARCHAR(32) NOT NULL,
    customer_email VARCHAR(160) DEFAULT '',
    notes         TEXT DEFAULT '',
    service_date  DATE NOT NULL,
    scheduled_at  TIMESTAMPTZ,
    price_cents   BIGINT NOT NULL DEFAULT 0,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending_checkin',
    checked_in_at TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    cancelled_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_book_token ON bookings(receipt_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_book_code ON bookings(business_id, booking_code);
CREATE INDEX IF NOT EXISTS idx_book_biz_date ON bookings(business_id, service_date, status);
CREATE INDEX IF NOT EXISTS idx_book_phone ON bookings(business_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_book_sched ON bookings(business_id, scheduled_at);

CREATE TABLE IF NOT EXISTS queue_tickets (
    id            BIGSERIAL PRIMARY KEY,
    business_id   BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    booking_id    BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    service_id    BIGINT REFERENCES services(id) ON DELETE SET NULL,
    counter_id    BIGINT REFERENCES counters(id) ON DELETE SET NULL,
    served_by     BIGINT REFERENCES staff(id) ON DELETE SET NULL,
    service_date  DATE NOT NULL,
    prefix        VARCHAR(4) NOT NULL DEFAULT 'A',
    seq           INT NOT NULL,
    ticket_number VARCHAR(12) NOT NULL,
    state         VARCHAR(16) NOT NULL DEFAULT 'waiting',
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    called_at     TIMESTAMPTZ,
    serving_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    recall_count  SMALLINT NOT NULL DEFAULT 0,
    UNIQUE (business_id, service_date, prefix, seq)
);
CREATE INDEX IF NOT EXISTS idx_qt_active ON queue_tickets(business_id, service_date, state);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qt_booking ON queue_tickets(booking_id);

-- daily per-prefix counter, row-locked for atomic seq issuance
CREATE TABLE IF NOT EXISTS ticket_counters (
    business_id  BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_date DATE NOT NULL,
    prefix       VARCHAR(4) NOT NULL,
    last_seq     INT NOT NULL DEFAULT 0,
    PRIMARY KEY (business_id, service_date, prefix)
);
