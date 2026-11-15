#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio s.r.l.
#
# check-build-commands-parity.sh — hold lib/build-commands.awk to the reading
# `aggrega draft --example` gives a page's Build section.
#
# lib/build-commands.awk reads the commands a runnable example's page gives to
# run next as the CLI reads them, in awk, because this repository's scripts run
# where no aggrega binary is built. This script runs the reader over every case
# in testdata/build-commands/, one page per case, and compares what it prints with
# testdata/build-commands.expected: "case <name>" for each case, in name order,
# then "| <line>" for each command line the page gives. The CLI's own tests pin
# the same cases with the same answers, so a reading changed on one side and not
# on the other fails one of the two.
#
# Usage: check-build-commands-parity.sh [--update]
#   --update  write testdata/build-commands.expected from the reader, after a
#             deliberate change to the rules, the cases and the CLI's tests
#             together; then run as usual.
#
# Exit status: 0 the reader reads every case as expected; 1 it does not, with the
# difference; 2 a file is missing, or the reader fails.
set -uo pipefail
export LC_ALL=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
READER="$HERE/lib/build-commands.awk"
CASES="$HERE/testdata/build-commands"
EXPECTED="$HERE/testdata/build-commands.expected"

die() { printf 'build-commands parity: %s\n' "$*" >&2; exit 2; }
[ -f "$READER" ] || die "no reader at $READER"
[ -d "$CASES" ] || die "no cases at $CASES"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
n=0
for page in "$CASES"/*.md; do
  [ -f "$page" ] || die "no case in $CASES"
  printf 'case %s\n' "$(basename "$page" .md)" >> "$WORK/read"
  awk -f "$READER" "$page" >> "$WORK/read" || die "the reader failed on $page"
  n=$((n + 1))
done

if [ "${1:-}" = --update ]; then
  cp "$WORK/read" "$EXPECTED"
  printf 'build-commands parity: wrote %s\n' "$EXPECTED"
fi
[ -f "$EXPECTED" ] || die "no expected reading at $EXPECTED"

if ! cmp -s "$EXPECTED" "$WORK/read"; then
  printf 'build-commands parity: lib/build-commands.awk reads the cases differently from testdata/build-commands.expected:\n'
  diff -u "$EXPECTED" "$WORK/read" | head -40
  exit 1
fi
printf 'build-commands parity: the reader reads all %d case(s) as expected\n' "$n"
exit 0
