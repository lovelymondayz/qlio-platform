# Qlio — Disaster Recovery Runbook

How to bring Qlio back from nothing. Written to be followed by someone who has never
seen this project, on a fresh machine, without asking anyone questions.

**Live URL:** https://qlio.arjism.com
**Repo:** https://github.com/lovelymondayz/qlio-platform
**Ports:** backend `8087` · frontend `3007` · postgres `5438`

---

## 0. What you must have kept somewhere safe

The repo is public and recoverable. These two things are **not in the repo** and cannot be
regenerated — without them recovery is partial:

| Item | Why it matters | Where it lives |
|---|---|---|
| `.env` | `DB_PASSWORD` (dumps won't load without it) and `JWT_SECRET` (all staff sessions die without it) | `/root/qlio-platform/.env`, mode 600 |
| Newest `backups/qlio_*.sql.gz` | The actual customer data | `/root/qlio-platform/backups/` |

If `.env` is lost you can still recover, but every staff member must reset their password
and all active sessions are invalidated. **Copy `.env` off this machine.**

---

## 1. Scenario: data corrupted or wrongly deleted, containers fine

Fastest path. Nothing needs rebuilding.

```bash
cd /root/qlio-platform
./scripts/restore.sh --list      # see what you have
./scripts/restore.sh             # newest, or pass a specific file
```

The script takes a safety dump of the current state first, asks you to type `RESTORE`,
then recreates the backend and health-checks it. Expect `psql ERROR` lines referring to
`DROP ... does not exist` on a fresh database — those are normal.

**Verify:** log in at `/biz/login` with a known account. If login works, bcrypt hashes
survived and the restore is genuinely good.

---

## 2. Scenario: containers broken, host intact

```bash
cd /root/qlio-platform
docker compose down
docker compose build --no-cache
docker compose up -d --force-recreate
```

Or just `./update.sh --force`. Never use `docker compose restart` — it reuses the old
image and silently runs stale code.

The Go build takes **~12 minutes** on a 2-core box. That is normal, not a hang.

**Verify:**
```bash
docker compose ps                  # all three must say (healthy)
curl -fsS http://localhost:8087/api/health
curl -sI http://localhost:3007/ | head -1
```

---

## 3. Scenario: total loss — new VPS from scratch

### 3.1 Host prerequisites

```bash
docker --version          # need Compose v2 (`docker compose`, not docker-compose)
systemctl is-enabled docker   # must be 'enabled' so the stack survives reboot
```

Nothing else is required on the host. Go and Node are **not** needed — both build inside
containers. (This VPS happens to have Go 1.22.5 / Node 22 for local dev only.)

### 3.2 Clone and configure

```bash
cd /root
git clone https://github.com/lovelymondayz/qlio-platform.git
cd qlio-platform
```

Restore your saved `.env`. If it is genuinely gone, create a new one — accepting that all
existing password hashes stay valid but sessions reset:

```bash
cp .env.example .env
chmod 600 .env
# then edit: DB_PASSWORD and JWT_SECRET must be long random strings
openssl rand -hex 20   # DB_PASSWORD
openssl rand -hex 40   # JWT_SECRET
```

`.env` keys, all read by `backend/internal/config`:

```
DB_USER=qlio
DB_PASSWORD=<required — compose refuses to start without it>
DB_NAME=qlio
JWT_SECRET=<required in production>
PUBLIC_BASE_URL=https://qlio.arjism.com
```

### 3.3 Build and start

```bash
docker compose build --no-cache
docker compose up -d
```

Migrations in `backend/migrations/*.sql` apply **automatically on boot**, in filename
order, and are idempotent — every statement uses `IF NOT EXISTS`. There is no separate
migrate step and re-running is safe.

Confirm they ran:
```bash
docker compose logs backend | grep migrate
# migrate: applied 001_core.sql … 004_ops.sql
# qlio: listening on :8087
```

### 3.4 Load the data

```bash
mkdir -p backups
# copy your newest qlio_*.sql.gz into backups/
./scripts/restore.sh
```

### 3.5 Re-expose publicly

Routing is a **Cloudflare Tunnel** — `cloudflared` running on the host, token-based, with
routes configured in the Cloudflare dashboard (there is no local ingress file to restore).

In **Cloudflare Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames**, add:

| Field | Value |
|---|---|
| Subdomain | `qlio` |
| Domain | `arjism.com` |
| Service type | `HTTP` |
| URL | `localhost:3007` |

**Critical:** the scheme must be **`http`**, and the **port must be kept**. The container
serves plain HTTP only; the tunnel supplies TLS. Setting `https` against port 3007 causes
a TLS handshake against a non-TLS listener → **502**.

There is **no host nginx vhost and no origin certificate** for Qlio. Do not create one.
`/api` routing happens *inside* the frontend container via `frontend/nginx.conf`, which
proxies to `backend:8087` by container name.

**Verify:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://qlio.arjism.com/
curl -s https://qlio.arjism.com/api/health
```

If your browser still shows "site can't be reached" after this returns 200, that is
**browser cache**, not the server. Test in an incognito window before changing anything.

### 3.6 Re-arm backups

Cron is host state and is **not** in the repo:

```bash
LINE="0 2 * * * /root/qlio-platform/scripts/backup.sh >> /var/log/qlio-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'qlio-platform/scripts/backup.sh' ; echo "$LINE" ) | crontab -
crontab -l | grep qlio
systemctl is-active cron

chmod +x scripts/backup.sh scripts/restore.sh update.sh
./scripts/backup.sh          # prove it works now, not at 02:00 tomorrow
```

---

## 4. Full verification after any recovery

Run this to confirm the system genuinely works, not just that containers started.

```bash
B=http://localhost:8087
curl -s $B/api/health

# create a throwaway tenant
S=$(curl -s -X POST $B/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"business_name":"Recovery Check","owner_name":"T","email":"rc@test.local","password":"testpass123"}')
T=$(echo "$S" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
SL=$(echo "$S" | grep -o '"business_slug":"[^"]*' | cut -d'"' -f4)

# service — capture the RETURNED id. Service ids are a global sequence, so on a
# database that has seen prior use this will NOT be 1.
SVC=$(curl -s -X POST $B/api/staff/services -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Check","duration_min":30,"ticket_prefix":"A","allow_queue":true,"allow_appointment":true}' \
  | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "service id = $SVC"

# open every day so the test never fails merely because you ran it after closing time
DAYS='{"days":['
for d in 0 1 2 3 4 5 6; do
  DAYS="$DAYS{\"weekday\":$d,\"is_open\":true,\"open_time\":\"00:00\",\"close_time\":\"23:59\"},"
done
DAYS="${DAYS%,}]}"
curl -s -X PUT $B/api/staff/schedule -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "$DAYS"

# walk-in → ticket
R=$(curl -s -X POST $B/api/public/b/$SL/book -H 'Content-Type: application/json' \
  -d "{\"service_id\":$SVC,\"kind\":\"queue\",\"date\":\"$(date +%F)\",\"name\":\"Test\",\"phone\":\"0810000000\"}")
TOK=$(echo "$R" | grep -o '"receipt_token":"[^"]*' | cut -d'"' -f4)
echo "token = $TOK  (must be 24 chars)"

curl -s $B/api/public/receipt/$TOK          # receipt resolves, phone masked

# counter id is ALSO a global sequence — fetch the real one, do not assume 1
CTR=$(curl -s $B/api/staff/counters -H "Authorization: Bearer $T" \
  | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "counter id = $CTR"

curl -s -X POST $B/api/staff/queue/call-next -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d "{\"counter_id\":$CTR}"
```

Expected: signup returns a token · `service id` and `counter id` are non-empty · booking
returns a 24-char `receipt_token` · receipt shows `"phone_masked":"6281****000"` ·
call-next returns a ticket number such as `A001`.

**Both `service_id` and `counter_id` are global sequences, not per-business.** On a database
that has seen any prior use they will not be `1`. Always read the id the API returns.
Hardcoding them yields `invalid_service` or `queue_empty` — which is the tenant-isolation
check working correctly, not a bug.

**Then clean up:**
```bash
docker compose exec -T db psql -U qlio -d qlio -c "TRUNCATE businesses CASCADE;"
```

---

## 5. Known traps

| Symptom | Cause | Fix |
|---|---|---|
| Tunnel returns 502 | Route uses `https://…:3007` | Change scheme to `http`, keep the port |
| "Site can't be reached" after a working curl | Browser cached the earlier failure | Incognito, or flush `chrome://net-internals/#sockets` |
| Container `unhealthy` but serving fine | Healthcheck used `localhost` → resolves to `::1`, servers bind IPv4-only | Use `127.0.0.1` (already fixed in repo) |
| Queue board says "no one waiting" but tickets exist | Date computed in UTC instead of the business timezone — after 17:00 UTC a Jakarta business is already on tomorrow's date | Fixed in repo via `BizToday()` / `localToday()`. If reintroduced, check every `DefaultQuery("date", …)` |
| `invalid_service` or `queue_empty` in a test script | Hardcoded `service_id: 1` / `counter_id: 1` — these are **global** sequences, not per-tenant | Read the id the API returns |
| Camera scanner won't open | `getUserMedia` needs a secure context | Use `https://qlio.arjism.com/biz/scan`, never `http://IP:3007` |
| Code changes don't take effect | `docker compose restart` reuses the old image | `build --no-cache` + `up -d --force-recreate` |
| Compose exits immediately | `DB_PASSWORD` unset — it is `${DB_PASSWORD:?}` | Populate `.env` |
| `docker compose exec` fails from cron | No TTY | Always pass `-T` |
| Go build seems hung | ~12 min on 2 cores is normal | Wait, or run it with `background=true` |
| Disk filling up | Unbounded logs / build cache | Log caps are set; run `docker builder prune -af` |

---

## 6. What is NOT in the repo

Recreate these by hand — they are host state:

- `.env` (gitignored — secrets)
- `backups/*.sql.gz` (gitignored — customer PII)
- The crontab line for nightly backups
- The Cloudflare Tunnel public-hostname route
- `/var/log/qlio-backup.log`

Everything else — schema, code, Dockerfiles, compose, scripts, docs — is version
controlled and needs no manual reconstruction.
