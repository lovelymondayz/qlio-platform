#!/usr/bin/env bash
# Qlio demo seed. Idempotent: re-running replaces the two demo tenants only.
#
#   ./scripts/seed.sh              # seed the running qlio-db container
#   ./scripts/seed.sh --sql-only   # print combined SQL to stdout
#
# Creates: 2 businesses, 8 staff (all 5 roles), 7 services, 5 counters,
# 11 customers, today's bookings in every status, live queue tickets,
# a week of history for analytics, and a matching audit trail.
# Password for every seeded account: qlio1234
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARTS="$DIR/seed_parts"
CONTAINER="${QLIO_DB_CONTAINER:-qlio-db}"
DB_USER="${QLIO_DB_USER:-qlio}"
DB_NAME="${QLIO_DB_NAME:-qlio}"

combined() { cat "$PARTS"/10_tenants.sql "$PARTS"/20_bookings.sql "$PARTS"/30_queue.sql; }

if [[ "${1:-}" == "--sql-only" ]]; then
  combined
  exit 0
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "✗ container '$CONTAINER' is not running" >&2
  exit 1
fi

echo "→ seeding $DB_NAME in $CONTAINER"
# NOTE: docker exec takes -i, never -T (-T is a compose-only flag).
if ! combined | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
      -v ON_ERROR_STOP=1 -q; then
  echo "✗ seed failed — no partial data committed (each part is one transaction)" >&2
  exit 1
fi

echo "→ verifying"
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c "
SELECT 'businesses='||(SELECT count(*) FROM businesses)
    ||' staff='||(SELECT count(*) FROM staff)
    ||' services='||(SELECT count(*) FROM services)
    ||' counters='||(SELECT count(*) FROM counters)
    ||' customers='||(SELECT count(*) FROM customers)
    ||' bookings='||(SELECT count(*) FROM bookings)
    ||' tickets='||(SELECT count(*) FROM queue_tickets)
    ||' samples='||(SELECT count(*) FROM service_samples)
    ||' audit='||(SELECT count(*) FROM audit_log);"

echo
echo "✓ seeded. Demo entry points:"
echo "    customer   /tokobudi        /sehatgigi"
echo "    kiosk      /kiosk/tokobudi"
echo "    display    /display/tokobudi"
echo "    staff      /biz/login  →  budi@tokobudi.id / qlio1234  (owner)"
echo "                              andi@tokobudi.id / qlio1234  (receptionist)"
echo "                              agus@tokobudi.id / qlio1234  (staff)"
