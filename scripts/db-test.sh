#!/usr/bin/env bash
# Boots a throwaway local Postgres 16, applies the auth stub + migrations, runs DB tests.
set -euo pipefail
shopt -s nullglob
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN=/usr/lib/postgresql/16/bin
PGDATA="$ROOT/.pgdata"
PORT=54329
RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="runuser -u postgres --"; fi

if [ ! -d "$PGDATA" ]; then
  mkdir -p "$PGDATA"; [ -n "$RUN_AS" ] && chown postgres "$PGDATA"
  $RUN_AS $PGBIN/initdb -D "$PGDATA" -U postgres -A trust >/dev/null
fi
$RUN_AS $PGBIN/pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp" -l "$PGDATA/log" -w start >/dev/null
trap '$RUN_AS $PGBIN/pg_ctl -D "$PGDATA" -m fast stop >/dev/null' EXIT

PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists orgbu_test" -c "create database orgbu_test"
$PSQL -d orgbu_test -c "alter database orgbu_test set app.identity_key = 'test-key'"
$PSQL -d orgbu_test -f "$ROOT/supabase/tests/auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  $PSQL -d orgbu_test -f "$f"
done

export DATABASE_URL="postgresql://postgres@localhost:$PORT/orgbu_test?host=/tmp"
cd "$ROOT" && pnpm --filter @orgbu/db test "$@"
