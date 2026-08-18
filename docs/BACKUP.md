# Qlio Backup & Restore

## What's protected

The PostgreSQL database — every business, staff account, service, booking, queue ticket
and audit entry. This is the only stateful part of Qlio; the containers themselves are
disposable and rebuild from git.

## Schedule

```
0 2 * * *  /root/qlio-platform/scripts/backup.sh >> /var/log/qlio-backup.log 2>&1
```

Nightly at **02:00**. Retention **14 days**. Output: `backups/qlio_<YYYYMMDD_HHMMSS>.sql.gz`

## Manual use

```bash
make backup      # dump now
make backups     # list what's available
make restore     # restore the newest (prompts for confirmation)

./scripts/restore.sh backups/qlio_20260818_161320.sql.gz   # restore a specific one
```

## Safety features

The backup script **refuses to keep a bad dump**:

| Guard | Behaviour |
|---|---|
| DB container down | Exits non-zero, writes nothing |
| `pg_dump` fails | Deletes the partial file, prints stderr |
| Dump under 2000 bytes | Deletes it — a real dump is never that small |
| Failed `gzip -t` | Deletes it |

Non-zero exit codes mean cron mail and any monitoring will actually see failures, rather
than silently accumulating empty files.

The restore script takes a **safety dump of the current state first**
(`backups/pre-restore_<stamp>.sql.gz`), so a restore of the wrong file is itself
recoverable. It requires you to type `RESTORE` — no accidental single-keystroke wipes.

Dumps use `--clean --if-exists --no-owner --no-privileges`, so they are re-runnable
against both a populated and an empty database.

## Verified

The full cycle was tested against the live stack, not assumed:

```
businesses before wipe : 1  (Backup Test Clinic)
TRUNCATE businesses CASCADE
businesses after wipe  : 0
restore from backup
businesses after       : 1  (Backup Test Clinic)
staff                  : 1
tables                 : 17
psql ERROR lines       : 0
backend health         : 200
owner login after      : ✅ works — bcrypt hashes survived intact
```

## ⚠️ Off-site copy

Backups currently live on the **same disk** as the database. That protects against
accidental deletion, bad migrations, and application bugs — but **not** against disk
failure or losing the VPS.

For real durability, sync `backups/` somewhere else. Options:

```bash
# rclone to any cloud provider
rclone copy /root/qlio-platform/backups remote:qlio-backups

# or push to a private git repo / rsync to another host
rsync -az /root/qlio-platform/backups/ user@other-host:/backups/qlio/
```

Add whichever you choose as a second cron line after the nightly dump.

## Restore-from-scratch runbook

If the VPS is lost entirely:

```bash
git clone https://github.com/lovelymondayz/qlio-platform.git
cd qlio-platform
cp .env.example .env          # restore the ORIGINAL DB_PASSWORD and JWT_SECRET
./update.sh --force           # build + start
# copy your newest qlio_*.sql.gz into backups/
./scripts/restore.sh
```

**Keep `.env` somewhere safe and separate.** It is gitignored by design — without the
original `JWT_SECRET` every existing staff session is invalidated, and without
`DB_PASSWORD` the restored dump cannot be loaded.
