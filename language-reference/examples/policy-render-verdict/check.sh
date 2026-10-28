#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds every Release of this example under both policy engines and checks each
# outcome against the one the README describes: two engines — the files
# governance-rego.yaml and governance-cel.yaml, each named with --config — by
# eight Releases, a control and a planted violation for each of four targets.
#
#   - A planted violation must exit non-zero with a policy refusal,
#     [POLICY_ERROR E0005], whose message is the sentence written below for it,
#     and with no other refusal beside it.
#   - A control must exit 0 and write the same files, byte for byte, as the same
#     Release built with no policy attached, so the pass also shows the verdict
#     changed nothing. That reference is one more build per control, made first,
#     with a --config file that attaches nothing.
#
# The expectations are per Release, not per engine: both engines are held to the
# same sentence, so an engine that reads the rule differently fails here.
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
# dist/, and the script moves each tree away to compare it, so it starts from
# none and leaves none.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'check: %s\n' "$*" >&2; exit 2; }

declare -a EXTRA=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --) shift; EXTRA=("$@"); break ;;
    -h|--help)
      printf 'Usage: ./check.sh [-- EXTRA aggrega build args]\n'
      printf '  Builds the eight Releases under the two engines and checks each outcome:\n'
      printf '  a planted violation must halt with E0005 and the expected sentence; a\n'
      printf '  control must match, byte for byte, the same Release built with no policy.\n'
      printf '  Exits 1 on any mismatch. The binary is the one ./build-release.sh\n'
      printf '  resolves (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

ENGINES="rego cel"
RELEASES="helm helm-unpinned compose compose-unpinned terraform terraform-unencrypted cloudformation cloudformation-unencrypted"

# What each Release does under both engines: pass, or halt with this sentence.
expectation() {
  case "$1" in
    *-unpinned|*-unencrypted) printf 'halt' ;;
    *) printf 'pass' ;;
  esac
}
sentence() {
  case "$1" in
    helm-unpinned) printf '%s' 'helm/report-cronjob.yaml: container main runs registry.example.com/orders-report:latest, an image with no tag or the tag latest' ;;
    compose-unpinned) printf '%s' 'compose/docker-compose.yaml: service report runs registry.example.com/orders-report, an image with no tag or the tag latest' ;;
    terraform-unencrypted) printf '%s' 'terraform/modules/db/main.tf: the RDS instance db stores its data unencrypted' ;;
    cloudformation-unencrypted) printf '%s' 'cloudformation/cloudformation-stack.json: the RDS instance Db stores its data unencrypted' ;;
  esac
}

[ -e "$HERE/dist" ] && die "$HERE/dist exists; remove it first — the builds write dist/ and this script compares each tree it gets"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK" "$HERE/dist"' EXIT
printf '# A --config file that attaches nothing: the reference build.\n' > "$WORK/no-policy.yaml"

# build <label> <release> <config file>: one build, its output to $WORK/<label>.log
# and its tree to $WORK/<label>.dist; prints its exit status.
build() {
  local status=0
  "$HERE/build-release.sh" "$2" -- --config "$3" --auto-pull --no-color ${EXTRA[@]+"${EXTRA[@]}"} \
    > "$WORK/$1.log" 2>&1 || status=$?
  if [ -d "$HERE/dist" ]; then mv "$HERE/dist" "$WORK/$1.dist"; fi
  printf '%s' "$status"
}

# refusals <log>: the message of every [POLICY_ERROR E0005] in the log, one per
# line — the line after the code, without its "policy plugin "…" rejected the
# build: " lead.
refusals() {
  local line take=0
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    if [ "$take" -eq 1 ]; then
      take=0
      case "$line" in
        'policy plugin "'*'" rejected the build: '*) printf '%s\n' "${line#*rejected the build: }" ;;
        *) printf '%s\n' "(an unexpected line after the code: $line)" ;;
      esac
    elif [ "$line" = "[POLICY_ERROR E0005]" ]; then
      take=1
    fi
  done < "$1"
}

row() { printf '%-6s %-40s %-5s %-9s %s\n' "$@"; }

rc=0
FAILED=""
row ENGINE RELEASE EXIT EXPECTED VERDICT
printf '%.0s-' {1..110}; printf '\n'

for rel in $RELEASES; do
  [ "$(expectation "$rel")" = "pass" ] || continue
  label="none-$rel"
  ec="$(build "$label" "$rel" "$WORK/no-policy.yaml")"
  if [ "$ec" -eq 0 ] && [ -d "$WORK/$label.dist" ]; then
    verdict="OK"
  else
    verdict="MISMATCH: the reference build did not complete"; rc=1; FAILED="$FAILED $label"
  fi
  row none "release-$rel.yaml" "$ec" reference "$verdict"
done

for engine in $ENGINES; do
  for rel in $RELEASES; do
    label="$engine-$rel"
    expected="$(expectation "$rel")"
    ec="$(build "$label" "$rel" "$HERE/governance-$engine.yaml")"
    if [ "$expected" = "pass" ]; then
      if [ "$ec" -ne 0 ]; then
        verdict="MISMATCH: exited $ec"
      elif [ ! -d "$WORK/none-$rel.dist" ]; then
        verdict="MISMATCH: no reference tree to compare with"
      elif ! diff -r "$WORK/none-$rel.dist" "$WORK/$label.dist" > "$WORK/$label.diff" 2>&1; then
        verdict="MISMATCH: the tree differs from the build with no policy"
        cat "$WORK/$label.diff" >> "$WORK/$label.log"
      else
        verdict="OK: completed, byte-identical to the build with no policy"
      fi
    else
      want="$(sentence "$rel")"
      count=0
      other=""
      while IFS= read -r msg; do
        count=$((count + 1))
        if [ "$msg" != "$want" ] && [ -z "$other" ]; then other="$msg"; fi
      done < <(refusals "$WORK/$label.log")
      if [ "$ec" -eq 0 ]; then
        verdict="MISMATCH: completed"
      elif [ "$count" -eq 0 ]; then
        verdict="MISMATCH: exited $ec with no E0005 policy refusal"
      elif [ -n "$other" ]; then
        verdict="MISMATCH: E0005 says \"$other\"; expected \"$want\""
      elif [ -d "$WORK/$label.dist" ]; then
        verdict="MISMATCH: halted, but wrote dist/"
      else
        verdict="OK: E0005, the expected sentence"
      fi
    fi
    case "$verdict" in OK*) ;; *) rc=1; FAILED="$FAILED $label" ;; esac
    row "$engine" "release-$rel.yaml" "$ec" "$expected" "$verdict"
  done
done

printf '\n'
if [ "$rc" -ne 0 ]; then
  n=0
  for label in $FAILED; do
    n=$((n + 1))
    printf '=== output of %s\n' "$label"
    cat "$WORK/$label.log"
    printf '\n'
  done
  printf 'check: %d build(s) did not end as expected.\n' "$n"
else
  printf 'check: every build ended as expected.\n'
fi
exit "$rc"
