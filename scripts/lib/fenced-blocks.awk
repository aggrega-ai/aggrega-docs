# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# fenced-blocks.awk — print every closed fenced block of a Markdown page, as
# "block <line> <info>" and then "| <line as written>" for each of its lines.
#
# A fence opens on a run of three or more backticks or tildes indented by at
# most three spaces; its info word is the first word after the run; it closes on
# a line holding nothing but a run of the same character at least as long. A
# block never closed is not a block. A carriage return ending a line is dropped.
#
# Usage: awk -f scripts/lib/fenced-blocks.awk PAGE
#
# check-import-example.sh reads a walkthrough page's blocks with it, and
# check-fenced-block-parity.sh runs it over that check's fixture.
#
# 🔴 DELIBERATE NEAR-DUPLICATE of fencedBlocks() in
# scripts/check-getting-started-commands.mjs: check-import-example.sh runs in the
# examples workflow's step that builds the examples, before that workflow sets up
# Node, so it cannot call the Node reader. The two are held together by
# scripts/check-fenced-block-parity.sh, which runs both over one fixture,
# scripts/testdata/fenced-blocks.md, against the blocks it should read,
# scripts/testdata/fenced-blocks.expected, and fails where either differs; change
# the rules in both, and that fixture with them.

{ sub(/\r$/, "") }

fence != "" {
  t = $0; gsub(/^[ \t]+|[ \t]+$/, "", t)
  if (length(t) >= length(fence) && t ~ ("^[" substr(fence, 1, 1) "]+$")) {
    print "block " start " " info
    for (k = 1; k <= n; k++) print "| " body[k]
    fence = ""; next
  }
  body[++n] = $0; next
}

{
  lead = match($0, /[^ \t]/) ? RSTART - 1 : length($0)
  rest = substr($0, lead + 1)
  if (lead <= 3 && match(rest, /^(````*|~~~~*)/)) {
    fence = substr(rest, 1, RLENGTH)
    info = substr(rest, RLENGTH + 1); sub(/^[ \t]+/, "", info)
    match(info, /^[^ \t`]*/); info = substr(info, 1, RLENGTH)
    start = NR; n = 0
  }
}
