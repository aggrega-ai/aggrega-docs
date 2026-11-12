#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# gen-examples-index.sh — check the header and the sections every runnable
# example carries, and write the page listing the examples in teaching order,
# by product and by capability.
#
# Every first-level directory of language-reference/examples/ is an example.
# Its README.md opens with YAML front matter holding one key, `example`, with
# these keys under it:
#
#   level     one of the levels the examples README lists
#   tier      one of the tiers the examples README lists: the part of the
#             teaching order the example belongs to
#   position  the example's place within its tier, a positive integer no other
#             example of that tier takes; lower comes first
#   products  the catalog Components the example deploys, each written as its
#             catalog name (namespace/category/name)
#   shows     capabilities, each one the examples README lists
#
# The closed lists — the levels, the tiers and the capabilities — are read
# from the examples README, below the HTML comments
# `<!-- example-header: level -->`, `<!-- example-header: tier -->` and
# `<!-- example-header: shows -->`: one bullet per entry, written
# "- `name` — description". That README is their one home; this script keeps no
# copy of any of them. The tiers are taught in the order their list gives them.
#
# Every README must also carry a level-two section `## Scaffold the example`
# whose first sh, bash or shell block holds exactly the line
# `aggrega scaffold --example <name>` and whose second holds exactly the line
# `cd <name>`, followed directly — no other heading of level one or two between
# them — by a level-two section `## Build` whose first sh, bash or shell block
# holds a command. `aggrega scaffold --example` prints, once it has written the
# example, `cd <name>` and then that Build block, so the page shows the commands
# in the order it prints them. A scaffold line that also changes directory —
# `aggrega scaffold --example <name> && cd <name>` — is refused, naming the form
# to write. The page is read as that command reads it (see section_defects
# below), so a heading inside a fenced block is not a heading.
#
# Every example must also be buildable by the examples workflow: an executable
# check.sh, or a build-release.sh, in its directory.
#
# The page is by-product-and-capability.md in the examples folder. It lists
# every example first in teaching order — tier by tier, by position within each
# — then under each product it deploys and each capability it shows. It is
# generated whole, from the headers and each README's first sentence, so it is
# never edited by hand.
#
# Usage:
#   gen-examples-index.sh [--examples DIR]            check the headers, then write the page
#   gen-examples-index.sh --check [--examples DIR]    check the headers and that the page is current
#   gen-examples-index.sh --stdout [--examples DIR]   check the headers, print the page
#
#   --examples DIR  the examples folder (default: language-reference/examples
#                   beside this script's repository root)
#
# Exit status: 0 when every header is valid (and, with --check, the page is
# current); 1 with one line per offending example, or a line naming a stale
# page; 2 on a usage error or a missing tool. Needs yq (the Go implementation,
# v4) on PATH.
set -euo pipefail
export LC_ALL=C

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EX="$ROOT/language-reference/examples"
MODE="write"

usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e '/^set -euo/d' -e 's/^# \{0,1\}//'; }
die() { printf 'gen-examples-index: %s\n' "$*" >&2; exit 2; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE=check; shift ;;
    --stdout) MODE=stdout; shift ;;
    --examples) [ "$#" -ge 2 ] || die "--examples needs a directory"; EX="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -d "$EX" ] || die "no examples folder at $EX"
[ -f "$EX/README.md" ] || die "no README.md in $EX, which holds the header's lists"
command -v yq >/dev/null 2>&1 || die "yq is not on PATH"

PAGE_NAME="by-product-and-capability.md"
PAGE="$EX/$PAGE_NAME"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# --- the reader of each page's next commands, held to its cases -------------------
# BUILD_COMMANDS reads a page's Build and Scaffold sections as
# `aggrega scaffold --example` does; check-build-commands-parity.sh holds it to the
# cases the CLI's own tests pin, so a page is never judged by a reading the CLI
# does not share. Its verdict goes to standard error, leaving standard output to
# the page in --stdout mode.
BUILD_COMMANDS="$ROOT/scripts/lib/build-commands.awk"
parity_rc=0
"$ROOT/scripts/check-build-commands-parity.sh" >&2 || parity_rc=$?
[ "$parity_rc" -eq 0 ] || exit "$parity_rc"

