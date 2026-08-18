-- Qlio 004: checkins, notifications, audit, service stats
CREATE TABLE IF NOT EXISTS checkins (
    id          BIGSERIAL PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    booking_id  BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    staff_id    BIGINT REFERENCES staff(id) ON DELETE SET NULL,
    method      VARCHAR(16) NOT NULL DEFAULT 'qr',
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip          VARCHAR(64) DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_booking ON checkins(booking_id);

CREATE TABLE IF NOT EXISTS notifications (
    id          BIGSERIAL PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    booking_id  BIGINT REFERENCES bookings(id) ON DELETE CASCADE,
    channel     VARCHAR(16) NOT NULL DEFAULT 'browser',
    event       VARCHAR(32) NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}',
    status      VARCHAR(16) NOT NULL DEFAULT 'queued',
    error       TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notif_pending ON notifications(status, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    business_id BIGINT REFERENCES businesses(id) ON DELETE CASCADE,
    staff_id    BIGINT REFERENCES staff(id) ON DELETE SET NULL,
    action      VARCHAR(48) NOT NULL,
    entity      VARCHAR(32) NOT NULL DEFAULT '',
    entity_id   BIGINT,
    meta        JSONB NOT NULL DEFAULT '{}',
    ip          VARCHAR(64) DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_biz ON audit_log(business_id, created_at DESC);

-- rolling service duration samples for wait estimation
CREATE TABLE IF NOT EXISTS service_samples (
    id           BIGSERIAL PRIMARY KEY,
    business_id  BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_id   BIGINT REFERENCES services(id) ON DELETE CASCADE,
    duration_sec INT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_samples ON service_samples(business_id, service_id, created_at DESC);

-- rate limiting for public lookup endpoints
CREATE TABLE IF NOT EXISTS rate_hits (
    id         BIGSERIAL PRIMARY KEY,
    bucket     VARCHAR(96) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate ON rate_hits(bucket, created_at DESC);
