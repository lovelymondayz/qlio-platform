#!/bin/bash
# Option A verification: Directions data, customer cancel removed, staff booking actions.
cd /root/qlio-platform
B=http://localhost:8087
P=0; F=0
ck(){ if [ "$2" = "$3" ]; then echo "  ✓ $1"; P=$((P+1)); else echo "  ✗ $1 (got '$2' want '$3')"; F=$((F+1)); fi; }
has(){ if echo "$2" | grep -q "$3"; then echo "  ✓ $1"; P=$((P+1)); else echo "  ✗ $1"; F=$((F+1)); fi; }

E="optA$(date +%s)@t.local"
S=$(curl -s -X POST $B/api/auth/signup -H 'Content-Type: application/json' \
  -d "{\"business_name\":\"Option A Co\",\"owner_name\":\"O\",\"email\":\"$E\",\"password\":\"testpass123\"}")
T=$(echo "$S" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
SL=$(echo "$S" | grep -o '"business_slug":"[^"]*' | cut -d'"' -f4)
echo "slug=$SL"

curl -s -X PUT $B/api/staff/business -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"name":"Option A Co","address":"Jl. Sudirman 1, Jakarta","phone":"0215550001","map_url":"https://maps.app.goo.gl/test"}' >/dev/null

SVC=$(curl -s -X POST $B/api/staff/services -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"name":"Consult","duration_min":30,"ticket_prefix":"A","allow_queue":true,"allow_appointment":true}' \
  | grep -o '"id":[0-9]*' | cut -d: -f2)

D='{"days":['; for d in 0 1 2 3 4 5 6; do D="$D{\"weekday\":$d,\"is_open\":true,\"open_time\":\"00:00\",\"close_time\":\"23:59\"},"; done; D="${D%,}]}"
curl -s -X PUT $B/api/staff/schedule -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d "$D" >/dev/null

TOM=$(date -d tomorrow +%F)
mkbook(){ curl -s -X POST $B/api/public/b/$SL/book -H 'Content-Type: application/json' \
  -d "{\"service_id\":$SVC,\"kind\":\"appointment\",\"date\":\"$TOM\",\"time\":\"$1\",\"name\":\"$2\",\"phone\":\"08100000$3\"}"; }
bid(){ curl -s "$B/api/staff/bookings?from=$TOM&to=$TOM" -H "Authorization: Bearer $T" \
  | tr '}' '\n' | grep "$1" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2; }

echo
echo "=== §30 receipt exposes what Get Directions needs ==="
TOK=$(mkbook "10:00" "Andi" "01" | grep -o '"receipt_token":"[^"]*' | cut -d'"' -f4)
RCP=$(curl -s $B/api/public/receipt/$TOK)
has "map_url present" "$RCP" 'maps.app.goo.gl/test'
has "address present" "$RCP" 'Jl. Sudirman 1'
has "business phone present (contact-to-cancel)" "$RCP" '"phone":"'

echo
echo "=== customer self-cancel REMOVED ==="
ck "POST /receipt/:token/cancel → 404" \
   "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/public/receipt/$TOK/cancel)" "404"

echo
echo "=== §31 staff booking actions ==="
B1=$(bid "$TOK"); echo "  booking id = $B1"
ck "confirm → 200" \
   "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/api/staff/bookings/$B1/status -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"status":"confirmed"}')" "200"

T2=$(mkbook "11:00" "Budi" "02" | grep -o '"receipt_token":"[^"]*' | cut -d'"' -f4); B2=$(bid "$T2")
ck "no_show applied" \
   "$(curl -s -X PUT $B/api/staff/bookings/$B2/status -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"status":"no_show"}' | grep -o '"status":"[^"]*' | cut -d'"' -f4)" "no_show"

T3=$(mkbook "12:00" "Citra" "03" | grep -o '"receipt_token":"[^"]*' | cut -d'"' -f4); B3=$(bid "$T3")
ck "staff cancel applied" \
   "$(curl -s -X PUT $B/api/staff/bookings/$B3/status -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"status":"cancelled","reason":"customer phoned"}' | grep -o '"status":"[^"]*' | cut -d'"' -f4)" "cancelled"

echo
echo "=== security on the new endpoint ==="
ck "non-whitelisted status rejected" \
   "$(curl -s -X PUT $B/api/staff/bookings/$B1/status -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"status":"completed"}' | grep -o '"error":"[^"]*' | cut -d'"' -f4)" "bad_request"
ck "no JWT → 401" \
   "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/api/staff/bookings/$B1/status -H 'Content-Type: application/json' -d '{"status":"cancelled"}')" "401"
ck "re-closing a closed booking rejected" \
   "$(curl -s -X PUT $B/api/staff/bookings/$B3/status -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"status":"cancelled"}' | grep -o '"error":"[^"]*' | cut -d'"' -f4)" "already_processed"

T9=$(curl -s -X POST $B/api/auth/signup -H 'Content-Type: application/json' \
  -d "{\"business_name\":\"Other Biz\",\"owner_name\":\"X\",\"email\":\"xt$(date +%s)@t.local\",\"password\":\"testpass123\"}" \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)
ck "cross-tenant → not_found" \
   "$(curl -s -X PUT $B/api/staff/bookings/$B1/status -H "Authorization: Bearer $T9" -H 'Content-Type: application/json' -d '{"status":"cancelled"}' | grep -o '"error":"[^"]*' | cut -d'"' -f4)" "not_found"

echo
echo "=== audit log ==="
AUD=$(curl -s $B/api/staff/audit -H "Authorization: Bearer $T" | grep -o 'booking_[a-z_]*' | sort -u | tr '\n' ' ')
echo "  logged: $AUD"
[ -n "$AUD" ] && { echo "  ✓ audit entries written"; P=$((P+1)); } || { echo "  ✗ none"; F=$((F+1)); }

echo
docker compose exec -T db psql -U qlio -d qlio -c "TRUNCATE businesses CASCADE; TRUNCATE rate_hits;" >/dev/null 2>&1
echo "cleanup: $(docker compose exec -T db psql -U qlio -d qlio -tAc 'SELECT COUNT(*) FROM businesses' 2>/dev/null) businesses"
echo "==============================="
echo "  PASS=$P  FAIL=$F"
echo "==============================="
