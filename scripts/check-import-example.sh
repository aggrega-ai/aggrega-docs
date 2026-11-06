#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# check-import-example.sh — run an import example's `aggrega import` again,
# compare what it writes and prints with what the example holds, compare the
# blocks its walkthrough page quotes with the same files, and build the reviewed
# result.
#
# An import example holds three directories:
#
#   source/    the project being imported, and the .aggrega-config.yaml that
#              marks it a workspace
#   draft/     the files the import wrote, unchanged; stdout.txt, what it printed
#              on standard output; and import.txt, what it printed on standard
#              error
#   reviewed/  the draft after review: a workspace that builds
#
# The check, in order:
#
#   1. copies source/ into a temporary directory and runs `aggrega import` there
#      with the arguments given after `--`;
#   2. compares every file the import wrote with draft/, byte for byte: a file
#      written and not in draft/, a file in draft/ not written, and a file whose
#      bytes differ each fail the check;
#   3. compares what the import printed on standard output with draft/stdout.txt,
#      and on standard error with draft/import.txt — the temporary directory's
#      path written as <workspace>, and, on the catalog-folder route below, the
#      warning that an importer read from a catalog folder runs unverified left
#      out, since an importer the binary fetches prints none;
#   4. compares the walkthrough page --page names with the example: each fenced
#      block — read by the rules check-getting-started-commands.mjs reads blocks
#      by, see "The block reader" below — that the page marks, on the line
#      directly above its opening fence, with
#        <!-- quotes: <path> -->         a file of the example, by its path
#                                        inside the example (draft/stdout.txt and
#                                        draft/import.txt included), or
#        <!-- quotes: import-command --> the command the import ran,
#      must match it. A file block matches when its lines appear in the file as
#      written and in order, where a line of the form "[… omitted: …]" (indented
#      or not) marks a gap; lines with no such line between them are consecutive
#      in the file. The command block must hold exactly
#      `aggrega import <the arguments>`. A page with no command marker, or a
#      marker naming a file the example does not hold, fails. Unmarked blocks —
#      a validation's or a build's output, a rendered file — are not compared.
#      The translation tool copies HTML comments and fenced code unchanged, so a
#      translated page keeps its markers;
#   5. builds release.yaml and every release-*.yaml in reviewed/, in a copy,
#      through the shared build-release.sh helper with --auto-pull and
#      --no-color; each build must complete.
#
# The binary is the one build-release.sh resolves (`build-release.sh
# --print-binary`): AGGREGA_BIN where it is set, else its prebuilt and
# build-from-source order. Where that order builds from source, the helper writes
# the binary into a directory this script created inside its own temporary
# directory (--build-into), which it removes with the rest of that directory;
# nothing else is removed. The builds in step 5 are given that same binary as
# AGGREGA_BIN, so their provenance reads it as an override.
#
# The block reader. Step 4 reads a page's fenced blocks with
# scripts/lib/fenced-blocks.awk, whose header states the rules it reads them by.
# 🔴 That reader is a DELIBERATE NEAR-DUPLICATE of fencedBlocks() in
# check-getting-started-commands.mjs: this script runs in the examples workflow's
# step that builds the examples, before that workflow sets up Node, so it cannot
# call the Node reader. The two are held together by
# scripts/check-fenced-block-parity.sh, which runs both over one fixture and
# fails where either reads it differently. Step 4 runs that parity check first
# wherever node is on PATH, and says so where it is not. The matcher beside it,
# contains(), is no copy of that script's holds(): a quoted file block is matched
# to a file as runs with gaps, a command block to a page's blocks as one
# consecutive run.
#
# The catalogs. An import weighs the source against the Components of the
# workspace's own catalog, and drafts a Manifest from its Recipes, so the import
# reads the standard-library catalog: the first directory AGGREGA_CATALOG_DIRS
# names, where it is set — the examples workflow sets it to the catalog it checks
# out — and otherwise the catalog checked out beside this repository, at
# ../aggrega-hub/aggrega-catalog. The builds read the same directory.
#
# The importer. A binary fetches its core importer from its default registry the
# first time an import needs it, at the binary's own version. A binary built from
# a commit between releases has a version no registry holds, so its importer is
# read instead from a catalog folder holding the importer's Plugin entity at that
# version with its module beside it — the catalog-folder route:
#
#   - AGGREGA_IMPORTER_CATALOG, where it is set;
#   - otherwise the folder a build of aggrega-cli checked out beside this
#     repository lays at aggrega-cli/.dev-catalog, where it holds the importer at
#     the binary's version;
#   - otherwise none, and the binary fetches its importer.
#
# On the catalog-folder route the import reads that folder ahead of the standard
# catalog, which is read as it is, its own importer entities included.
#
# Usage:
#   check-import-example.sh --example DIR --page PAGE [--update] -- IMPORT ARGS...
#
#   --page    the walkthrough page quoting the example (step 4)
#   --update   write draft/, draft/stdout.txt and draft/import.txt from this
#              run instead of comparing them, then compare the page and build
#              as usual. A file that changed is replaced from a real run, never
#              edited by hand; the page's blocks are then edited to match.
#
# Exit status: 0 when the import wrote and printed what draft/ holds, the page
# quotes what the example holds, and every build completed; 1 on any difference
# or failed build, with what differed; 2 on a usage error or a missing binary,
# catalog, page or directory.
set -uo pipefail
export LC_ALL=C
export NO_COLOR=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
HELPER="$SCRIPT_DIR/build-release.sh"
BLOCK_READER="$SCRIPT_DIR/lib/fenced-blocks.awk"

