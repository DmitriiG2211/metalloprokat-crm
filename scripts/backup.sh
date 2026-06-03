#!/usr/bin/env sh
set -eu

mkdir -p backups
STAMP=$(date +%Y%m%d_%H%M%S)
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-crm}" "${POSTGRES_DB:-crm}" > "backups/crm_${STAMP}.sql"
echo "Backup saved to backups/crm_${STAMP}.sql"
