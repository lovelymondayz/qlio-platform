-- Qlio seed part 2/3: customers + today's bookings in every §15 status
BEGIN;

-- customers
INSERT INTO customers (business_id, name, phone, email, visit_count)
SELECT b.id, c.nm, c.ph, c.em, c.vc
FROM businesses b
CROSS JOIN (VALUES
  ('Arji Surya Maulana', '081234567801', 'arji@example.com', 4),
  ('Siti Nurhaliza',     '081234567802', '',                 2),
  ('Bayu Firmansyah',    '081234567803', 'bayu@example.com', 1),
  ('Maya Kusuma',        '081234567804', '',                 7),
  ('Rudi Hartono',       '081234567805', '',                 3),
  ('Lina Marlina',       '081234567806', 'lina@example.com', 1),
  ('Fajar Nugroho',      '081234567807', '',                 5),
  ('Citra Dewi',         '081234567808', '',                 2)
) AS c(nm, ph, em, vc)
WHERE b.slug = 'tokobudi'
ON CONFLICT (business_id, phone) DO NOTHING;

INSERT INTO customers (business_id, name, phone, email, visit_count)
SELECT b.id, c.nm, c.ph, c.em, c.vc
FROM businesses b
CROSS JOIN (VALUES
  ('Putri Ananda',   '081298765401', 'putri@example.com', 3),
  ('Hendra Gunawan', '081298765402', '',                  1),
  ('Wulan Sari',     '081298765403', '',                  6)
) AS c(nm, ph, em, vc)
WHERE b.slug = 'sehatgigi'
ON CONFLICT (business_id, phone) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Today's bookings for Toko Budi. One booking per §15 status so the queue
-- board, receipt states, and analytics all have something real to render.
-- service_date uses the business timezone, matching BizToday() in Go.
-- ---------------------------------------------------------------------------
INSERT INTO bookings
  (business_id, service_id, customer_id, staff_id, kind, origin,
   booking_code, receipt_token, customer_name, customer_phone, customer_email,
   notes, service_date, scheduled_at, price_cents, status,
   checked_in_at, completed_at, cancelled_at, created_at)
SELECT
  b.id,
  (SELECT id FROM services WHERE business_id=b.id AND name=v.svc),
  (SELECT id FROM customers WHERE business_id=b.id AND phone=v.ph),
  (SELECT id FROM staff WHERE business_id=b.id AND email=v.provider),
  v.kind, v.origin, v.code, v.token, v.nm, v.ph, '',
  v.notes,
  (now() AT TIME ZONE b.timezone)::date,
  CASE WHEN v.sched IS NULL THEN NULL
       ELSE ((now() AT TIME ZONE b.timezone)::date + v.sched::time) AT TIME ZONE b.timezone
  END,
  (SELECT price_cents FROM services WHERE business_id=b.id AND name=v.svc),
  v.status,
  CASE WHEN v.ci IS NULL THEN NULL ELSE now() - (v.ci || ' minutes')::interval END,
  CASE WHEN v.done IS NULL THEN NULL ELSE now() - (v.done || ' minutes')::interval END,
  CASE WHEN v.canc IS NULL THEN NULL ELSE now() - (v.canc || ' minutes')::interval END,
  now() - (v.age || ' minutes')::interval
FROM businesses b
CROSS JOIN (VALUES
  -- nm, ph, svc, provider, kind, origin, code, token, sched, status, ci, done, canc, notes, age
  ('Arji Surya Maulana','081234567801','Ganti Oli','joko@tokobudi.id','appointment','online','QL-8F29A4','rcpt_demo_arji_8f29a4','14:30','pending_checkin',NULL,NULL,NULL,'Motor agak bergetar di kecepatan tinggi.','180'),
  ('Siti Nurhaliza','081234567802','Ganti Ban','joko@tokobudi.id','appointment','online','QL-2B71C5','rcpt_demo_siti_2b71c5','15:00','pending_checkin',NULL,NULL,NULL,'','150'),
  ('Bayu Firmansyah','081234567803','Cuci Motor','agus@tokobudi.id','queue','kiosk','QL-4D93E1','rcpt_demo_bayu_4d93e1',NULL,'waiting','40',NULL,NULL,'','45'),
  ('Maya Kusuma','081234567804','Ganti Oli','joko@tokobudi.id','queue','kiosk','QL-9A15F7','rcpt_demo_maya_9a15f7',NULL,'waiting','35',NULL,NULL,'','40'),
  ('Rudi Hartono','081234567805','Cuci Motor','agus@tokobudi.id','queue','kiosk','QL-6C48B2','rcpt_demo_rudi_6c48b2',NULL,'almost','30',NULL,NULL,'','35'),
  ('Lina Marlina','081234567806','Ganti Oli','joko@tokobudi.id','appointment','online','QL-3E82D9','rcpt_demo_lina_3e82d9','13:00','called','25',NULL,NULL,'','120'),
  ('Fajar Nugroho','081234567807','Ganti Ban','joko@tokobudi.id','queue','kiosk','QL-7B36A8','rcpt_demo_fajar_7b36a8',NULL,'serving','20',NULL,NULL,'','30'),
  ('Citra Dewi','081234567808','Ganti Oli','agus@tokobudi.id','appointment','online','QL-1F57C3','rcpt_demo_citra_1f57c3','10:00','completed','95','35',NULL,'','300')
) AS v(nm, ph, svc, provider, kind, origin, code, token, sched, status, ci, done, canc, notes, age)
WHERE b.slug = 'tokobudi';

