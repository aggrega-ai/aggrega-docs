# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio s.r.l.
#
# marked-blocks.awk — pair each marker of a Markdown page with the fenced block
# it marks, and print every marker with its block.
#
# A marker is a line reading exactly `<!-- quotes: <target> -->`, the target one
# word; the block it marks is the one whose opening fence is the page's next
# line. The blocks are read by scripts/lib/fenced-blocks.awk, whose output for the
# same page is handed in as `blocks`, so the rules a fence is read by live in that
# one file. For each marker, in the page's order, this prints
#
#   marker <n> fenced <target>      then "| <line as written>" for each line of
#                                   the block, where a block opens on the next
#                                   line; or
#   marker <n> unfenced <target>    where none does.
#
# <n> counts the markers from 1.
#
# Usage: awk -f scripts/lib/fenced-blocks.awk PAGE > BLOCKS
#        awk -v blocks=BLOCKS -f scripts/lib/marked-blocks.awk PAGE
#
# check-import-example.sh compares what a walkthrough page quotes with it, and
# capture-editor-screenshots.sh reads an import page's command and quoted files
# with it.

BEGIN {
  while ((getline l < blocks) > 0) {
    if (l ~ /^block /) { split(l, f, " "); cur = f[2]; opens[cur] = 1; lines[cur] = 0; continue }
    body[cur, ++lines[cur]] = substr(l, 3)
  }
}

{ line[NR] = $0 }

END {
  for (i = 1; i <= NR; i++) {
    if (!match(line[i], /^<!-- quotes: [^ ]+ -->$/)) continue
    n++
    target = substr(line[i], 14, length(line[i]) - 17)
    if (!((i + 1) in opens)) { print "marker " n " unfenced " target; continue }
    print "marker " n " fenced " target
    for (k = 1; k <= lines[i + 1]; k++) print "| " body[i + 1, k]
  }
}
