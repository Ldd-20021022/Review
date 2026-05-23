#!/bin/bash
# Database backup script for 三甲评审系统
# Usage: ./backup.sh [backup_dir]
# Cron: 0 2 * * * /path/to/backup.sh /path/to/backups

BACKUP_DIR="${1:-./backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Determine database type from .env or default
DB_URL="${DATABASE_URL:-sqlite:///./emr.db}"

if [[ "$DB_URL" == sqlite* ]]; then
    # SQLite backup
    DB_PATH=$(echo "$DB_URL" | sed 's|sqlite:///||')
    DB_PATH="${DB_PATH:-./emr.db}"
    if [ -f "$DB_PATH" ]; then
        cp "$DB_PATH" "$BACKUP_DIR/emr_${TIMESTAMP}.db"
        echo "[$(date)] SQLite backup: $BACKUP_DIR/emr_${TIMESTAMP}.db"
    else
        echo "[$(date)] ERROR: SQLite file not found at $DB_PATH"
        exit 1
    fi
else
    # PostgreSQL backup
    pg_dump "$DB_URL" > "$BACKUP_DIR/pg_${TIMESTAMP}.sql"
    echo "[$(date)] PostgreSQL backup: $BACKUP_DIR/pg_${TIMESTAMP}.sql"
fi

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/emr_*.db 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null
ls -t "$BACKUP_DIR"/pg_*.sql 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null

echo "[$(date)] Cleanup done, keeping last 7 backups"
