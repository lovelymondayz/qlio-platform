#!/bin/bash
# Qlio — nightly database backup
# Usage: ./scripts/backup.sh
# Cron:  0 2 * * * /root/qlio-platform/scripts/backup.sh >> /var/log/qlio-backup.log 2>&1
#
# Writes a gzipped pg_dump to backups/, prunes anything older than RETENTION_DAYS.
# Exits non-zero on failure so cron mail / monitoring can catch it.

set -euo pipefail

PROJECT_DIR="/root/qlio-platform"
BACKUP_DIR="$PROJECT_DIR/backups"
RETENTION_DAYS=14
MIN_BYTES=2000          # a valid dump is never smaller than this

cd "$PROJECT_DIR"

# Load DB credentials
if [ ! -f .env ]; then
    echo "[$(date '+%F %T')] FATAL: .env not found"
    exit 1
fi
set -a; source .env; set +a
DB_USER="${DB_USER:-qlio}"
DB_NAME="${DB_NAME:-qlio}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date '+%Y%m%d_%H%M%S')
OUT="$BACKUP_DIR/qlio_${STAMP}.sql.gz"

log() { echo "[$(date '+%F %T')] $*"; }

# Container must be up
if ! docker compose ps db 2>/dev/null | grep -q "Up\|running"; then
    log "FATAL: qlio-db is not running — nothing to back up"
    exit 1
fi

log "Dumping $DB_NAME -> $(basename "$OUT")"

# --clean --if-exists makes the dump safely re-runnable on restore
if ! docker compose exec -T db pg_dump \
        -U "$DB_USER" -d "$DB_NAME" \
        --clean --if-exists --no-owner --no-privileges \
        2>/tmp/qlio_pgdump_err | gzip -9 > "$OUT"; then
    log "FATAL: pg_dump failed"
    sed 's/^/    /' /tmp/qlio_pgdump_err | tail -5
    rm -f "$OUT"
    exit 1
fi

# Verify the dump is real, not an empty/truncated file
SIZE=$(stat -c%s "$OUT")
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
    log "FATAL: dump is only ${SIZE}B — refusing to keep a bad backup"
    rm -f "$OUT"
    exit 1
fi

# Verify gzip integrity
if ! gzip -t "$OUT" 2>/dev/null; then
    log "FATAL: gzip integrity check failed"
    rm -f "$OUT"
    exit 1
fi

log "OK: $(du -h "$OUT" | cut -f1) — $(zcat "$OUT" | grep -c 'CREATE TABLE' || echo '?') tables"

# Prune old backups
PRUNED=$(find "$BACKUP_DIR" -name 'qlio_*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete | wc -l)
[ "$PRUNED" -gt 0 ] && log "Pruned $PRUNED backup(s) older than ${RETENTION_DAYS}d"

TOTAL=$(find "$BACKUP_DIR" -name 'qlio_*.sql.gz' | wc -l)
log "Done. $TOTAL backup(s) on disk, $(du -sh "$BACKUP_DIR" | cut -f1) total"
