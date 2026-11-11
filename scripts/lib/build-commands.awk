# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# build-commands.awk — print the commands a runnable example's page gives to run
# next, read as `aggrega scaffold --example` reads them once it has written the
# example: the lines of the first sh, bash or shell block under a level-two
# heading exactly "Build", each printed as "| <line as written>", without the
# blank lines that open or close the block. A page with no such block, or one
# whose block holds only blank lines, prints nothing.
#
#   -v section=TEXT   read the block under a level-two heading exactly TEXT
#                     instead of "Build"
#   -v mode=headings  print instead every heading of level one or two, in page
#                     order, as its run of # and its text
#
# How the page is read, line by line:
#   - a fence opens on a run of three or more backticks or tildes indented by at
#     most three spaces, and its info word is the first word after the run; a
#     backtick run followed by another backtick on the line opens nothing, and a
#     line indented by a tab opens nothing;
#   - it closes on a line holding, around any whitespace, nothing but at least as
#     many of the same character; a fence never closed runs to the end of the
#     page, hiding every heading after it, and a block it opened still counts;
#   - a heading is up to three spaces, one to six #, then its text, with a closing
#     run of # dropped; one of level one or two ends the section before it;
#   - the block read is the first sh, bash or shell block opened inside a section
#     with that heading, wherever on the page that section is; the page is read no
#     further once that block ends.
#
# A carriage return ending a line is dropped.
#
# 🔴 lib/fenced-blocks.awk is a different reader on purpose, and the two must not
# be merged: it follows the rules of the Node reader in
# check-getting-started-commands.mjs, and reads a page differently from this one
# at a tab-indented fence, a backtick in a backtick fence's info word and a fence
# never closed.
#
# Usage: awk [-v section=TEXT] [-v mode=headings] -f scripts/lib/build-commands.awk PAGE
#
# 🔴 DELIBERATE NEAR-DUPLICATE of NextCommands in aggrega-cli's
# internal/exampleops: the documentation's scripts run where no aggrega binary is
# built and the CLI's Go cannot be called, so the reading is restated here.
# scripts/check-build-commands-parity.sh runs this reader over the cases in
# scripts/testdata/build-commands/ and compares it with
# scripts/testdata/build-commands.expected, and the CLI's own tests pin the same
# cases; change the rules, those cases and those tests together.

function shell(info) { return info == "sh" || info == "bash" || info == "shell" }

# opens <line>: whether the line opens a fence; sets OPENED to its run and INFO
# to its info word.
function opens(line,    s, n, mark, run, rest) {
  s = line; n = 0
  while (substr(s, 1, 1) == " ") { s = substr(s, 2); n++ }
  if (n > 3) return 0
  mark = substr(s, 1, 1)
  if (mark != "`" && mark != "~") return 0
  run = 0
  while (substr(s, run + 1, 1) == mark) run++
  if (run < 3) return 0
  rest = substr(s, run + 1); gsub(/^[ \t]+|[ \t]+$/, "", rest)
  if (mark == "`" && index(rest, "`")) return 0
  OPENED = substr(s, 1, run); INFO = rest; sub(/[ \t].*$/, "", INFO)
  return 1
}

# closes <line> <fence>: whether the line closes the fence.
function closes(line, fence,    t) {
  t = line; gsub(/^[ \t]+|[ \t]+$/, "", t)
  if (length(t) < length(fence)) return 0
  if (substr(fence, 1, 1) == "`") gsub(/`/, "", t); else gsub(/~/, "", t)
  return t == ""
}

# heading <line>: its level, 0 for a line that is not a heading; sets HTEXT.
function heading(line,    s, n, lvl, rest) {
  s = line; n = 0
  while (n < 3 && substr(s, 1, 1) == " ") { s = substr(s, 2); n++ }
  if (substr(s, 1, 1) != "#") return 0
  match(s, /^#+/); lvl = RLENGTH
  if (lvl > 6) return 0
  rest = substr(s, lvl + 1)
  if (rest != "" && rest !~ /^[ \t]/) return 0
  sub(/^[ \t]+/, "", rest); sub(/[ \t]+#+[ \t]*$/, "", rest); sub(/[ \t]+$/, "", rest)
  HTEXT = rest
  return lvl
}

# emit: the block read, without the blank lines that open or close it.
function emit(    first, last, k) {
  first = 1; last = nbuf
  while (first <= last && buf[first] ~ /^[ \t]*$/) first++
  while (last >= first && buf[last] ~ /^[ \t]*$/) last--
  for (k = first; k <= last; k++) print "| " buf[k]
  done = 1
}

BEGIN { if (section == "") section = "Build" }

{ sub(/\r$/, "") }

fence != "" {
  if (closes($0, fence)) {
    if (capturing) { emit(); exit }
    fence = ""
    next
  }
  if (capturing) buf[++nbuf] = $0
  next
}

opens($0) {
  fence = OPENED
  capturing = mode != "headings" && insection && shell(INFO)
  nbuf = 0
  next
}

{ level = heading($0) }

level > 0 && level <= 2 {
  if (mode == "headings") print substr("######", 1, level) " " HTEXT
  insection = level == 2 && HTEXT == section
}

END { if (capturing && !done) emit() }
