-- Qlio seed part 3/3: queue tickets, counters, check-ins, history, audit
BEGIN;

-- Queue tickets for every Toko Budi booking that has arrived or queued.
-- ticket state mirrors booking status; seq drives the A001/A002 numbering.
INSERT INTO queue_tickets
  (business_id, booking_id, service_id, counter_id, served_by, service_date,
   prefix, seq, ticket_number, state, issued_at, called_at, serving_at, completed_at, recall_count)
SELECT
  bk.business_id, bk.id, bk.service_id,
  (SELECT id FROM counters WHERE business_id=bk.business_id AND name=v.counter),
  (SELECT id FROM staff WHERE business_id=bk.business_id AND email=v.served),
  bk.service_date,
  v.prefix, v.seq, v.prefix || lpad(v.seq::text, 3, '0'),
  v.state,
  now() - (v.issued || ' minutes')::interval,
  CASE WHEN v.called IS NULL THEN NULL ELSE now() - (v.called || ' minutes')::interval END,
  CASE WHEN v.serving IS NULL THEN NULL ELSE now() - (v.serving || ' minutes')::interval END,
  CASE WHEN v.done IS NULL THEN NULL ELSE now() - (v.done || ' minutes')::interval END,
  v.recalls
FROM bookings bk
JOIN businesses b ON b.id = bk.business_id AND b.slug='tokobudi'
JOIN (VALUES
  -- code, prefix, seq, state, counter, served, issued, called, serving, done, recalls
  ('QL-1F57C3','A',1,'completed','Bay 1','joko@tokobudi.id', 95,  90,  88, 35, 0),
  ('QL-3E82D9','A',2,'called',   'Bay 1','joko@tokobudi.id', 25,   3, NULL, NULL, 1),
  ('QL-7B36A8','C',1,'serving',  'Bay 2','joko@tokobudi.id', 20,  15,  12, NULL, 0),
  ('QL-6C48B2','D',1,'almost',   NULL,   NULL,               30, NULL, NULL, NULL, 0),
  ('QL-4D93E1','D',2,'waiting',  NULL,   NULL,               40, NULL, NULL, NULL, 0),
  ('QL-9A15F7','A',3,'waiting',  NULL,   NULL,               35, NULL, NULL, NULL, 0)
) AS v(code, prefix, seq, state, counter, served, issued, called, serving, done, recalls)
  ON v.code = bk.booking_code;

-- Sehat Gigi: one ticket currently being served
INSERT INTO queue_tickets
  (business_id, booking_id, service_id, counter_id, served_by, service_date,
   prefix, seq, ticket_number, state, issued_at, called_at, serving_at)
SELECT bk.business_id, bk.id, bk.service_id,
  (SELECT id FROM counters WHERE business_id=bk.business_id AND name='Room 1'),
  (SELECT id FROM staff WHERE business_id=bk.business_id AND email='sarah@sehatgigi.id'),
  bk.service_date, 'C', 1, 'C001', 'serving',
  now() - interval '25 minutes', now() - interval '20 minutes', now() - interval '18 minutes'
FROM bookings bk
JOIN businesses b ON b.id = bk.business_id AND b.slug='sehatgigi'
WHERE bk.booking_code = 'QL-C3D4E5';

-- ticket_counters must match the highest seq issued per prefix, or the next
-- real booking will collide on the (business, date, prefix, seq) unique index.
INSERT INTO ticket_counters (business_id, service_date, prefix, last_seq)
SELECT business_id, service_date, prefix, MAX(seq)
FROM queue_tickets
GROUP BY business_id, service_date, prefix
ON CONFLICT (business_id, service_date, prefix)
DO UPDATE SET last_seq = GREATEST(ticket_counters.last_seq, EXCLUDED.last_seq);

-- check-in records for everyone who arrived
INSERT INTO checkins (business_id, booking_id, staff_id, method, consumed_at, ip)
SELECT bk.business_id, bk.id,
       (SELECT id FROM staff WHERE business_id=bk.business_id AND email='andi@tokobudi.id'),
       CASE WHEN bk.origin='kiosk' THEN 'kiosk' ELSE 'qr' END,
       bk.checked_in_at, '127.0.0.1'
FROM bookings bk
JOIN businesses b ON b.id=bk.business_id AND b.slug='tokobudi'
WHERE bk.checked_in_at IS NOT NULL;

