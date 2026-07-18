# Off-host encrypted backups (B536)

`pg_dump` → gpg (AES256) → rclone to S3 → rotation → Telegram alert on failure.
A node death or accidental delete no longer loses data: every dump is streamed
off-box to two **independent** RU object-storage accounts.

## Files

| File | Where it lives |
|------|----------------|
| `offhost-backup.sh` | `/opt/eterapy/offhost-backup.sh` on the node |
| `backup.env` (from `backup.env.example`) | `/opt/eterapy/backup.env`, chmod 600 |
| `eterapy-backup.service` / `.timer` | `/etc/systemd/system/` |
| rclone remotes | `/root/.config/rclone/rclone.conf`, chmod 600 |

## 152-ФЗ contour rule

RU production dumps contain РФ personal data → they may land **only** in RU
object storage (cloud.ru), never AWS. `BACKUP_REMOTES` on eterapy-1 points at
`cloudru1` + `cloudru2` (two accounts = two independent RU copies). The Foreign
contour (B540) will get its own AWS destination for non-RU data.

## Schedule / RPO

Timer runs every 6h (`00,06,12,18:00 + jitter`, `Persistent=true`). Worst-case
**RPO = 6h**. Tighten by editing `eterapy-backup.timer` `OnCalendar` (WAL
archiving would push RPO to minutes — future step).

## Restore procedure (RTO drill — verified 2026-07-18)

```sh
# 1. Newest object from either RU copy
OBJ=$(sudo rclone lsf cloudru1:eterapy-data/db | sort | tail -1)
sudo rclone copyto "cloudru1:eterapy-data/db/$OBJ" /tmp/restore.dump.gpg

# 2. Decrypt (passphrase = BACKUP_PASSPHRASE from backup.env / infra creds)
sudo gpg --batch --passphrase "$PASS" -o /tmp/restore.dump -d /tmp/restore.dump.gpg

# 3. Integrity check without touching the live DB
pg_restore --list /tmp/restore.dump | head

# 4. Restore into a scratch DB, verify, then swap or promote
sudo -u postgres psql -c 'CREATE DATABASE eterapy_restore_test'
sudo -u postgres pg_restore --no-owner --no-acl -d eterapy_restore_test /tmp/restore.dump
sudo -u postgres psql -d eterapy_restore_test \
  -tAc "select count(*) from information_schema.tables where table_schema='public'"
```

Measured on eterapy-1 (22 MB DB): dump+encrypt+ship ≈ 4 s; full restore drill
< 30 s. **RTO for this size: minutes.**

## Alerting

`backup.env` carries `TG_TOKEN` (reused fleet bot). Set `TG_CHAT` to the fleet
chat id to receive `🛑 BACKUP FAILED` / `💾 Backup OK` messages. Empty `TG_CHAT`
→ alerts silently no-op (backup still runs). systemd also records failures:
`journalctl -u eterapy-backup.service`.

## Rotation

Keeps the newest `BACKUP_KEEP` (default 14) objects per label on each remote
and locally. Older ones are pruned each run.
