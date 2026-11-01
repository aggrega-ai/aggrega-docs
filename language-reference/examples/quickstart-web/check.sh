#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds every step of this example and checks each outcome against the one the
# README describes. Each step is a workspace of its own, in the directories 1/
# to 4/, and each build must complete and write:
#
#   1/  a Compose file running the web application and PostgreSQL, the
#       application handed the database's address under the PG* names and the
#       password as the ${QUICKSTART_DB_PASSWORD} reference, and no cache;
#   2/  the same, plus a Redis cache handed to the application under
#       REDIS_HOST and REDIS_PORT;
#   3/  one Terraform root configuration with the server, the RDS database and
#       the ElastiCache cache as module blocks, the application handed each
#       address as a module output reference and no password, and the
#       instance keeping its automated backups for RDS's own 7 days;
#   4/  the same, the instance keeping each backup for 14 days in the window
#       02:30-03:00.
#
# Every build runs through the shared build-release.sh helper, so the aggrega
# binary is the one that helper resolves — AGGREGA_BIN, when it is set. Each
# build passes --auto-pull, because lockfiles are not shipped, and --no-color,
# so the output is read as plain text.
#
# Usage: ./check.sh [-- EXTRA aggrega build args]
#   Everything after -- is passed to every build, after the arguments above.
#
# Prints one line per step and exits 1 if any outcome differs from its
# expectation, printing the output of each build that differed. Exits 2 before
# building anything if a step already holds a dist/ directory: each build
# writes dist/, and the script moves each tree away to read it, so it starts
# from none and leaves none.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$HERE/../../../scripts/build-release.sh"

die() { printf 'check: %s\n' "$*" >&2; exit 2; }

declare -a EXTRA=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --) shift; EXTRA=("$@"); break ;;
    -h|--help)
      printf 'Usage: ./check.sh [-- EXTRA aggrega build args]\n'
      printf '  Builds the four steps, 1/ to 4/, and checks that each completes and writes\n'
      printf '  what the README shows for it. Exits 1 on any mismatch. The binary is the one\n'
      printf '  the shared build-release.sh helper resolves (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

STEPS="1 2 3 4"
IMAGE='hub.aggrega.ai/tools/quickstart-web:1.0.0@sha256:cf87f67716c9c6fea961aceba636ca349e47af3900817f38090106647794e8d7'

[ -x "$HELPER" ] || die "no build helper at $HELPER"
for n in $STEPS; do
  [ -e "$HERE/$n/dist" ] && die "$HERE/$n/dist exists; remove it first — the builds write dist/ and this script reads each tree it gets"
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; for n in $STEPS; do rm -rf "$HERE/$n/dist"; done' EXIT

# build <step>: one build, its output to $WORK/<step>.log and its tree to
# $WORK/<step>.dist; prints its exit status.
build() {
  local status=0
  "$HELPER" --example "$HERE/$1" -- --auto-pull --no-color ${EXTRA[@]+"${EXTRA[@]}"} \
    > "$WORK/$1.log" 2>&1 || status=$?
  if [ -d "$HERE/$1/dist" ]; then mv "$HERE/$1/dist" "$WORK/$1.dist"; fi
  printf '%s' "$status"
}

# summary <step>: the step's one-line summary, the first line of its
# aggregate.yaml without the comment mark.
summary() { local line; IFS= read -r line < "$HERE/$1/aggregate.yaml"; printf '%s' "${line#\# }"; }

# files <dir>: every file under dir, relative to it, one per line, sorted.
files() { (cd "$1" && find . -type f | sed 's|^\./||' | LC_ALL=C sort); }

# problem <text>: records why a completed build does not match what the README
# shows. The first one recorded is the one reported.
PROBLEM=""
problem() { [ -n "$PROBLEM" ] || PROBLEM="$1"; }
want() { case "$1" in *"$2"*) ;; *) problem "$3" ;; esac; }
refuse() { case "$1" in *"$2"*) problem "$3" ;; *) ;; esac; }

# read_file <dir> <file>: records a problem when dir/file is missing, and sets
# text to the file's content, or to nothing when it is missing.
read_file() {
  text=""
  if [ -f "$1/$2" ]; then text="$(cat "$1/$2")"; else problem "wrote no $2"; fi
}

