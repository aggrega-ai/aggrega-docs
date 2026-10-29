#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds every Release of this example and checks each outcome against the one
# the README describes: four Releases that complete, one per target, and two
# that halt.
#
#   - A Release that completes must write the files the README shows, with
#     data-fix deployed without starting and report started by its schedule or,
#     on Docker Compose, by the stack starting: a suspended CronJob beside a
#     scheduled one on Kubernetes, a service behind the profile manual beside one
#     with no profile on Docker Compose, and a task definition with no schedule
#     beside a scheduled one on Terraform and CloudFormation.
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
      printf '  must write the files the README shows, and a Release that halts must halt\n'
      printf '  with the expected refusal. Exits 1 on any mismatch. The binary is the one\n'
      printf '  ./build-release.sh resolves (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

RELEASES="helm compose terraform cloudformation compose-scheduled terraform-unscheduled"

# What each Release does: complete, or halt with this refusal.
expectation() {
  case "$1" in
    compose-scheduled|terraform-unscheduled) printf 'halt' ;;
    *) printf 'complete' ;;
  esac
}
refusal() {
  case "$1" in
    compose-scheduled) printf '%s' 'assertion failed: the component "report" is scheduled "30 2 * * 1-5", and Docker Compose has no scheduler' ;;
    terraform-unscheduled) printf '%s' 'assertion failed: the component "report" has no schedule and carries no core/manual-trigger attachment' ;;
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

# between <text> <start> <end>: the part of text after the first start and
# before the first end that follows it; empty when start is absent.
between() {
  case "$1" in *"$2"*) ;; *) return 0 ;; esac
  local rest="${1#*"$2"}"
  printf '%s' "${rest%%"$3"*}"
}

# files <dir>: every file under dir, relative to it, one per line, sorted.
files() { (cd "$1" && find . -type f | sed 's|^\./||' | LC_ALL=C sort); }

# problem <text>: records why a completed build does not match what the README
# shows. The first one recorded is the one reported.
PROBLEM=""
problem() { [ -n "$PROBLEM" ] || PROBLEM="$1"; }
want() { case "$1" in *"$2"*) ;; *) problem "$3" ;; esac; }
refuse() { case "$1" in *"$2"*) problem "$3" ;; *) ;; esac; }

# inspect <release> <dir>: checks the tree a completed build wrote.
inspect() {
  local d="$2" f text
  case "$1" in
    helm)
      [ "$(files "$d")" = "$(printf 'helm/data-fix-cronjob.yaml\nhelm/report-cronjob.yaml')" ] \
        || problem "wrote $(files "$d" | tr '\n' ' ')instead of the two CronJobs"
      [ -f "$d/helm/data-fix-cronjob.yaml" ] || return 0
      [ -f "$d/helm/report-cronjob.yaml" ] || return 0
      text="$(cat "$d/helm/data-fix-cronjob.yaml")"
      want "$text" $'  schedule: 0 0 30 2 *\n  suspend: true\n' "data-fix is not a CronJob suspended on 0 0 30 2 *"
      text="$(cat "$d/helm/report-cronjob.yaml")"
      want "$text" $'  schedule: 30 2 * * 1-5\n  jobTemplate:' "report is not a CronJob on 30 2 * * 1-5"
      refuse "$text" 'suspend:' "report is suspended"
      ;;
    compose)
      f="$d/compose/docker-compose.yaml"
      [ -f "$f" ] || { problem "wrote no compose/docker-compose.yaml"; return 0; }
      text="$(cat "$f")"
      want "$text" $'\n  report:\n' "the Compose file has no report service"
      want "$text" $'\n  data-fix:\n' "the Compose file has no data-fix service"
      want "$(between "$text" $'\n  data-fix:\n' $'\n  report:\n')" $'    restart: "no"\n' "data-fix is restarted when it exits"
      want "$(between "$text" $'\n  data-fix:\n' $'\n  report:\n')" $'    profiles:\n      - manual' "data-fix is not behind the profile manual"
      want "$(between "$text" $'\n  report:\n' $'\nnetworks:')" $'    restart: "no"' "report is restarted when it exits"
      refuse "$(between "$text" $'\n  report:\n' $'\nnetworks:')" 'profiles:' "report is behind a profile"
      ;;
    terraform)
      f="$d/terraform/aggrega.modules.tf"
      [ -f "$f" ] || { problem "wrote no terraform/aggrega.modules.tf"; return 0; }
      text="$(cat "$f")"
      want "$text" 'module "data-fix" {' "the root configuration has no data-fix module"
      want "$text" 'module "report" {' "the root configuration has no report module"
      refuse "$(between "$text" 'module "data-fix" {' $'\n}')" 'schedule_expression' "data-fix is given a schedule"
      want "$(between "$text" 'module "report" {' $'\n}')" 'schedule_expression          = "cron(30 2 ? * 2,3,4,5,6 *)"' "report is not given the schedule cron(30 2 ? * 2,3,4,5,6 *)"
      ;;
    cloudformation)
      f="$d/cloudformation/cloudformation-stack.json"
      [ -f "$f" ] || { problem "wrote no cloudformation/cloudformation-stack.json"; return 0; }
      text="$(cat "$f")"
      want "$text" '"DataFixTaskDefinition": {' "the stack has no DataFixTaskDefinition"
      want "$text" '"ReportTaskDefinition": {' "the stack has no ReportTaskDefinition"
      want "$text" '"ScheduleExpression": "cron(30 2 ? * 2,3,4,5,6 *)",' "the stack has no schedule cron(30 2 ? * 2,3,4,5,6 *)"
      want "$(between "$text" '"ReportSchedule": {' '"Type": "AWS::Scheduler::Schedule"')" '"Ref": "ReportTaskDefinition"' "ReportSchedule does not start ReportTaskDefinition"
      refuse "$text" '"Ref": "DataFixTaskDefinition"' "something in the stack starts DataFixTaskDefinition"
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
      if [ -n "$PROBLEM" ]; then verdict="MISMATCH: $PROBLEM"; else verdict="OK: completed, the files the README shows"; fi
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
