#!/bin/bash
# Qlio — restore the database from a backup
# Usage: ./scripts/restore.sh                        # restore the newest backup
#        ./scripts/restore.sh backups/qlio_X.sql.gz  # restore a specific one
#        ./scripts/restore.sh --list                 # show what's available
#
# DESTRUCTIVE: this replaces the current database contents.
# A safety dump of the current state is taken first.

set -euo pipefail

PROJECT_DIR="/root/qlio-platform"
BACKUP_DIR="$PROJECT_DIR/backups"

cd "$PROJECT_DIR"
set -a; source .env; set +a
DB_USER="${DB_USER:-qlio}"
DB_NAME="${DB_NAME:-qlio}"

log() { echo "[$(date '+%F %T')] $*"; }

# --list
if [ "${1:-}" = "--list" ]; then
    echo "Available backups in $BACKUP_DIR:"
    if ! ls "$BACKUP_DIR"/qlio_*.sql.gz >/dev/null 2>&1; then
        echo "  (none)"
        exit 0
    fi
    ls -lh "$BACKUP_DIR"/qlio_*.sql.gz | awk '{print "  "$9"  "$5"  "$6" "$7" "$8}'
    exit 0
fi

# Pick the file
if [ -n "${1:-}" ]; then
    SRC="$1"
else
    SRC=$(ls -t "$BACKUP_DIR"/qlio_*.sql.gz 2>/dev/null | head -1 || true)
fi

if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
    log "FATAL: no backup file found. Try: ./scripts/restore.sh --list"
    exit 1
fi

if ! gzip -t "$SRC" 2>/dev/null; then
    log "FATAL: $SRC is corrupt (failed gzip check)"
    exit 1
fi

echo
echo "  ⚠️  RESTORE WILL REPLACE THE CURRENT DATABASE"
echo "      source : $SRC"
echo "      size   : $(du -h "$SRC" | cut -f1)"
echo "      target : $DB_NAME"
echo
CURRENT=$(docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM businesses" 2>/dev/null || echo "?")
echo "      current businesses in DB: $CURRENT"
echo
read -r -p "  Type RESTORE to continue: " CONFIRM
[ "$CONFIRM" = "RESTORE" ] || { log "Aborted."; exit 1; }

# Safety net: dump current state before overwriting it
mkdir -p "$BACKUP_DIR"
SAFETY="$BACKUP_DIR/pre-restore_$(date '+%Y%m%d_%H%M%S').sql.gz"
log "Taking safety dump of current state -> $(basename "$SAFETY")"
docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --clean --if-exists --no-owner --no-privileges 2>/dev/null | gzip -9 > "$SAFETY" || \
    log "WARN: safety dump failed (continuing anyway)"

log "Restoring from $(basename "$SRC")…"
if zcat "$SRC" | docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=0 > /tmp/qlio_restore.log 2>&1; then
    log "Restore completed"
else
    log "WARN: psql reported issues — check /tmp/qlio_restore.log"
fi

ERRS=$(grep -c "^ERROR" /tmp/qlio_restore.log 2>/dev/null || echo 0)
[ "$ERRS" -gt 0 ] && log "psql emitted $ERRS ERROR line(s) — DROP-on-empty errors are normal for a fresh DB"

NEW=$(docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM businesses" 2>/dev/null || echo "?")
log "Businesses now in DB: $NEW  (was $CURRENT)"

log "Recreating backend so it picks up a clean connection pool…"
docker compose up -d --force-recreate backend >/dev/null 2>&1
sleep 6
curl -fsS http://localhost:8087/api/health >/dev/null 2>&1 \
    && log "Backend healthy. Restore done." \
    || log "WARN: backend health check failed — run 'docker compose logs backend'"