die() { printf 'check-import: %s\n' "$*" >&2; exit 2; }

EXAMPLE=""
PAGE=""
UPDATE=0
declare -a IMPORT_ARGS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --example) [ "$#" -ge 2 ] || die "--example needs a directory"; EXAMPLE="$2"; shift 2 ;;
    --page) [ "$#" -ge 2 ] || die "--page needs a file"; PAGE="$2"; shift 2 ;;
    --update) UPDATE=1; shift ;;
    --) shift; IMPORT_ARGS=("$@"); break ;;
    -h|--help) sed -n '2,/^set -uo/p' "${BASH_SOURCE[0]}" | sed -e '/^set -uo/d' -e 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[ -n "$EXAMPLE" ] || die "--example is required"
EXAMPLE="$(cd "$EXAMPLE" 2>/dev/null && pwd)" || die "no example directory at the path given"
[ -n "$PAGE" ] || die "--page is required"
[ -f "$PAGE" ] || die "no walkthrough page at $PAGE"
[ "${#IMPORT_ARGS[@]}" -gt 0 ] || die "give the import's arguments after --"
[ -d "$EXAMPLE/source" ] || die "$EXAMPLE has no source/ directory"
[ -d "$EXAMPLE/reviewed" ] || die "$EXAMPLE has no reviewed/ directory"
[ -d "$EXAMPLE/draft" ] || [ "$UPDATE" -eq 1 ] || die "$EXAMPLE has no draft/ directory (--update writes one)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# --- the binary: the one build-release.sh resolves ------------------------------
# A binary built from source is written into $WORK/bin, which this script created
# and removes with $WORK.
mkdir -p "$WORK/bin"
AGG="$("$HELPER" --print-binary --build-into "$WORK/bin")" || die "build-release.sh resolved no binary"
VERSION="$("$AGG" version 2>/dev/null | awk 'NR == 1 { print $2 }')"
[ -n "$VERSION" ] || die "$AGG does not report a version"

# --- the catalogs ---------------------------------------------------------------
if [ -n "${AGGREGA_CATALOG_DIRS:-}" ]; then
  STANDARD="${AGGREGA_CATALOG_DIRS%%:*}"
else
  STANDARD="$REPO/../aggrega-hub/aggrega-catalog"
fi
[ -d "$STANDARD/component" ] || die "no standard-library catalog at $STANDARD: set AGGREGA_CATALOG_DIRS to its absolute path"
STANDARD="$(cd "$STANDARD" && pwd)"

IMPORTERS=""
if [ -n "${AGGREGA_IMPORTER_CATALOG:-}" ]; then
  IMPORTERS="$(cd "$AGGREGA_IMPORTER_CATALOG" 2>/dev/null && pwd)" || die "AGGREGA_IMPORTER_CATALOG names no directory"
elif [ -d "$REPO/../aggrega-cli/.dev-catalog/plugin/importer" ] \
  && [ -n "$(find "$REPO/../aggrega-cli/.dev-catalog/plugin/importer" -mindepth 2 -maxdepth 2 -name "$VERSION" -print -quit)" ]; then
  IMPORTERS="$(cd "$REPO/../aggrega-cli/.dev-catalog" && pwd)"
fi