# compose_app <text>: what steps 1 and 2 share — the application and its
# database, the password left to Docker Compose to fill.
compose_app() {
  want "$1" "image: $IMAGE" "the web service does not run the pinned quickstart image"
  want "$1" '127.0.0.1:8080:8080' "the application is not published on 127.0.0.1:8080"
  want "$1" $'      PGDATABASE: appdb\n      PGHOST: db\n      PGPASSWORD: ${QUICKSTART_DB_PASSWORD}\n      PGPORT: "5432"\n      PGUSER: appuser' "the application is not handed the database as PGHOST db, PGPORT 5432, PGUSER appuser, PGDATABASE appdb and PGPASSWORD \${QUICKSTART_DB_PASSWORD}"
  want "$1" 'POSTGRES_PASSWORD: ${QUICKSTART_DB_PASSWORD}' "the database does not take its password from \${QUICKSTART_DB_PASSWORD}"
}

# aws_app <text>: what steps 3 and 4 share — three module blocks, each address
# a module output reference, and no password anywhere.
aws_app() {
  want "$1" 'module "web" {' "the root configuration holds no server module"
  want "$1" 'module "db" {' "the root configuration holds no database module"
  want "$1" 'module "cache" {' "the root configuration holds no cache module"
  want "$1" "image              = \"$IMAGE\"" "the server does not run the pinned quickstart image"
  want "$1" '"PGHOST":"${module.db.db_instance_address}"' "the server does not receive the database's address as the RDS module's output"
  want "$1" '"REDIS_HOST":"${module.cache.replication_group_primary_endpoint_address}"' "the server does not receive the cache's address as the ElastiCache module's output"
  want "$1" 'manage_master_user_password = true' "RDS does not manage the database's password"
  refuse "$1" 'PGPASSWORD' "a password is handed to the server"
  want "$1" 'engine_version             = "7.1"' "the cache does not run Redis OSS 7.1"
}

# inspect <step> <dir>: checks the tree a completed build wrote.
inspect() {
  local d="$2" text list
  list="$(files "$d")"
  case "$1" in
    1)
      [ "$list" = 'compose/docker-compose.yaml' ] || problem "wrote $(printf '%s' "$list" | tr '\n' ' ')instead of one Compose file"
      read_file "$d" compose/docker-compose.yaml
      compose_app "$text"
      refuse "$text" 'REDIS_HOST' "the application is handed a cache"
      refuse "$text" $'\n  cache:\n' "the Compose file runs a cache"
      ;;
    2)
      [ "$list" = 'compose/docker-compose.yaml' ] || problem "wrote $(printf '%s' "$list" | tr '\n' ' ')instead of one Compose file"
      read_file "$d" compose/docker-compose.yaml
      compose_app "$text"
      want "$text" $'\n  cache:\n    image: redis:' "the Compose file runs no Redis cache"
      want "$text" $'      REDIS_HOST: cache\n      REDIS_PORT: "6379"' "the application is not handed the cache as REDIS_HOST cache and REDIS_PORT 6379"
      ;;
    3)
      read_file "$d" terraform/aggrega.modules.tf
      aws_app "$text"
      want "$text" 'backup_retention_period     = 7' "the instance does not keep RDS's own 7 days of backups"
      refuse "$text" 'backup_window' "the instance sets a backup window"
      ;;
    4)
      read_file "$d" terraform/aggrega.modules.tf
      aws_app "$text"
      want "$text" $'  backup_retention_period     = 14\n  backup_window               = "02:30-03:00"' "the instance does not keep 14 days of backups in the window 02:30-03:00"
      ;;
  esac
}

row() { printf '%-42s %-5s %s\n' "$@"; }

rc=0
FAILED=""
row STEP EXIT VERDICT
printf '%.0s-' {1..100}; printf '\n'

for n in $STEPS; do
  ec="$(build "$n")"
  PROBLEM=""
  if [ "$ec" -ne 0 ]; then
    verdict="MISMATCH: exited $ec"
  elif [ ! -d "$WORK/$n.dist" ]; then
    verdict="MISMATCH: completed, but wrote no dist/"
  else
    inspect "$n" "$WORK/$n.dist"
    if [ -n "$PROBLEM" ]; then verdict="MISMATCH: $PROBLEM"; else verdict="OK: completed, what the README shows"; fi
  fi
  case "$verdict" in OK*) ;; *) rc=1; FAILED="$FAILED $n" ;; esac
  row "$n/ $(summary "$n")" "$ec" "$verdict"
done

printf '\n'
if [ "$rc" -ne 0 ]; then
  count=0
  for n in $FAILED; do
    count=$((count + 1))
    printf '=== output of %s/\n' "$n"
    cat "$WORK/$n.log"
    printf '\n'
  done
  printf 'check: %d step(s) did not build as expected.\n' "$count"
else
  printf 'check: every step built as expected.\n'
fi
exit "$rc"
