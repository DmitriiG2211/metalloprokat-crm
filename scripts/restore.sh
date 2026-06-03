#!/usr/bin/env sh
set -eu

if [ $# -ne 1 ]; then
  echo "Usage: scripts/restore.sh backups/crm_YYYYMMDD_HHMMSS.sql"
  exit 1
fi

docker compose exec -T postgres psql -U "${POSTGRES_USER:-crm}" "${POSTGRES_DB:-crm}" < "$1"
echo "Database restored from $1"