# --- the lists, read from the examples README -------------------------------
# vocabulary <list>: one "name<TAB>description" line per bullet below the marker,
# a wrapped bullet's continuation lines joined to it; the list ends at the first
# line that is neither a bullet nor a continuation.
vocabulary() {
  awk -v marker="<!-- example-header: $1 -->" '
    function flush() { if (name != "") { print name "\t" desc; name = "" } }
    $0 == marker { inlist = 1; next }
    !inlist { next }
    /^- `[a-z0-9-]+` — / {
      flush()
      line = $0; sub(/^- `/, "", line)
      name = line; sub(/`.*$/, "", name)
      desc = line; sub(/^[a-z0-9-]+` — /, "", desc)
      next
    }
    /^  [^ ]/ && name != "" { line = $0; sub(/^ +/, "", line); desc = desc " " line; next }
    { flush(); exit }
    END { flush() }
  ' "$EX/README.md"
}
vocabulary level > "$WORK/levels.tsv"
vocabulary tier > "$WORK/tiers.tsv"
vocabulary shows > "$WORK/shows.tsv"
[ -s "$WORK/levels.tsv" ] || die "no level list below <!-- example-header: level --> in $EX/README.md"
[ -s "$WORK/tiers.tsv" ] || die "no tier list below <!-- example-header: tier --> in $EX/README.md"
[ -s "$WORK/shows.tsv" ] || die "no capability list below <!-- example-header: shows --> in $EX/README.md"
# A tier's description opens with the title the page heads that tier with, then a
# colon: "- `start-here` — Start here: …".
while IFS=$'\t' read -r tier_name description; do
  case "$description" in
    ?*:\ ?*) ;;
    *) die "the description of tier \"$tier_name\" in $EX/README.md does not open with its title and a colon" ;;
  esac
done < "$WORK/tiers.tsv"
LEVELS=" $(cut -f1 "$WORK/levels.tsv" | tr '\n' ' ')"
TIERS=" $(cut -f1 "$WORK/tiers.tsv" | tr '\n' ' ')"
SHOWS=" $(cut -f1 "$WORK/shows.tsv" | tr '\n' ' ')"

# --- one example's header -----------------------------------------------------
# front_matter <README> <out>: writes the block between the opening and closing
# `---` lines; fails when the file does not open with one, or it is not closed.
front_matter() {
  # An exit inside a rule still runs END, so END decides the status on its own.
  awk 'NR == 1 { if ($0 != "---") { none = 1; exit } next }
       $0 == "---" || $0 == "..." { closed = 1; exit }
       { print }
       END { if (NR == 0 || none) exit 3; if (!closed) exit 4 }' "$1" > "$2"
}

# The header, read in one pass and printed as these fields joined by "|":
# the document's tag, its keys other than `example`, the tag of `example`, its
# keys other than the five, the level (when a string) and its tag, the tag of
# products, its string entries, how many entries are not strings, the same
# three for shows, the tier (when a string) and its tag, and the tag of
# position and its value (when an integer).
READ_HEADER='[
  tag,
  (with_entries(select(.key != "example")) | keys | join(" ")),
  (.example | tag),
  ((.example | select(tag == "!!map") | with_entries(select(.key != "level" and .key != "tier" and .key != "position" and .key != "products" and .key != "shows")) | keys | join(" ")) // ""),
  ((.example.level | select(tag == "!!str")) // ""),
  ((.example.level | tag) // ""),
  ((.example.products | tag) // ""),
  ((.example.products | select(tag == "!!seq") | map(select(tag == "!!str")) | join(" ")) // ""),
  ((.example.products | select(tag == "!!seq") | map(select(tag != "!!str")) | length) // 0),
  ((.example.shows | tag) // ""),
  ((.example.shows | select(tag == "!!seq") | map(select(tag == "!!str")) | join(" ")) // ""),
  ((.example.shows | select(tag == "!!seq") | map(select(tag != "!!str")) | length) // 0),
  ((.example.tier | select(tag == "!!str")) // ""),
  ((.example.tier | tag) // ""),
  ((.example.position | tag) // ""),
  ((.example.position | select(tag == "!!int")) // "")
] | map(tostring) | join("|")'

COMPONENT_NAME='^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$'

# check_list <label> <entries> <allowed or ""> : appends defects for one list.
check_list() {
  local label=$1 entries=$2 allowed=$3 e seen=" "
  for e in $entries; do
    if [ -n "$allowed" ]; then
      case "$allowed" in *" $e "*) ;; *) defects+=("$label entry \"$e\" is not one of:${allowed% }") ;; esac
    elif ! [[ "$e" =~ $COMPONENT_NAME ]]; then
      defects+=("$label entry \"$e\" is not a catalog Component name (namespace/category/name)")
    fi
    case "$seen" in *" $e "*) defects+=("$label lists \"$e\" twice") ;; esac
    seen="$seen$e "
  done
}

# section_defects <name> <README>: one line per defect in the README's Scaffold
# and Build sections, none when both are as the header of this script says. The
# page is read by $BUILD_COMMANDS, as `aggrega scaffold --example` reads it.
section_defects() {
  local name=$1 readme=$2 want want_cd got i scaffold=-1 build=-1
  local -a headings=()
  want="aggrega scaffold --example $name"
  want_cd="cd $name"
  mapfile -t headings < <(awk -v mode=headings -f "$BUILD_COMMANDS" "$readme")
  for i in "${!headings[@]}"; do
    if [ "$scaffold" -lt 0 ] && [ "${headings[$i]}" = "## Scaffold the example" ]; then scaffold=$i; fi
    if [ "$build" -lt 0 ] && [ "${headings[$i]}" = "## Build" ]; then build=$i; fi
  done
  [ "$scaffold" -ge 0 ] || echo 'README.md has no "## Scaffold the example" section'
  [ "$build" -ge 0 ] || echo 'README.md has no "## Build" section'
  if [ "$scaffold" -ge 0 ]; then
    if [ "${headings[$((scaffold + 1))]:-}" != "## Build" ]; then
      echo 'README.md section "## Scaffold the example" is not followed directly by "## Build"'
    fi
    # The section's first and second shell blocks, each as the reader prints it:
    # "| <line>" per line, so a block of exactly one line is exactly "| <line>".
    got=$(awk -v section="Scaffold the example" -v block=1 -f "$BUILD_COMMANDS" "$readme")
    if [[ "$got" == "| $want "* ]]; then
      echo "README.md section \"## Scaffold the example\" writes more than \"$want\" on its line, such as \"&& $want_cd\"; write \"$want\" alone in the first sh, bash or shell block and \"$want_cd\" alone in the next, because the command prints that cd itself"
    elif [ "$got" != "| $want" ]; then
      echo "README.md section \"## Scaffold the example\" has no first sh, bash or shell block holding exactly \"$want\""
    fi
    got=$(awk -v section="Scaffold the example" -v block=2 -f "$BUILD_COMMANDS" "$readme")
    if [ "$got" != "| $want_cd" ]; then
      echo "README.md section \"## Scaffold the example\" has no second sh, bash or shell block holding exactly \"$want_cd\", the first command \`aggrega scaffold --example\` prints"
    fi
  fi
  if [ "$build" -ge 0 ] && [ -z "$(awk -f "$BUILD_COMMANDS" "$readme")" ]; then
    echo 'README.md section "## Build" has no sh, bash or shell block holding a command, so scaffolding the example prints no command to run next'
  fi
}

# --- the headers, read in one yq run --------------------------------------------
# Each header is cut out of its README first; yq then reads them all in one
# process, one output line per file in argument order, because starting yq once
# per example is most of what this script would otherwise spend. Only when that
# run fails — some header is not valid YAML — is each header read on its own, to
# name the ones that are not.
declare -A FM_STATUS=() FIELDS=() YAML_ERROR=()
mkdir -p "$WORK/fm"
headers=() header_names=()
for d in "$EX"/*/; do
  d=${d%/}; name=$(basename "$d")
  [ -f "$d/README.md" ] || continue
  status=0
  front_matter "$d/README.md" "$WORK/fm/$name.yaml" || status=$?
  FM_STATUS[$name]=$status
  if [ "$status" -eq 0 ]; then headers+=("$WORK/fm/$name.yaml"); header_names+=("$name"); fi
done
if [ "${#headers[@]}" -gt 0 ]; then
  if yq -N "$READ_HEADER" "${headers[@]}" > "$WORK/fields.txt" 2>/dev/null \
     && [ "$(wc -l < "$WORK/fields.txt")" -eq "${#headers[@]}" ]; then
    i=0
    while IFS= read -r line; do FIELDS[${header_names[$i]}]=$line; i=$((i + 1)); done < "$WORK/fields.txt"
  else
    for i in "${!headers[@]}"; do
      if line=$(yq -N "$READ_HEADER" "${headers[$i]}" 2>"$WORK/yq.err"); then
        FIELDS[${header_names[$i]}]=$line
      else
        YAML_ERROR[${header_names[$i]}]=$(head -1 "$WORK/yq.err")
      fi
    done
  fi
fi

# --- the examples ---------------------------------------------------------------
: > "$WORK/examples.tsv"
failures=0
# POSITION_TAKEN["<tier> <position>"]: the example that took that place first.
declare -A POSITION_TAKEN=()
for d in "$EX"/*/; do
  d=${d%/}; name=$(basename "$d")
  defects=()
  if ! { [ -x "$d/check.sh" ] || [ -f "$d/build-release.sh" ]; }; then
    defects+=("has neither an executable check.sh nor a build-release.sh, so nothing builds it")
  fi
  readme="$d/README.md"
  if [ ! -f "$readme" ]; then
    defects+=("has no README.md")
  else
    fm_status=${FM_STATUS[$name]}
    if [ "$fm_status" -eq 3 ]; then
      defects+=("README.md has no header: it does not open with a --- line")
    elif [ "$fm_status" -eq 4 ]; then
      defects+=("README.md header is not closed by a --- line")
    elif [ -n "${YAML_ERROR[$name]:-}" ]; then
      defects+=("README.md header is not valid YAML: ${YAML_ERROR[$name]}")
    else
      fields=${FIELDS[$name]}
      IFS='|' read -r doc_tag other_keys ex_tag ex_keys level level_tag \
        p_tag products p_bad s_tag shows s_bad tier tier_tag pos_tag position <<< "$fields"
      if [ "$doc_tag" != "!!map" ] || [ "$ex_tag" != "!!map" ]; then
        defects+=("README.md header has no \`example\` mapping")
      else
        for k in $other_keys; do defects+=("unknown header key \"$k\""); done
        for k in $ex_keys; do defects+=("unknown key \"example.$k\""); done
        if [ "$level_tag" != "!!str" ]; then
          defects+=("level is missing or not a single value")
        else
          case "$LEVELS" in *" $level "*) ;; *) defects+=("level \"$level\" is not one of:${LEVELS% }") ;; esac
        fi
        tier_ok=0
        if [ "$tier_tag" != "!!str" ]; then
          defects+=("tier is missing or not a single value")
        else
          case "$TIERS" in *" $tier "*) tier_ok=1 ;; *) defects+=("tier \"$tier\" is not one of:${TIERS% }") ;; esac
        fi
        if [ "$pos_tag" != "!!int" ] || ! [[ "$position" =~ ^[1-9][0-9]*$ ]]; then
          defects+=("position is missing or not a positive integer")
        elif [ "$tier_ok" -eq 1 ]; then
          taken=${POSITION_TAKEN["$tier $position"]:-}
          if [ -n "$taken" ]; then
            defects+=("position $position in tier \"$tier\" is already taken by $taken")
          else
            POSITION_TAKEN["$tier $position"]=$name
          fi
        fi
        if [ "$p_tag" != "!!seq" ] || [ "$p_bad" != 0 ]; then
          defects+=("products is missing or not a list of names")
        else
          check_list products "$products" ""
        fi
        if [ "$s_tag" != "!!seq" ] || [ "$s_bad" != 0 ]; then
          defects+=("shows is missing or not a list of names")
        else
          check_list shows "$shows" "$SHOWS"
        fi
        if [ "$p_tag" = "!!seq" ] && [ "$s_tag" = "!!seq" ] && [ -z "$products$shows" ]; then
          defects+=("lists no product and no capability, so the index has nowhere to list it")
        fi
      fi
    fi
    while IFS= read -r defect; do defects+=("$defect"); done < <(section_defects "$name" "$readme")
  fi
  if [ "${#defects[@]}" -gt 0 ]; then
    failures=$((failures + 1))
    joined=$(printf '%s; ' "${defects[@]}")
    printf 'examples: %s: %s\n' "$name" "${joined%; }"
    continue
  fi
  # Fields are separated by \x1f, not a tab: a tab is whitespace to `read`, which
  # would merge an empty products field into the next one and lose the example.
  printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' "$name" "$level" "$products" "$shows" "$tier" "$position" >> "$WORK/examples.tsv"
done

if [ "$failures" -gt 0 ]; then
  printf 'examples: %d example(s) refused; the header shape, its lists and the sections it needs are described on %s\n' \
    "$failures" "language-reference/examples/README.md" >&2
  exit 1
fi

# --- the page ---------------------------------------------------------------------
# first_sentence <README>: the first sentence of the first prose paragraph under
# the title, with each link reduced to its text. A paragraph with no sentence end
# is taken whole, a trailing colon becoming a full stop.
first_sentence() {
  awk '
    NR == 1 && $0 == "---" { infm = 1; next }
    infm { if ($0 == "---" || $0 == "...") infm = 0; next }
    !titled { if ($0 ~ /^# /) titled = 1; next }
    fence { if ($0 ~ /^ *(```|~~~)/) fence = 0; next }
    /^ *(```|~~~)/ { if (para != "") exit; fence = 1; next }
    /^[ \t]*$/ { if (para != "") exit; skip = 0; next }
    para == "" && /^(#|<|\||>|!\[|[-*+] |[0-9]+[.)] )/ { skip = 1; next }
    skip { next }
    { line = $0; sub(/^ +/, "", line); para = (para == "" ? line : para " " line) }
    END { print para }
  ' "$1" \
  | sed -E 's/!\[[^]]*\]\([^)]*\)//g; s/\[([^]]*)\]\([^)]*\)/\1/g' \
  | awk '
    {
      s = $0; n = length(s); code = 0; cut = 0
      for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        if (c == "`") { code = !code; continue }
        if (code || (c != "." && c != "!" && c != "?")) continue
        if (i < n && substr(s, i + 1, 1) != " ") continue
        w = substr(s, 1, i); sub(/.* /, "", w)
        if (w == "e.g." || w == "i.e." || w == "etc." || w == "vs.") continue
        cut = i; break
      }
      if (cut) s = substr(s, 1, cut)
      else if (s ~ /:$/) s = substr(s, 1, n - 1) "."
      print s
    }'
}

