#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds release.yaml with each combination of the three configuration layers
# the README describes, and checks each outcome against the one it describes.
# Five builds, each in its own copy of this workspace:
#
#   - the team's .aggrega-config.yaml alone;
#   - with the organization's file, org/config.yaml, named by --config;
#   - with the pipeline's file, pipeline/.aggrega-config-append-ci.yaml, copied
#     into the workspace directory, as a pipeline would drop it there;
#   - with both;
#   - with a copy of the organization's file that writes its attachment under
#     plugins.governance instead of plugins.governance_append, named by
#     --config. The team's plugins.governance replaces that list, so the
#     organization's rule does not run and only the team's verdict is printed.
#
# For each build it checks the exit status, whether dist/ was written, and the
# verdicts the build printed: each one's severity and message, written below
# for that combination, with nothing missing and nothing else. A build that
# reads the pipeline's file must also print the warning naming auto_pull, the
# scalar key that file carries, as ignored.
#
# Each copy is made in a temporary directory. It holds this workspace's
# .aggrega-config.yaml, Aggregate, Manifest, Release, policies/ and org/. The
# configuration lists no catalog directory, so the catalog entities come from
# the hub registry, unless the builds are given one — a --catalog passed after
# --, or AGGREGA_CATALOG_DIRS in the environment. No file in this directory is
# edited or written.
#
# Every build runs through the build-release.sh helper, so the aggrega binary is
# the one that helper resolves — AGGREGA_BIN, when it is set. Each build passes
# --auto-pull, because lockfiles are not shipped, and --no-color, so the output
# is read as plain text.
#
# Usage: ./check.sh [-- EXTRA aggrega build args]
#   Everything after -- is passed to every build, after the arguments above.
#
# Prints one line per build and the verdicts each printed, and exits 1 if any
# outcome differs from its expectation, printing the output of each build that
# differed.
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
      printf '  Builds release.yaml with the team'"'"'s configuration alone, with the\n'
      printf '  organization'"'"'s file named by --config, with the pipeline'"'"'s overlay in the\n'
      printf '  workspace, with both, and with the organization'"'"'s attachment written under\n'
      printf '  plugins.governance instead of plugins.governance_append; checks each exit\n'
      printf '  status, whether dist/ was written, and the severity and message of every\n'
      printf '  verdict printed. Exits 1 on any mismatch. The binary is the one\n'
      printf '  build-release.sh resolves (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

# The verdict messages.
HA='db runs with high availability off'
SHIP='web runs core/devtool/adminer, in the devtool category, which the organization does not ship'
LIC_DB='db runs core/datastore/mariadb 1.0.0, upstream licensing osi-approved'
LIC_WEB='web runs core/devtool/adminer 1.0.0, upstream licensing osi-approved'

# What each build prints: one "severity message" line per verdict, and
# "ignored key" for a key the pipeline's file carries that is not read.
expected() {
  case "$1" in
    team)
      printf '%s\n' "warn $HA" ;;
    organization)
      printf '%s\n' "warn $HA" "warn $SHIP" "info $LIC_DB" "info $LIC_WEB" ;;
    pipeline)
      printf '%s\n' "warn $HA" "halt $SHIP" "ignored auto_pull" ;;
    both)
      printf '%s\n' "warn $HA" "warn $SHIP" "info $LIC_DB" "info $LIC_WEB" "halt $SHIP" "ignored auto_pull" ;;
    replaced)
      printf '%s\n' "warn $HA" ;;
  esac
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# copy <dir> <with-pipeline|without-pipeline>: a copy of this workspace in <dir>,
# with the pipeline's overlay dropped into it or not.
copy() {
  local dir="$1"
  mkdir -p "$dir"
  cp -R "$HERE/.aggrega-config.yaml" "$HERE/aggregate.yaml" "$HERE/manifest.yaml" "$HERE/release.yaml" \
    "$HERE/policies" "$HERE/org" "$dir/"
  if [ "$2" = with-pipeline ]; then
    cp "$HERE/pipeline/.aggrega-config-append-ci.yaml" "$dir/"
  fi
}

# org_as_base <dir>: beside the copy's org/config.yaml, org/config-base.yaml —
# the same file with its attachment under plugins.governance rather than
# plugins.governance_append. Exits 2 if the file does not read as expected,
# rather than building a copy that does not differ the way it should.
org_as_base() {
  local cfg next
  cfg="$(cat "$1/org/config.yaml")"
  next="${cfg//"  governance_append:"/"  governance:"}"
  [ "$next" != "$cfg" ] || die "no plugins.governance_append in org/config.yaml to write as plugins.governance"
  printf '%s\n' "$next" > "$1/org/config-base.yaml"
}

