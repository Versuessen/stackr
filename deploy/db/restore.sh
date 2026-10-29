#!/usr/bin/env sh
# Restore an encrypted backup into an EMPTY database (e.g. a new Neon branch), then point
# DATABASE_URL at it. Usage: BACKUP_PASSPHRASE=... ./restore.sh stackr-2026....sql.gz.enc "postgres://..."
set -eu
[ $# -eq 2 ] || { echo "usage: $0 <file.sql.gz.enc> <target DATABASE_URL>"; exit 1; }
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$1" | gunzip | psql "$2" -v ON_ERROR_STOP=1
