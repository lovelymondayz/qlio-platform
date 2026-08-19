-- Qlio seed part 1/3: tenants, staff, services, counters
-- Idempotent: wipes and recreates the two demo businesses only.
-- Password for every seeded account: qlio1234
BEGIN;

DELETE FROM businesses WHERE slug IN ('tokobudi', 'sehatgigi');

INSERT INTO businesses
  (slug, name, category, tagline, address, map_url, phone, email,
   timezone, currency, locale, theme_color,
   allow_appointments, allow_queue, allow_walkin, counter_label, setup_step)
VALUES
  ('tokobudi', 'Toko Budi Motor', 'workshop',
   'Servis motor cepat, harga jelas.',
   'Jl. Kemang Raya No. 24, Jakarta Selatan',
   'https://maps.google.com/?q=-6.2607,106.8140',
   '+62 21 7192 8844', 'halo@tokobudi.id',
   'Asia/Jakarta', 'IDR', 'id', 'indigo',
   TRUE, TRUE, TRUE, 'Bay', 5),
  ('sehatgigi', 'Klinik Sehat Gigi', 'dentist',
   'Perawatan gigi tanpa antre lama.',
   'Jl. Cikini Raya No. 8, Jakarta Pusat',
   'https://maps.google.com/?q=-6.1889,106.8420',
   '+62 21 3145 7700', 'admin@sehatgigi.id',
   'Asia/Jakarta', 'IDR', 'id', 'emerald',
   TRUE, TRUE, FALSE, 'Room', 5);

-- settings
INSERT INTO business_settings
  (business_id, slot_interval_min, max_days_ahead, ticket_reset_daily,
   notify_browser, almost_turn_ahead, auto_noshow_min)
SELECT id, 30, 30, TRUE, TRUE, 2, 0 FROM businesses WHERE slug='tokobudi'
UNION ALL
SELECT id, 20, 45, TRUE, TRUE, 3, 0 FROM businesses WHERE slug='sehatgigi';

-- weekly opening hours: Mon-Sat open, Sunday closed
INSERT INTO business_schedule (business_id, weekday, is_open, open_time, close_time, break_start, break_end)
SELECT b.id, d.wd,
       d.wd <> 0,
       CASE WHEN b.slug='tokobudi' THEN TIME '08:00' ELSE TIME '09:00' END,
       CASE WHEN b.slug='tokobudi' THEN TIME '17:00' ELSE TIME '20:00' END,
       TIME '12:00', TIME '13:00'
FROM businesses b
CROSS JOIN (SELECT generate_series(0,6) AS wd) d
WHERE b.slug IN ('tokobudi','sehatgigi');

