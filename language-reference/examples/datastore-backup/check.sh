#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds every Release of this example and checks each outcome against the one
# the README describes: five Releases that complete, each realizing the one
# core/backup attachment its own way, and one that halts.
#
#   - A Release that completes must write the backup the README shows for its
#     target: a Velero Schedule and its storage location; a CloudNativePG
#     ObjectStore and ScheduledBackup, with the Cluster naming the plugin; the
#     RDS instance's backup retention and window on Terraform and on
#     CloudFormation; or an AWS Backup vault, plan and selection, with the
#     instance keeping its own backups for 7 days. Each must also leave out
#     what belongs to another target: the other controller, or, on AWS, the
#     bucket.
#   - A Release that halts must exit non-zero with the refusal written below for
#     it, and write no dist/.
#
# Every build runs through ./build-release.sh, so the aggrega binary is the one
# that helper resolves — AGGREGA_BIN, when it is set. Each build passes
# --auto-pull, because lockfiles are not shipped, and --no-color, so the output
# is read as plain text.
#
# Usage: ./check.sh [-- EXTRA aggrega build args]
#   Everything after -- is passed to every build, after the arguments above.
#
# Prints one line per build and exits 1 if any outcome differs from its
# expectation, printing the output of each build that differed. Exits 2 before
# building anything if a dist/ directory is already here: each build writes
# dist/, and the script moves each tree away to read it, so it starts from none
# and leaves none.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'check: %s\n' "$*" >&2; exit 2; }

declare -a EXTRA=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --) shift; EXTRA=("$@"); break ;;
    -h|--help)
      printf 'Usage: ./check.sh [-- EXTRA aggrega build args]\n'
      printf '  Builds the six Releases and checks each outcome: a Release that completes\n'
      printf '  must write the backup the README shows for its target, and a Release that\n'
      printf '  halts must halt with the expected refusal. Exits 1 on any mismatch. The\n'
      printf '  binary is the one ./build-release.sh resolves (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

RELEASES="helm-velero helm-cloudnative-pg terraform cloudformation terraform-aws-backup compose"

# What each Release does: complete, or halt with this refusal.
expectation() {
  case "$1" in
    compose) printf 'halt' ;;
    *) printf 'complete' ;;
  esac
}
refusal() {
  case "$1" in
    compose) printf '%s' 'no recipe resolved for component/feature instance: add an explicit Manifest mapping for its type: feature "backup" (type "core/backup"); no feature recipe in the catalog implements core/backup:1.0.0 for capability "compose", the capability its component'"'"'s Recipe binds to; feature recipes implementing it for other capabilities: [cloudformation/backup-aws-backup:1.0.0 cloudformation/backup-native:1.0.0 helm/backup-cloudnative-pg:1.0.0 helm/backup-k8up:1.0.0 helm/backup-kasten:1.0.0 helm/backup-kubestash:1.0.0 helm/backup-mariadb-operator:1.0.0 helm/backup-velero:1.0.0 terraform/backup-aws-backup:1.0.0 terraform/backup-native:1.0.0]; pin one of those in the Manifest, and it renders as its own output beside the component'"'"'s, or write one for "compose", then map the type to it' ;;
  esac
}

[ -e "$HERE/dist" ] && die "$HERE/dist exists; remove it first — the builds write dist/ and this script reads each tree it gets"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK" "$HERE/dist"' EXIT

# build <release>: one build, its output to $WORK/<release>.log and its tree to
# $WORK/<release>.dist; prints its exit status.
build() {
  local status=0
  "$HERE/build-release.sh" "$1" -- --auto-pull --no-color ${EXTRA[@]+"${EXTRA[@]}"} \
    > "$WORK/$1.log" 2>&1 || status=$?
  if [ -d "$HERE/dist" ]; then mv "$HERE/dist" "$WORK/$1.dist"; fi
  printf '%s' "$status"
}

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

