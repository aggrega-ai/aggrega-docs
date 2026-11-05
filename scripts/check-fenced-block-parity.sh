#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# check-fenced-block-parity.sh — hold the two fenced-block readers of this
# repository's scripts to one reading.
#
# check-getting-started-commands.mjs reads a page's fenced blocks in Node
# (fencedBlocks()); check-import-example.sh reads them with lib/fenced-blocks.awk,
# because it runs where Node is not set up. Each prints every block as
# "block <line> <info>" and "| <line>" lines — the Node script through its
# --fenced-blocks FILE mode, the awk reader as it is. This script runs both over
# one fixture, testdata/fenced-blocks.md, and compares each with the blocks the
# fixture should yield, testdata/fenced-blocks.expected; a reader that differs —
# and so the two readers differing from each other — fails it.
#
# Usage: check-fenced-block-parity.sh [--update]
#   --update  write testdata/fenced-blocks.expected from the Node reader, after a
#             deliberate change to the rules both readers follow and to the
#             fixture; then run as usual.
#
# Exit status: 0 both readers read the fixture as expected; 1 one does not, with
# the difference; 2 node is not on PATH, or a file is missing.
set -uo pipefail
export LC_ALL=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="$HERE/testdata/fenced-blocks.md"
EXPECTED="$HERE/testdata/fenced-blocks.expected"

die() { printf 'fenced-block parity: %s\n' "$*" >&2; exit 2; }
command -v node >/dev/null 2>&1 || die "node is not on PATH, so the Node reader cannot run"
[ -f "$FIXTURE" ] || die "no fixture at $FIXTURE"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
node "$HERE/check-getting-started-commands.mjs" --fenced-blocks "$FIXTURE" > "$WORK/node" || die "the Node reader failed"
awk -f "$HERE/lib/fenced-blocks.awk" "$FIXTURE" > "$WORK/awk" || die "the awk reader failed"

if [ "${1:-}" = --update ]; then
  cp "$WORK/node" "$EXPECTED"
  printf 'fenced-block parity: wrote %s\n' "$EXPECTED"
fi
[ -f "$EXPECTED" ] || die "no expected blocks at $EXPECTED"

rc=0
for reader in node awk; do
  if ! cmp -s "$EXPECTED" "$WORK/$reader"; then
    printf 'fenced-block parity: the %s reader reads the fixture differently:\n' "$reader"
    diff -u "$EXPECTED" "$WORK/$reader" | head -40
    rc=1
  fi
done
if [ "$rc" -eq 0 ]; then
  printf 'fenced-block parity: both readers read %d blocks of the fixture as expected\n' \
    "$(awk '/^block /' "$EXPECTED" | wc -l)"
fi
exit "$rc"