-- staff: all five roles are represented so permissions can be tested
INSERT INTO staff (business_id, email, password_hash, name, role, title, is_provider, is_active)
SELECT id, 'budi@tokobudi.id',  '$2a$10$Z15cyh3.t1hkJFhOTBG3WORhFZb7odDVTGMfT4armFv5p74gEJ2Oq', 'Budi Santoso',  'owner',        'Pemilik',            FALSE, TRUE FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'rina@tokobudi.id',  '$2a$10$Z15cyh3.t1hkJFhOTBG3WORhFZb7odDVTGMfT4armFv5p74gEJ2Oq', 'Rina Wijaya',   'manager',      'Kepala Bengkel',     FALSE, TRUE FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'andi@tokobudi.id',  '$2a$10$Z15cyh3.t1hkJFhOTBG3WORhFZb7odDVTGMfT4armFv5p74gEJ2Oq', 'Andi Pratama',  'receptionist', 'Resepsionis',        FALSE, TRUE FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'joko@tokobudi.id',  '$2a$10$Z15cyh3.t1hkJFhOTBG3WORhFZb7odDVTGMfT4armFv5p74gEJ2Oq', 'Joko Susilo',   'provider',     'Teknisi Senior',     TRUE,  TRUE FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'agus@tokobudi.id',  '$2a$10$Z15cyh3.t1hkJFhOTBG3WORhFZb7odDVTGMfT4armFv5p74gEJ2Oq', 'Agus Hidayat',  'staff',        'Teknisi',            FALSE, TRUE FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'sarah@sehatgigi.id','$2a$10$Z15cyh3.t1hkJFhOTBG3WORhFZb7odDVTGMfT4armFv5p74gEJ2Oq', 'Dr. Sarah Amelia','owner',      'Dokter Gigi',        TRUE,  TRUE FROM businesses WHERE slug='sehatgigi'
UNION ALL SELECT id, 'michael@sehatgigi.id','$2a$10$Z15cyh3.t1hkJFhOTBG3WORhFZb7odDVTGMfT4armFv5p74gEJ2Oq','Dr. Michael Tan','provider',   'Dokter Gigi',        TRUE,  TRUE FROM businesses WHERE slug='sehatgigi'
UNION ALL SELECT id, 'dewi@sehatgigi.id', '$2a$10$Z15cyh3.t1hkJFhOTBG3WORhFZb7odDVTGMfT4armFv5p74gEJ2Oq', 'Dewi Lestari',  'receptionist', 'Resepsionis',        FALSE, TRUE FROM businesses WHERE slug='sehatgigi';

-- services
INSERT INTO services
  (business_id, name, description, icon, duration_min, buffer_min, price_cents,
   ticket_prefix, allow_appointment, allow_queue, max_daily, sort_order)
SELECT id, 'Ganti Oli', 'Oli mesin diganti, filter dicek.', '🛢️', 30, 5, 15000000, 'A', TRUE, TRUE, 0, 1 FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'Servis Lengkap', 'Servis menyeluruh mesin dan rem.', '🔧', 90, 10, 75000000, 'B', TRUE, FALSE, 8, 2 FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'Ganti Ban',   'Pemasangan ban baru, termasuk balancing.', '🛞', 45, 5, 30000000, 'C', TRUE, TRUE, 0, 3 FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'Cuci Motor',  'Cuci luar dalam.', '🚿', 20, 0, 3500000, 'D', FALSE, TRUE, 0, 4 FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'Konsultasi Umum', 'Pemeriksaan gigi menyeluruh.', '🦷', 30, 5, 10000000, 'A', TRUE, TRUE, 0, 1 FROM businesses WHERE slug='sehatgigi'
UNION ALL SELECT id, 'Scaling',     'Pembersihan karang gigi.', '✨', 45, 10, 35000000, 'B', TRUE, FALSE, 6, 2 FROM businesses WHERE slug='sehatgigi'
UNION ALL SELECT id, 'Tambal Gigi', 'Penambalan komposit.', '🪥', 60, 10, 45000000, 'C', TRUE, FALSE, 0, 3 FROM businesses WHERE slug='sehatgigi';

-- which provider can deliver which service
INSERT INTO service_staff (service_id, staff_id)
SELECT s.id, st.id FROM services s
JOIN businesses b ON b.id = s.business_id
JOIN staff st ON st.business_id = b.id AND st.is_provider = TRUE
WHERE b.slug IN ('tokobudi','sehatgigi')
ON CONFLICT DO NOTHING;

-- counters / bays / rooms
INSERT INTO counters (business_id, name, kind, sort_order, is_active)
SELECT id, 'Bay 1', 'counter', 1, TRUE FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'Bay 2', 'counter', 2, TRUE FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'Bay 3', 'counter', 3, TRUE FROM businesses WHERE slug='tokobudi'
UNION ALL SELECT id, 'Room 1', 'room', 1, TRUE FROM businesses WHERE slug='sehatgigi'
UNION ALL SELECT id, 'Room 2', 'room', 2, TRUE FROM businesses WHERE slug='sehatgigi';

COMMIT;