# build <label> <dir> [args...]: one build in <dir>, its output to
# $WORK/<label>.log; prints its exit status.
build() {
  local label="$1" dir="$2" status=0
  shift 2
  "$HELPER" --example "$dir" -- --auto-pull --no-color "$@" ${EXTRA[@]+"${EXTRA[@]}"} \
    > "$WORK/$label.log" 2>&1 || status=$?
  printf '%s' "$status"
}

# verdicts <log>: one "severity message" line per verdict the log carries, and
# "ignored key" per key the overlay warning names, each once, in the order they
# first appear. A build that resolves its lockfile first can print a verdict
# twice, once while resolving and once while building; each is listed once.
verdicts() {
  local line take=0
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    if [ "$take" -eq 1 ]; then
      take=0
      case "$line" in
        'policy plugin "'*'" rejected the build: '*) printf 'halt %s\n' "${line#*rejected the build: }" ;;
        *) printf 'unexpected %s\n' "$line" ;;
      esac
      continue
    fi
    case "$line" in
      '[POLICY_ERROR E0005]') take=1 ;;
      'policy plugin "'*'" warning: '*) printf 'warn %s\n' "${line#*\" warning: }" ;;
      'info: policy plugin "'*'": '*) printf 'info %s\n' "${line#*\": }" ;;
      'warning: '*'.aggrega-config-append-ci.yaml: ignoring non-additive key "'*)
        line="${line#*ignoring non-additive key \"}"
        printf 'ignored %s\n' "${line%%\"*}" ;;
    esac
  done < "$1" | awk '!seen[$0]++'
}

layers() {
  case "$1" in
    team) printf 'team' ;;
    organization) printf 'team + organization' ;;
    pipeline) printf 'team + pipeline' ;;
    both) printf 'all three' ;;
    replaced) printf 'team + organization, plugins.governance' ;;
  esac
}

row() { printf '%-40s %-5s %-6s %s\n' "$@"; }

rc=0
FAILED=""
fail() { rc=1; FAILED="$FAILED $1"; }

row LAYERS EXIT DIST VERDICT
printf '%.0s-' {1..100}; printf '\n'

COMBOS="team organization pipeline both replaced"

for combo in $COMBOS; do
  dir="$WORK/$combo"
  case "$combo" in
    team)         copy "$dir" without-pipeline; ec="$(build "$combo" "$dir")" ;;
    organization) copy "$dir" without-pipeline; ec="$(build "$combo" "$dir" --config "$dir/org/config.yaml")" ;;
    pipeline)     copy "$dir" with-pipeline;    ec="$(build "$combo" "$dir")" ;;
    both)         copy "$dir" with-pipeline;    ec="$(build "$combo" "$dir" --config "$dir/org/config.yaml")" ;;
    replaced)     copy "$dir" without-pipeline; org_as_base "$dir"
                  ec="$(build "$combo" "$dir" --config "$dir/org/config-base.yaml")" ;;
  esac
  case "$combo" in team|organization|replaced) want_ec=0; want_dist=yes ;; *) want_ec=1; want_dist=no ;; esac
  if [ -d "$dir/dist" ]; then dist=yes; else dist=no; fi
  got="$(verdicts "$WORK/$combo.log" | sort)"
  want="$(expected "$combo" | sort)"
  if [ "$ec" -ne "$want_ec" ]; then
    verdict="MISMATCH: exited $ec, expected $want_ec"
  elif [ "$dist" != "$want_dist" ]; then
    verdict="MISMATCH: dist/ written: $dist, expected $want_dist"
  elif [ "$got" != "$want" ]; then
    verdict="MISMATCH: other verdicts than expected"
    { printf '=== expected\n%s\n=== read from the output\n%s\n' "$want" "$got"; } >> "$WORK/$combo.log"
  else
    verdict="OK"
  fi
  case "$verdict" in OK*) ;; *) fail "$combo" ;; esac
  row "$(layers "$combo")" "$ec" "$dist" "$verdict"
done

# The verdicts each build printed, in the order it first printed them.
for combo in $COMBOS; do
  printf '\n%s:\n' "$(layers "$combo")"
  while read -r severity message; do
    printf '  %-8s %s\n' "$severity" "$message"
  done < <(verdicts "$WORK/$combo.log")
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