declare -A SENTENCE=()
while IFS=$'\x1f' read -r name _; do
  SENTENCE[$name]=$(first_sentence "$EX/$name/README.md")
done < "$WORK/examples.tsv"

# entry <name> <level>: one list line. The link names the example's README.md
# rather than its directory: the site rewrites a link to a Markdown file into
# the address that page is served at, while a bare directory link would resolve
# against this page's own address. The backticks in this file's printf formats
# are Markdown code spans, not command substitutions.
# shellcheck disable=SC2016
entry() { printf -- '- [%s](%s/README.md) (`%s`) — %s\n' "$1" "$1" "$2" "${SENTENCE[$1]}"; }

level_list() {
  local names=() n
  while IFS=$'\t' read -r n _; do names+=("\`$n\`"); done < "$WORK/levels.tsv"
  local count=${#names[@]} out="" i
  for i in "${!names[@]}"; do
    if [ "$i" -eq 0 ]; then out="${names[$i]}"
    elif [ "$i" -eq $((count - 1)) ]; then out="$out or ${names[$i]}"
    else out="$out, ${names[$i]}"
    fi
  done
  printf '%s' "$out"
}

# US is the field separator of examples.tsv, for the tools that take it as an
# argument rather than as an escape.
US=$'\x1f'

# render: the whole page. Its printf formats hold Markdown code spans too.
# shellcheck disable=SC2016
render() {
  printf '%s\n' "<!-- Generated by scripts/gen-examples-index.sh in this repository, from the header of each example's README. Change a header and run the script again; edits made here are overwritten. -->"
  printf '\n# Examples by product and capability\n\n'
  printf 'Every example in this folder, listed first in the order to work through them,\n'
  printf 'tier by tier, then under each product it deploys and under each capability it\n'
  printf 'shows. Each entry gives the example'"'"'s level and the first sentence of its page.\n\n'
  printf 'The level is %s: the levels [The header on each example](README.md#the-header-on-each-example) lists.\n' "$(level_list)"
  printf 'The header each example carries, and the lists its values come from, are\n'
  printf 'described in [The header on each example](README.md#the-header-on-each-example).\n'

  # 🔴 The teaching-order section stays FIRST on the page: `aggrega scaffold
  # --example --list` lists the examples in the order the page first names each
  # one, so whatever section comes first sets the order the list prints.
  printf '\n## In teaching order\n'
  while IFS=$'\t' read -r tier_name description; do
    printf '\n### %s\n\nTier `%s`: %s\n\n' "${description%%: *}" "$tier_name" "${description#*: }"
    listed=0
    while IFS=$'\x1f' read -r name level _ _ _ _; do
      entry "$name" "$level"; listed=1
    done < <(awk -F "$US" -v t="$tier_name" '$5 == t' "$WORK/examples.tsv" | sort -t "$US" -k6,6n)
    [ "$listed" -eq 1 ] || printf 'No example is in this tier yet.\n'
  done < "$WORK/tiers.tsv"

  printf '\n## By product\n'
  for product in $(cut -d $'\x1f' -f3 "$WORK/examples.tsv" | tr ' ' '\n' | sed '/^$/d' | sort -u); do
    printf '\n### `%s`\n\n' "$product"
    while IFS=$'\x1f' read -r name level products _ _ _; do
      case " $products " in *" $product "*) entry "$name" "$level" ;; esac
    done < "$WORK/examples.tsv"
  done

  printf '\n## By capability\n'
  while IFS=$'\t' read -r capability description; do
    printf '\n### `%s`\n\n%s\n\n' "$capability" "$description"
    listed=0
    while IFS=$'\x1f' read -r name level _ shows _ _; do
      case " $shows " in *" $capability "*) entry "$name" "$level"; listed=1 ;; esac
    done < "$WORK/examples.tsv"
    [ "$listed" -eq 1 ] || printf 'No example shows this yet.\n'
  done < "$WORK/shows.tsv"
}

render > "$WORK/page.md"

case "$MODE" in
  stdout) cat "$WORK/page.md" ;;
  write) cp "$WORK/page.md" "$PAGE"; printf 'gen-examples-index: wrote %s (%d examples)\n' "$PAGE" "$(wc -l < "$WORK/examples.tsv")" ;;
  check)
    if [ ! -f "$PAGE" ] || ! cmp -s "$WORK/page.md" "$PAGE"; then
      printf 'examples: %s is not current with the headers; run scripts/gen-examples-index.sh in aggrega-docs and commit the page\n' "$PAGE_NAME"
      exit 1
    fi
    printf 'examples: %d example(s), every header valid, every example buildable, %s current\n' \
      "$(wc -l < "$WORK/examples.tsv")" "$PAGE_NAME" ;;
esac