printf 'check-import: binary   = %s (%s)\n' "$AGG" "$VERSION" >&2
printf 'check-import: catalog  = %s\n' "$STANDARD" >&2
printf 'check-import: importer = %s\n' "${IMPORTERS:-fetched by the binary from its default registry}" >&2

IMPORT_DIRS="$STANDARD"
[ -z "$IMPORTERS" ] || IMPORT_DIRS="$IMPORTERS:$STANDARD"

# --- steps 1 to 3: the import -------------------------------------------------------
WS="$WORK/workspace"
mkdir -p "$WS"
cp -R "$EXAMPLE/source/." "$WS/"
( cd "$WS" && find . -type f | sort ) > "$WORK/source-files"
status=0
( cd "$WS" && AGGREGA_CATALOG_DIRS="$IMPORT_DIRS" "$AGG" import "${IMPORT_ARGS[@]}" ) \
  > "$WORK/stdout.txt" 2> "$WORK/stderr" || status=$?
if [ "$status" -ne 0 ]; then
  printf 'check-import: aggrega import exited %d:\n' "$status"
  cat "$WORK/stderr"
  exit 1
fi
awk -v ws="$WS" -v route="$IMPORTERS" '
  route != "" && /^warning: plugin "importer\/[a-z0-9-]+" resolved from local with no recorded digest/ { next }
  { n = index($0, ws); while (n > 0) { $0 = substr($0, 1, n - 1) "<workspace>" substr($0, n + length(ws)); n = index($0, ws) } print }
' "$WORK/stderr" > "$WORK/import.txt"

( cd "$WS" && find . -type f | sort ) | comm -13 "$WORK/source-files" - > "$WORK/written"

if [ "$UPDATE" -eq 1 ]; then
  rm -rf "$EXAMPLE/draft"
  mkdir -p "$EXAMPLE/draft"
  while IFS= read -r f; do
    mkdir -p "$EXAMPLE/draft/$(dirname "$f")"
    cp "$WS/$f" "$EXAMPLE/draft/$f"
  done < "$WORK/written"
  cp "$WORK/stdout.txt" "$WORK/import.txt" "$EXAMPLE/draft/"
  printf 'check-import: wrote %s from this run (%d files)\n' "$EXAMPLE/draft" "$(wc -l < "$WORK/written")"
fi

rc=0
( cd "$EXAMPLE/draft" && find . -type f ! -path ./import.txt ! -path ./stdout.txt | sort ) > "$WORK/expected"
if ! cmp -s "$WORK/expected" "$WORK/written"; then
  printf 'check-import: the import wrote a different set of files than draft/ holds:\n'
  diff "$WORK/expected" "$WORK/written" | sed -n 's/^</  only in draft\/:/p; s/^>/  only written:/p'
  rc=1
fi
while IFS= read -r f; do
  if [ -f "$EXAMPLE/draft/$f" ] && ! cmp -s "$EXAMPLE/draft/$f" "$WS/$f"; then
    printf 'check-import: %s differs from draft/%s:\n' "${f#./}" "${f#./}"
    diff -u "$EXAMPLE/draft/$f" "$WS/$f" | head -40
    rc=1
  fi
done < "$WORK/written"
for printed in stdout.txt import.txt; do
  if ! cmp -s "$EXAMPLE/draft/$printed" "$WORK/$printed"; then
    printf 'check-import: what the import printed differs from draft/%s:\n' "$printed"
    diff -u "$EXAMPLE/draft/$printed" "$WORK/$printed" | head -40
    rc=1
  fi
done
if [ "$rc" -eq 0 ]; then
  printf 'check-import: the import wrote and printed what draft/ holds (%d files)\n' "$(wc -l < "$WORK/written")"
fi

# --- step 4: the page quotes what the example holds ------------------------------
# The parity of this script's block reader with the Node one, where node runs.
if command -v node >/dev/null 2>&1; then
  if ! "$SCRIPT_DIR/check-fenced-block-parity.sh"; then
    printf 'check-import: the two block readers disagree; see check-fenced-block-parity.sh\n'
    rc=1
  fi
else
  printf 'check-import: fenced-block parity not run: no node on PATH\n'
