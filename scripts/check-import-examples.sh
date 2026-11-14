#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio s.r.l.
#
# check-import-examples.sh — run the check script of every import example and
# report one line per example.
#
# An import example is an example whose README header puts it in the
# `importers` tier: the examples README defines that tier as a project written
# in another format, drafted into Aggrega files by `aggrega import`, then
# reviewed and built. The header is the one place an example says what it is,
# so this script keeps no list of its own: an example added to the tier is run
# from then on, and one moved out of it is not. The header is read with yq,
# the tool gen-examples-index.sh reads it with; that script, not this one,
# holds the header to its shape, so an example whose header yq cannot read is
# simply not in the tier here.
#
# Each import example is checked by its own check.sh, run with no arguments
# from the example's directory, in the environment this script was given:
# AGGREGA_BIN, AGGREGA_CATALOG_DIRS, AGGREGA_IMPORTER_CATALOG and the binary's
# own settings, such as AGGREGA_OFFLINE, reach it unchanged. What the check
# compares, validates and builds is its own to say; see its header, and
# check-import-example.sh, which every import example's check.sh runs. The
# examples are run one at a time, in the order of their directory names.
#
# Each example gets one line, with how long its check took:
#
#   import examples: <name>: passed (<seconds>s)
#   import examples: <name>: FAILED, exit <status> (<seconds>s)
#
# and a failed one is followed by the first lines its check printed on
# standard output, indented, or on standard error where it printed nothing on
# standard output. An import example with no executable check.sh fails, by
# name. A last line counts the examples run and those that failed.
#
# Usage:
#   check-import-examples.sh [--examples DIR] [--lines N]
#   check-import-examples.sh --list [--examples DIR]
#
#   --examples DIR  the examples folder (default: language-reference/examples
#                   beside this script's repository root)
#   --lines N       how many lines of a failed check's output to print
#                   (default: 12)
#   --list          run nothing: print the directory name of each import
#                   example, one per line, in the order a run checks them, and
#                   nothing else on standard output. It is how another script
#                   reads which examples are import examples without a second
#                   reading of the headers.
#
# Exit status: 0 when every import example's check passed, or, with --list,
# when at least one was listed; 1 when any check failed; 2 on a usage error, a
# missing examples folder, no yq on PATH, or no example in the importers tier,
# since a run that checked nothing proves nothing and an empty list names
# nothing.
set -uo pipefail
export LC_ALL=C

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EX="$ROOT/language-reference/examples"
LINES=12
LIST=0
TIER=importers

usage() { sed -n '2,/^set -uo/p' "${BASH_SOURCE[0]}" | sed -e '/^set -uo/d' -e 's/^# \{0,1\}//'; }
die() { printf 'import examples: %s\n' "$*" >&2; exit 2; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --examples) [ "$#" -ge 2 ] || die "--examples needs a directory"; EX="$2"; shift 2 ;;
    --lines)
      [ "$#" -ge 2 ] || die "--lines needs a number"
      [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "--lines takes a positive whole number, not \"$2\""
      LINES="$2"; shift 2 ;;
    --list) LIST=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[ -d "$EX" ] || die "no examples folder at $EX"
command -v yq >/dev/null 2>&1 || die "yq is not on PATH"

declare -a examples=()
for d in "$EX"/*/; do
  d=${d%/}
  [ -f "$d/README.md" ] || continue
  tier="$(yq --front-matter=extract '.example.tier // ""' "$d/README.md" 2>/dev/null)" || continue
  [ "$tier" = "$TIER" ] && examples+=("$d")
done
[ "${#examples[@]}" -gt 0 ] || die "no example in $EX has a README header naming the $TIER tier"

if [ "$LIST" -eq 1 ]; then
  for d in "${examples[@]}"; do printf '%s\n' "$(basename "$d")"; done
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

failed=0
for d in "${examples[@]}"; do
  name=$(basename "$d")
  if [ ! -x "$d/check.sh" ]; then
    printf 'import examples: %s: FAILED, no executable check.sh\n' "$name"
    failed=$((failed + 1))
    continue
  fi
  start=$SECONDS
  status=0
  ( cd "$d" && ./check.sh ) > "$WORK/out" 2> "$WORK/err" < /dev/null || status=$?
  took=$((SECONDS - start))
  if [ "$status" -eq 0 ]; then
    printf 'import examples: %s: passed (%ds)\n' "$name" "$took"
    continue
  fi
  failed=$((failed + 1))
  printf 'import examples: %s: FAILED, exit %d (%ds)\n' "$name" "$status" "$took"
  shown="$WORK/out"
  [ -s "$shown" ] || shown="$WORK/err"
  total=$(wc -l < "$shown")
  head -n "$LINES" "$shown" | sed 's/^/    /'
  if [ "$total" -gt "$LINES" ]; then
    printf '    [%d more lines; run %s/check.sh to read them all]\n' "$((total - LINES))" "${d#"$ROOT"/}"
  fi
done

printf 'import examples: %d run, %d failed\n' "${#examples[@]}" "$failed"
[ "$failed" -eq 0 ]