-- cancelled + no_show (no queue ticket for these)
INSERT INTO bookings
  (business_id, service_id, customer_id, kind, origin, booking_code, receipt_token,
   customer_name, customer_phone, service_date, scheduled_at, price_cents, status,
   cancelled_at, created_at)
SELECT b.id,
  (SELECT id FROM services WHERE business_id=b.id AND name='Servis Lengkap'),
  (SELECT id FROM customers WHERE business_id=b.id AND phone='081234567802'),
  'appointment','online','QL-5A64E2','rcpt_demo_canc_5a64e2',
  'Siti Nurhaliza','081234567802',
  (now() AT TIME ZONE b.timezone)::date,
  ((now() AT TIME ZONE b.timezone)::date + TIME '11:00') AT TIME ZONE b.timezone,
  75000000,'cancelled', now() - interval '90 minutes', now() - interval '400 minutes'
FROM businesses b WHERE b.slug='tokobudi';

INSERT INTO bookings
  (business_id, service_id, customer_id, kind, origin, booking_code, receipt_token,
   customer_name, customer_phone, service_date, scheduled_at, price_cents, status, created_at)
SELECT b.id,
  (SELECT id FROM services WHERE business_id=b.id AND name='Ganti Oli'),
  (SELECT id FROM customers WHERE business_id=b.id AND phone='081234567805'),
  'appointment','online','QL-8D21F4','rcpt_demo_nosh_8d21f4',
  'Rudi Hartono','081234567805',
  (now() AT TIME ZONE b.timezone)::date,
  ((now() AT TIME ZONE b.timezone)::date + TIME '09:30') AT TIME ZONE b.timezone,
  15000000,'no_show', now() - interval '420 minutes'
FROM businesses b WHERE b.slug='tokobudi';

-- future appointments so the week/month calendar views are not empty
INSERT INTO bookings
  (business_id, service_id, customer_id, staff_id, kind, origin, booking_code, receipt_token,
   customer_name, customer_phone, service_date, scheduled_at, price_cents, status, created_at)
SELECT b.id,
  (SELECT id FROM services WHERE business_id=b.id AND name=v.svc),
  (SELECT id FROM customers WHERE business_id=b.id AND phone=v.ph),
  (SELECT id FROM staff WHERE business_id=b.id AND email='joko@tokobudi.id'),
  'appointment','online', v.code, v.token, v.nm, v.ph,
  ((now() AT TIME ZONE b.timezone)::date + v.dayoff),
  (((now() AT TIME ZONE b.timezone)::date + v.dayoff) + v.sched::time) AT TIME ZONE b.timezone,
  (SELECT price_cents FROM services WHERE business_id=b.id AND name=v.svc),
  'pending_checkin', now()
FROM businesses b
CROSS JOIN (VALUES
  ('Arji Surya Maulana','081234567801','Servis Lengkap','QL-C1D2E3','rcpt_demo_fut1_c1d2e3',1,'09:00'),
  ('Maya Kusuma','081234567804','Ganti Oli',        'QL-D4E5F6','rcpt_demo_fut2_d4e5f6',1,'11:30'),
  ('Fajar Nugroho','081234567807','Ganti Ban',      'QL-E7F8A9','rcpt_demo_fut3_e7f8a9',3,'14:00'),
  ('Citra Dewi','081234567808','Servis Lengkap',    'QL-F1A2B3','rcpt_demo_fut4_f1a2b3',5,'10:00')
) AS v(nm, ph, svc, code, token, dayoff, sched)
WHERE b.slug='tokobudi';

-- Klinik Sehat Gigi: a smaller day
INSERT INTO bookings
  (business_id, service_id, customer_id, staff_id, kind, origin, booking_code, receipt_token,
   customer_name, customer_phone, service_date, scheduled_at, price_cents, status, checked_in_at, created_at)
SELECT b.id,
  (SELECT id FROM services WHERE business_id=b.id AND name=v.svc),
  (SELECT id FROM customers WHERE business_id=b.id AND phone=v.ph),
  (SELECT id FROM staff WHERE business_id=b.id AND email=v.provider),
  'appointment','online', v.code, v.token, v.nm, v.ph,
  (now() AT TIME ZONE b.timezone)::date,
  ((now() AT TIME ZONE b.timezone)::date + v.sched::time) AT TIME ZONE b.timezone,
  (SELECT price_cents FROM services WHERE business_id=b.id AND name=v.svc),
  v.status,
  CASE WHEN v.ci IS NULL THEN NULL ELSE now() - (v.ci || ' minutes')::interval END,
  now() - interval '200 minutes'
FROM businesses b
CROSS JOIN (VALUES
  ('Putri Ananda','081298765401','Konsultasi Umum','sarah@sehatgigi.id','QL-A1B2C3','rcpt_demo_putri_a1b2c3','14:00','pending_checkin',NULL),
  ('Hendra Gunawan','081298765402','Scaling','michael@sehatgigi.id','QL-B2C3D4','rcpt_demo_hendra_b2c3d4','15:00','pending_checkin',NULL),
  ('Wulan Sari','081298765403','Tambal Gigi','sarah@sehatgigi.id','QL-C3D4E5','rcpt_demo_wulan_c3d4e5','11:00','serving','25')
) AS v(nm, ph, svc, provider, code, token, sched, status, ci)
WHERE b.slug='sehatgigi';

COMMIT;