fi
# Each marked block is written to its own file, beside a file naming its target.
# A marker is the page's line directly above a block's opening fence; a marker
# with no block opening on the next line is reported.
mkdir -p "$WORK/quotes"
awk -f "$BLOCK_READER" "$PAGE" > "$WORK/blocks" || die "the block reader failed on $PAGE"
awk -v out="$WORK/quotes" -v blocks="$WORK/blocks" '
  BEGIN {
    while ((getline l < blocks) > 0) {
      if (l ~ /^block /) { split(l, f, " "); cur = f[2]; opens[cur] = 1; continue }
      body[cur] = body[cur] substr(l, 3) "\n"
    }
  }
  { line[NR] = $0 }
  END {
    for (i = 1; i <= NR; i++) {
      if (!match(line[i], /^<!-- quotes: [^ ]+ -->$/)) continue
      n++
      printf "%s\n", substr(line[i], 14, length(line[i]) - 17) > (out "/" n ".target")
      close(out "/" n ".target")
      if ((i + 1) in opens) printf "%s", body[i + 1] > (out "/" n ".block")
      else printf "UNFENCED\n" > (out "/" n ".block")
      close(out "/" n ".block")
    }
  }
' "$PAGE"

# contains <block> <file>: the block lines, in runs separated by omission lines,
# each run consecutive in the file, the runs in order. Prints the first block
# line that could not be placed, and fails.
contains() {
  awk '
    FNR == NR { f[++nf] = $0; next }
    /^[ ]*\[… omitted: .*\]$/ { runs++; next }
    { if (runs == 0) runs = 1; r[runs, ++len[runs]] = $0 }
    END {
      pos = 1
      for (k = 1; k <= runs; k++) {
        if (len[k] == 0) continue
        found = 0
        for (s = pos; s + len[k] - 1 <= nf; s++) {
          ok = 1
          for (j = 1; j <= len[k]; j++) if (f[s + j - 1] != r[k, j]) { ok = 0; break }
          if (ok) { found = 1; pos = s + len[k]; break }
        }
        if (!found) { print "    no place for the lines from: " r[k, 1]; exit 1 }
      }
    }
  ' "$2" "$1"
}

expected_cmd="aggrega import ${IMPORT_ARGS[*]}"
quoted=0
command_seen=0
for target_file in "$WORK"/quotes/*.target; do
  [ -f "$target_file" ] || continue
  i="${target_file%.target}"
  target="$(cat "$target_file")"
  quoted=$((quoted + 1))
  if [ "$(cat "$i.block")" = UNFENCED ]; then
    printf 'check-import: %s marks a quote of %s with no fenced block on the next line\n' "${PAGE##*/}" "$target"
    rc=1; continue
  fi
  if [ "$target" = import-command ]; then
    command_seen=1
    if [ "$(cat "$i.block")" != "$expected_cmd" ]; then
      printf 'check-import: %s quotes the command as:\n%s\n  but the example runs: %s\n' "${PAGE##*/}" "$(cat "$i.block")" "$expected_cmd"
      rc=1
    fi
    continue
  fi
  if [ ! -f "$EXAMPLE/$target" ]; then
    printf 'check-import: %s quotes %s, which the example does not hold\n' "${PAGE##*/}" "$target"
    rc=1; continue
  fi
  if ! msg="$(contains "$i.block" "$EXAMPLE/$target")"; then
    printf 'check-import: %s quotes %s with lines it does not hold, in that order:\n%s\n' "${PAGE##*/}" "$target" "$msg"
    rc=1
  fi
done
if [ "$command_seen" -eq 0 ]; then
  printf 'check-import: %s marks no block quoting the import command\n' "${PAGE##*/}"
  rc=1
elif [ "$rc" -eq 0 ]; then
  printf 'check-import: %s quotes what the example holds (%d marked blocks)\n' "${PAGE##*/}" "$quoted"
fi

# --- step 5: the reviewed result builds -----------------------------------------------
built=0
for rf in "$EXAMPLE"/reviewed/release.yaml "$EXAMPLE"/reviewed/release-*.yaml; do
  [ -f "$rf" ] || continue
  built=$((built + 1))
  name="$(basename "$rf")"
  rm -rf "$WORK/reviewed"
  cp -R "$EXAMPLE/reviewed" "$WORK/reviewed"
  if out="$(AGGREGA_BIN="$AGG" AGGREGA_CATALOG_DIRS="$STANDARD" "$HELPER" --example "$WORK/reviewed" "$name" -- --auto-pull --no-color 2>&1)"; then
    printf 'check-import: reviewed/%s built\n' "$name"
  else
    printf 'check-import: reviewed/%s did not build:\n%s\n' "$name" "$out"
    rc=1
  fi
done
[ "$built" -gt 0 ] || { printf 'check-import: reviewed/ holds no release.yaml or release-*.yaml to build\n'; rc=1; }
exit "$rc"