# inspect <release> <dir>: checks the tree a completed build wrote.
inspect() {
  local d="$2" text list
  list="$(files "$d")"
  case "$1" in
    helm-velero)
      read_file "$d" helm/db--backup--backup.yaml
      want "$text" $'kind: BackupStorageLocation\nmetadata:' "the backup file holds no BackupStorageLocation"
      want "$text" $'    bucket: "db-backups"\n    prefix: "orders-db-backup"' "the location does not write to db-backups under orders-db-backup"
      want "$text" 's3Url: "http://backups-default.orders:8333"' "the location does not reach the bucket at backups-default.orders"
      want "$text" $'kind: Schedule\nmetadata:' "the backup file holds no Schedule"
      want "$text" $'  schedule: "30 2 * * *"\n  template:\n    includedNamespaces:\n      - "orders"' "the Schedule does not run at 30 2 * * * over the namespace orders"
      want "$text" $'          "app": "db"' "the Schedule does not select the database's pods"
      want "$text" 'ttl: "336h0m0s"' "the Schedule does not keep each backup for 14 days"
      want "$list" 'helm/velero-deployment-velero-velero.yaml' "Velero is not deployed"
      want "$list" 'helm/db-statefulset.yaml' "the database is not a StatefulSet"
      refuse "$list" 'barman-cloud' "the Barman Cloud plugin is deployed"
      ;;
    helm-cloudnative-pg)
      read_file "$d" helm/db--backup--backup.yaml
      want "$text" $'kind: ObjectStore\nmetadata:' "the backup file holds no ObjectStore"
      want "$text" 'destinationPath: "s3://db-backups/orders/db-backup"' "the ObjectStore does not write to s3://db-backups/orders/db-backup"
      want "$text" 'retentionPolicy: "14d"' "the ObjectStore does not keep 14 days"
      want "$text" $'kind: ScheduledBackup\nmetadata:' "the backup file holds no ScheduledBackup"
      want "$text" $'  schedule: "0 30 2 * * *"\n  cluster:\n    name: "db"\n  method: "plugin"' "the ScheduledBackup does not back up db through the plugin at 0 30 2 * * *"
      read_file "$d" helm/db/cluster.yaml
      want "$text" $'    - name: "barman-cloud.cloudnative-pg.io"\n      isWALArchiver: true\n      parameters:\n        barmanObjectName: "db-backup"' "the Cluster does not archive through the plugin into db-backup"
      want "$list" 'helm/barman-cloud-deployment-cnpg-system-barman-cloud-plugin-barman-cloud.yaml' "the Barman Cloud plugin is not deployed"
      refuse "$list" 'velero' "Velero is deployed"
      ;;
    terraform)
      [ "$list" = "$(printf 'terraform/aggrega.modules.tf\nterraform/modules/db/main.tf')" ] \
        || problem "wrote $(printf '%s' "$list" | tr '\n' ' ') instead of the database's module alone"
      read_file "$d" terraform/modules/db/main.tf
      want "$text" $'  backup_retention_period = 14\n  backup_window           = "02:30-03:00"' "the instance does not keep 14 days of backups in the window 02:30-03:00"
      ;;
    cloudformation)
      [ "$list" = 'cloudformation/cloudformation-stack.json' ] \
        || problem "wrote $(printf '%s' "$list" | tr '\n' ' ') instead of the one stack template"
      read_file "$d" cloudformation/cloudformation-stack.json
      want "$text" '"BackupRetentionPeriod": 14,' "the instance does not keep 14 days of backups"
      want "$text" '"PreferredBackupWindow": "02:30-03:00",' "the instance's backup window is not 02:30-03:00"
      refuse "$text" 'AWS::Backup::' "the stack holds an AWS Backup resource"
      ;;
    terraform-aws-backup)
      [ "$list" = "$(printf 'terraform/aggrega.modules.tf\nterraform/modules/db--backup/backup.tf\nterraform/modules/db/main.tf')" ] \
        || problem "wrote $(printf '%s' "$list" | tr '\n' ' ') instead of the database's module and the attachment's"
      read_file "$d" terraform/modules/db--backup/backup.tf
      want "$text" 'resource "aws_backup_vault" "backup" {' "the attachment writes no backup vault"
      want "$text" 'schedule          = "cron(30 2 * * ? *)"' "the plan does not run at cron(30 2 * * ? *)"
      want "$text" 'delete_after = 14' "the plan does not keep each backup for 14 days"
      want "$text" 'iam_role_arn = "arn:aws:iam::123456789012:role/example-backup"' "the selection does not run under the role the Release names"
      want "$text" ':db:db",' "the selection does not name the instance db"
      read_file "$d" terraform/modules/db/main.tf
      want "$text" '  backup_retention_period = 7' "the instance does not keep its own backups for 7 days"
      refuse "$text" 'backup_window' "the instance sets a backup window"
      ;;
  esac
}

row() { printf '%-36s %-5s %-9s %s\n' "$@"; }

rc=0
FAILED=""
row RELEASE EXIT EXPECTED VERDICT
printf '%.0s-' {1..100}; printf '\n'

for rel in $RELEASES; do
  expected="$(expectation "$rel")"
  ec="$(build "$rel")"
  if [ "$expected" = "complete" ]; then
    PROBLEM=""
    if [ "$ec" -ne 0 ]; then
      verdict="MISMATCH: exited $ec"
    elif [ ! -d "$WORK/$rel.dist" ]; then
      verdict="MISMATCH: completed, but wrote no dist/"
    else
      inspect "$rel" "$WORK/$rel.dist"
      if [ -n "$PROBLEM" ]; then verdict="MISMATCH: $PROBLEM"; else verdict="OK: completed, the backup the README shows"; fi
    fi
  else
    want="$(refusal "$rel")"
    if [ "$ec" -eq 0 ]; then
      verdict="MISMATCH: completed"
    elif [ -d "$WORK/$rel.dist" ]; then
      verdict="MISMATCH: halted, but wrote dist/"
    else
      case "$(cat "$WORK/$rel.log")" in
        *"$want"*) verdict="OK: halted with the expected refusal" ;;
        *) verdict="MISMATCH: exited $ec without the refusal \"$want\"" ;;
      esac
    fi
  fi
  case "$verdict" in OK*) ;; *) rc=1; FAILED="$FAILED $rel" ;; esac
  row "release-$rel.yaml" "$ec" "$expected" "$verdict"
done

printf '\n'
if [ "$rc" -ne 0 ]; then
  n=0
  for rel in $FAILED; do
    n=$((n + 1))
    printf '=== output of release-%s.yaml\n' "$rel"
    cat "$WORK/$rel.log"
    printf '\n'
  done
  printf 'check: %d build(s) did not end as expected.\n' "$n"
else
  printf 'check: every build ended as expected.\n'
fi
exit "$rc"
