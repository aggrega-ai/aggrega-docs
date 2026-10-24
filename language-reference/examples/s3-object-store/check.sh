#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds every Release of this example and checks each outcome against the one
# the README describes:
#
#   - release-compose.yaml and release-helm-synth.yaml build aggregate.yaml,
#     which attaches no key, so each must exit non-zero with the Recipe's
#     assertion, [CATALOG_ERROR E0033], naming the empty access_key_id slot.
#   - release-compose-auth.yaml and release-helm-synth-auth.yaml fill both
#     slots, so each must exit 0.
#
# The two halting Releases are not named release-negative*.yaml, so an exit
# status read on its own cannot tell an expected halt from a broken build; this
# script holds each Release to its own outcome instead.
#
# Every build runs through ./build-release.sh, so the aggrega binary is the one
# that helper resolves — AGGREGA_BIN, when it is set. Each build passes
# --auto-pull, because lockfiles are not shipped, and --no-color, so the output
# is read as plain text.
#
# Usage: ./check.sh [-- EXTRA aggrega build args]
#   Everything after -- is passed to every build, after the arguments above.
#
# Each build writes its output where any build of this workspace does: dist/
# beneath the workspace root. This script reads only exit codes and build
# output, so it neither reads nor removes that directory.
#
# Prints one line per build and exits 1 if any outcome differs from its
# expectation, printing the output of each build that differed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'check: %s\n' "$*" >&2; exit 2; }

declare -a EXTRA=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --) shift; EXTRA=("$@"); break ;;
    -h|--help)
      printf 'Usage: ./check.sh [-- EXTRA aggrega build args]\n'
      printf '  Builds the four Releases and checks each outcome: the two building\n'
      printf '  aggregate.yaml must halt with E0033 naming the empty access_key_id slot;\n'
      printf '  the two -auth Releases must complete. Exits 1 on any mismatch.\n'
      printf '  The binary is the one ./build-release.sh resolves (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

RELEASES="compose helm-synth compose-auth helm-synth-auth"

# What each Release does: pass, or halt.
expectation() {
  case "$1" in
    compose|helm-synth) printf 'halt' ;;
    *) printf 'pass' ;;
  esac
}
CODE='[CATALOG_ERROR E0033]'
SENTENCE='the access_key_id slot is empty'

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# has_line <log> <text>: the log holds a line that is exactly <text>.
has_line() {
  local line
  while IFS= read -r line; do [ "$line" = "$2" ] && return 0; done < "$1"
  return 1
}
# mentions <log> <text>: some line of the log contains <text>.
mentions() {
  local line
  while IFS= read -r line; do case "$line" in *"$2"*) return 0 ;; esac; done < "$1"
  return 1
}

row() { printf '%-30s %-5s %-9s %s\n' "$@"; }

rc=0
FAILED=""
row RELEASE EXIT EXPECTED VERDICT
printf '%.0s-' {1..80}; printf '\n'

for rel in $RELEASES; do
  log="$WORK/$rel.log"
  ec=0
  "$HERE/build-release.sh" "$rel" -- --auto-pull --no-color ${EXTRA[@]+"${EXTRA[@]}"} > "$log" 2>&1 || ec=$?
  expected="$(expectation "$rel")"
  if [ "$expected" = "pass" ]; then
    if [ "$ec" -ne 0 ]; then
      verdict="MISMATCH: exited $ec"
    else
      verdict="OK: completed"
    fi
  else
    if [ "$ec" -eq 0 ]; then
      verdict="MISMATCH: completed"
    elif ! has_line "$log" "$CODE"; then
      verdict="MISMATCH: exited $ec with no $CODE"
    elif ! mentions "$log" "$SENTENCE"; then
      verdict="MISMATCH: $CODE without \"$SENTENCE\""
    else
      verdict="OK: E0033, the empty access_key_id slot"
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
