-- Qlio 001: core tenant tables
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS businesses (
    id            BIGSERIAL PRIMARY KEY,
    slug          VARCHAR(64) UNIQUE NOT NULL,
    name          VARCHAR(160) NOT NULL,
    category      VARCHAR(48) NOT NULL DEFAULT 'other',
    tagline       VARCHAR(200) DEFAULT '',
    logo_url      TEXT DEFAULT '',
    address       TEXT DEFAULT '',
    map_url       TEXT DEFAULT '',
    phone         VARCHAR(32) DEFAULT '',
    email         VARCHAR(160) DEFAULT '',
    timezone      VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    currency      VARCHAR(8) NOT NULL DEFAULT 'IDR',
    locale        VARCHAR(8) NOT NULL DEFAULT 'id',
    theme_color   VARCHAR(16) NOT NULL DEFAULT 'indigo',
    allow_appointments BOOLEAN NOT NULL DEFAULT TRUE,
    allow_queue        BOOLEAN NOT NULL DEFAULT TRUE,
    allow_walkin       BOOLEAN NOT NULL DEFAULT TRUE,
    counter_label VARCHAR(32) NOT NULL DEFAULT 'Counter',
    setup_step    SMALLINT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_biz_slug ON businesses(slug);

-- roles: owner | manager | receptionist | staff | provider
CREATE TABLE IF NOT EXISTS staff (
    id            BIGSERIAL PRIMARY KEY,
    business_id   BIGINT REFERENCES businesses(id) ON DELETE CASCADE,
    email         VARCHAR(160) NOT NULL,
    password_hash TEXT NOT NULL,
    name          VARCHAR(120) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'staff',
    title         VARCHAR(80) DEFAULT '',
    avatar_url    TEXT DEFAULT '',
    is_provider   BOOLEAN NOT NULL DEFAULT FALSE,
    is_super      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_email ON staff(lower(email));
CREATE INDEX IF NOT EXISTS idx_staff_biz ON staff(business_id);

CREATE TABLE IF NOT EXISTS business_schedule (
    id          BIGSERIAL PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    is_open     BOOLEAN NOT NULL DEFAULT TRUE,
    open_time   TIME NOT NULL DEFAULT '09:00',
    close_time  TIME NOT NULL DEFAULT '17:00',
    break_start TIME,
    break_end   TIME,
    UNIQUE (business_id, weekday)
);

CREATE TABLE IF NOT EXISTS business_settings (
    business_id        BIGINT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    slot_interval_min  SMALLINT NOT NULL DEFAULT 30,
    max_days_ahead     SMALLINT NOT NULL DEFAULT 30,
    ticket_reset_daily BOOLEAN NOT NULL DEFAULT TRUE,
    notify_browser     BOOLEAN NOT NULL DEFAULT TRUE,
    notify_email       BOOLEAN NOT NULL DEFAULT FALSE,
    notify_sms         BOOLEAN NOT NULL DEFAULT FALSE,
    notify_whatsapp    BOOLEAN NOT NULL DEFAULT FALSE,
    almost_turn_ahead  SMALLINT NOT NULL DEFAULT 2,
    auto_noshow_min    SMALLINT NOT NULL DEFAULT 0,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
