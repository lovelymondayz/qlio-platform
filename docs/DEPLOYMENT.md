# Qlio — Deployment & Routing

## How traffic reaches Qlio

```
browser → Cloudflare (TLS, DNS) → cloudflared tunnel → VPS nginx :443
                                                        ├── /api/*  → localhost:8087  (backend)
                                                        └── /*      → localhost:3007  (frontend)
```

Ports: **backend 8087 · frontend 3007 · postgres 5438**
Domain: **qlio.arjism.com**

### The cloudflared tunnel is dashboard-managed

`cloudflared` runs as a systemd service started with `--token`, not a local
config file:

```
ExecStart=/usr/bin/cloudflared --no-autoupdate tunnel run --token eyJhIj...
```

That means **the hostname → service mapping lives in the Cloudflare Zero Trust
dashboard, not on this box.** There is no `/etc/cloudflared/config.yml` to read;
`/etc/cloudflared/` contains only `cert.pem`.

Consequence: `grep` will never explain how a hostname resolves here. Check the
Cloudflare dashboard (Networks → Tunnels → public hostnames).

### nginx vhost

`/etc/nginx/sites-available/qlio.arjism.com`, symlinked into `sites-enabled/`,
matching every other project on this VPS (pico, sayless, members).

Until 2026-08-19 this file existed but was **not symlinked**, so `nginx -T`
contained no qlio server block and the tunnel pointed straight at the container.
The site worked, but the routing was undocumented and inconsistent with the rest
of the fleet. Now enabled, so all projects follow one pattern.

WebSocket upgrade relies on the shared map in `/etc/nginx/conf.d/ws_upgrade.conf`
(`$connection_upgrade`). Without it, `/api/*/ws` upgrades fail while plain HTTP
keeps working — an easy fault to misread as a backend bug.

#### Verifying a routing change

```bash
nginx -t                      # ALWAYS before reload — a syntax error takes down every site
nginx -s reload               # graceful, no dropped connections
for h in pico sayless members qlio; do
  curl -s -o /dev/null -w "$h=%{http_code}\n" https://$h.arjism.com
done
```

## Deploying

Push-to-deploy via the GitHub webhook receiver (`:9000`) → `update.sh`.
No polling, no GitHub Actions (the PAT lacks `workflow` scope).

```bash
./update.sh          # git pull, rebuild, recreate, health check
```

### Rebuild rules learned the hard way

- Use `build --no-cache` then `up -d --force-recreate`. Never `restart` — it
  reuses the old image and silently deploys nothing.
- **Never chain `build && up --force-recreate` on a live service.** A failed
  build still tears down working containers. Build first, confirm the image
  exists, then recreate.

## Database

```bash
# seed demo data (idempotent — safe to re-run)
./scripts/seed.sh

# backups: nightly 03:00 via /root/hermes/scripts/backup-all.sh
```

`docker exec` takes **`-i`**, never `-T` (that is compose-only). Passing the
wrong flag silently produces ~20-byte empty "successful" backups.