INSERT INTO checkins (business_id, booking_id, staff_id, method, consumed_at, ip)
SELECT bk.business_id, bk.id,
       (SELECT id FROM staff WHERE business_id=bk.business_id AND email='dewi@sehatgigi.id'),
       'qr', bk.checked_in_at, '127.0.0.1'
FROM bookings bk
JOIN businesses b ON b.id=bk.business_id AND b.slug='sehatgigi'
WHERE bk.checked_in_at IS NOT NULL;

-- Historical service durations so EstimateWait() has real data to average
-- instead of falling back to the configured duration.
INSERT INTO service_samples (business_id, service_id, duration_sec, created_at)
SELECT s.business_id, s.id,
       (s.duration_min * 60) + ((random() * 600)::int - 300),
       now() - ((n || ' hours')::interval)
FROM services s
JOIN businesses b ON b.id = s.business_id AND b.slug IN ('tokobudi','sehatgigi')
CROSS JOIN generate_series(1, 12) AS n
WHERE s.is_active;

-- Past week of completed bookings so analytics (peak hours, averages,
-- no-show rate, daily chart) render with a real trend rather than one point.
INSERT INTO bookings
  (business_id, service_id, customer_id, kind, origin, booking_code, receipt_token,
   customer_name, customer_phone, service_date, scheduled_at, price_cents,
   status, checked_in_at, completed_at, created_at)
SELECT b.id,
  s.id,
  (SELECT id FROM customers WHERE business_id=b.id ORDER BY random() LIMIT 1),
  CASE WHEN g.n % 3 = 0 THEN 'queue' ELSE 'appointment' END,
  CASE WHEN g.n % 3 = 0 THEN 'kiosk' ELSE 'online' END,
  'QL-H' || lpad(g.n::text, 5, '0'),
  'rcpt_demo_hist_' || g.n,
  'Pelanggan ' || g.n, '0812000' || lpad(g.n::text, 5, '0'),
  ((now() AT TIME ZONE b.timezone)::date - (1 + (g.n % 7))),
  (((now() AT TIME ZONE b.timezone)::date - (1 + (g.n % 7))) + ((9 + (g.n % 8)) || ':00')::time) AT TIME ZONE b.timezone,
  s.price_cents,
  CASE WHEN g.n % 11 = 0 THEN 'no_show' WHEN g.n % 13 = 0 THEN 'cancelled' ELSE 'completed' END,
  CASE WHEN g.n % 11 = 0 THEN NULL ELSE now() - ((24 * (1 + (g.n % 7))) || ' hours')::interval END,
  CASE WHEN g.n % 11 = 0 OR g.n % 13 = 0 THEN NULL
       ELSE now() - ((24 * (1 + (g.n % 7))) || ' hours')::interval + interval '40 minutes' END,
  now() - ((24 * (2 + (g.n % 7))) || ' hours')::interval
FROM businesses b
JOIN services s ON s.business_id = b.id AND s.sort_order = 1
CROSS JOIN generate_series(1, 42) AS g(n)
WHERE b.slug = 'tokobudi';

-- audit trail for the staff actions the seeded day implies
INSERT INTO audit_log (business_id, staff_id, action, entity, entity_id, meta, ip, created_at)
SELECT bk.business_id,
       (SELECT id FROM staff WHERE business_id=bk.business_id AND email='andi@tokobudi.id'),
       'checkin', 'booking', bk.id,
       jsonb_build_object('booking_code', bk.booking_code, 'method', 'qr'),
       '127.0.0.1', bk.checked_in_at
FROM bookings bk
JOIN businesses b ON b.id=bk.business_id AND b.slug='tokobudi'
WHERE bk.checked_in_at IS NOT NULL AND bk.booking_code NOT LIKE 'QL-H%';

INSERT INTO audit_log (business_id, staff_id, action, entity, entity_id, meta, ip, created_at)
SELECT qt.business_id,
       (SELECT id FROM staff WHERE business_id=qt.business_id AND email='joko@tokobudi.id'),
       'call_next', 'ticket', qt.id,
       jsonb_build_object('ticket', qt.ticket_number),
       '127.0.0.1', qt.called_at
FROM queue_tickets qt
JOIN businesses b ON b.id=qt.business_id AND b.slug='tokobudi'
WHERE qt.called_at IS NOT NULL;

COMMIT;
