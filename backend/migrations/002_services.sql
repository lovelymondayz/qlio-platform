-- Qlio 002: services, counters, staff schedules
CREATE TABLE IF NOT EXISTS services (
    id             BIGSERIAL PRIMARY KEY,
    business_id    BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name           VARCHAR(140) NOT NULL,
    description    TEXT DEFAULT '',
    icon           VARCHAR(16) DEFAULT '',
    duration_min   INT NOT NULL DEFAULT 30,
    buffer_min     INT NOT NULL DEFAULT 0,
    price_cents    BIGINT NOT NULL DEFAULT 0,
    ticket_prefix  VARCHAR(4) NOT NULL DEFAULT 'A',
    allow_appointment BOOLEAN NOT NULL DEFAULT TRUE,
    allow_queue       BOOLEAN NOT NULL DEFAULT TRUE,
    max_daily      INT NOT NULL DEFAULT 0,
    sort_order     INT NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_svc_biz ON services(business_id, is_active);

CREATE TABLE IF NOT EXISTS service_staff (
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    staff_id   BIGINT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, staff_id)
);

CREATE TABLE IF NOT EXISTS counters (
    id          BIGSERIAL PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        VARCHAR(80) NOT NULL,
    kind        VARCHAR(24) NOT NULL DEFAULT 'counter',
    staff_id    BIGINT REFERENCES staff(id) ON DELETE SET NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_counter_biz ON counters(business_id, is_active);

CREATE TABLE IF NOT EXISTS staff_schedule (
    id         BIGSERIAL PRIMARY KEY,
    staff_id   BIGINT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    is_working BOOLEAN NOT NULL DEFAULT TRUE,
    start_time TIME NOT NULL DEFAULT '09:00',
    end_time   TIME NOT NULL DEFAULT '17:00',
    UNIQUE (staff_id, weekday)
);
