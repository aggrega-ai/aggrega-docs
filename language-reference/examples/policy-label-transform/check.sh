#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds this example's Releases and checks each outcome against the one the
# README describes. Four builds:
#
#   - release-production.yaml in a copy of this workspace with no governance
#     attachment: the reference.
#   - release-staging.yaml and release-production.yaml here, with the four
#     attachments in .aggrega-config.yaml. Each must complete, and each node must
#     end with the labels written below for that Release, read from the build
#     graph the build prints with --ir-graph. The production build must also
#     write the same files, byte for byte, as the reference: the transforms
#     change labels in the graph, and these Recipes render none of those labels.
#   - release-production.yaml in a copy whose label-transform policy covers the
#     datastore category only, leaving web without a support tier. It must halt
#     with a policy refusal, [POLICY_ERROR E0005], whose message is the sentence
#     written below, and with no other refusal beside it.
#
# The two copies are made in a temporary directory. Each holds this workspace's
# Aggregate, Manifest, production Release and policies, and an
# .aggrega-config.yaml derived from this one. The configuration lists no catalog
# directory, so the catalog entities come from the hub registry, unless the
# builds are given one — a --catalog passed after --, or AGGREGA_CATALOG_DIRS in
# the environment. No file in this directory is edited; the two builds made here
# fill its lockfiles, as any build does.
#
# Every build runs through the build-release.sh helper, so the aggrega binary is
# the one that helper resolves — AGGREGA_BIN, when it is set. Each build passes
# --auto-pull, because lockfiles are not shipped, --no-color, so the output is
# read as plain text, and --ir-graph.
#
# Usage: ./check.sh [-- EXTRA aggrega build args]
#   Everything after -- is passed to every build, after the arguments above.
#
# Prints one line per build and the labels each node ends with, and exits 1 if
# any outcome differs from its expectation, printing the output of each build
# that differed. Exits 2 before building anything if a dist/ directory is
# already here.
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
      printf '  Builds the staging and production Releases and checks the labels each node\n'
      printf '  ends with; checks the production build against a build with no governance\n'
      printf '  attachment, byte for byte; and checks that a policy covering one category\n'
      printf '  fewer halts the production build with E0005 and the expected sentence.\n'
      printf '  Exits 1 on any mismatch. The binary is the one build-release.sh resolves\n'
      printf '  (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

# The labels the attachments write, read in this order on every node; a node
# that does not carry one of them is shown without it.
KEYS="ops.example.com/environment ops.example.com/support-tier ops.example.com/owner backup.example.com/schedule tag"
NODES="db cache web"

# What each node ends with, per Release: one "node key value" line per label.
expected_labels() {
  case "$1" in
    staging)
      printf '%s\n' \
        'db ops.example.com/environment staging' \
        'db ops.example.com/support-tier office-hours' \
        'db ops.example.com/owner shop-team' \
        'db backup.example.com/schedule nightly' \
        'db tag orders' \
        'cache ops.example.com/environment staging' \
        'cache ops.example.com/support-tier office-hours' \
        'cache ops.example.com/owner shop-team' \
        'cache backup.example.com/schedule nightly' \
        'cache tag sessions' \
        'web ops.example.com/environment staging' \
        'web ops.example.com/support-tier office-hours' \
        'web ops.example.com/owner shop-team' \
        'web tag untagged' ;;
    production)
      printf '%s\n' \
        'db ops.example.com/environment production' \
        'db ops.example.com/support-tier on-call' \
        'db ops.example.com/owner shop-team' \
        'db backup.example.com/schedule nightly' \
        'db tag orders' \
        'cache ops.example.com/environment production' \
        'cache ops.example.com/support-tier on-call' \
        'cache ops.example.com/owner shop-team' \
        'cache backup.example.com/schedule nightly' \
        'cache tag sessions' \
        'web ops.example.com/environment production' \
        'web ops.example.com/support-tier on-call' \
        'web ops.example.com/owner shop-team' \
        'web tag untagged' ;;
  esac
}
SENTENCE='web is built for production and carries no ops.example.com/support-tier label'

[ -e "$HERE/dist" ] && die "$HERE/dist exists; remove it first — the builds write dist/ and this script compares the trees they write"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK" "$HERE/dist"' EXIT

# copy <dir> <none|narrowed>: a copy of this workspace in <dir>, with no
# governance attachment, or with the label-transform policy narrowed to the
# datastore category. Exits 2 if the configuration does not read as expected,
# rather than building a copy that does not differ the way it should.
copy() {
  local dir="$1" cfg next
  mkdir -p "$dir"
  cp -R "$HERE/aggregate.yaml" "$HERE/manifest.yaml" "$HERE/release-production.yaml" "$HERE/policies" "$dir/"
  cfg="$(cat "$HERE/.aggrega-config.yaml")"
  case "$2" in
    none)
      next="${cfg%%$'\n'plugins:*}"
      [ "$next" != "$cfg" ] || die "no plugins: block in .aggrega-config.yaml to leave out" ;;
    narrowed)
      next="${cfg//"supported_categories: [datastore, devtool]"/"supported_categories: [datastore]"}"
      [ "$next" != "$cfg" ] || die "no 'supported_categories: [datastore, devtool]' in .aggrega-config.yaml to narrow" ;;
  esac
  printf '%s\n' "$next" > "$dir/.aggrega-config.yaml"
}

# build <label> <workspace> <release>: one build, its output to $WORK/<label>.log
# and its tree to $WORK/<label>.dist; prints its exit status.
build() {
  local status=0
  "$HELPER" --example "$2" "$3" -- --auto-pull --no-color --ir-graph ${EXTRA[@]+"${EXTRA[@]}"} \
    > "$WORK/$1.log" 2>&1 || status=$?
  if [ -d "$2/dist" ]; then mv "$2/dist" "$WORK/$1.dist"; fi
  printf '%s' "$status"
}

# labels <log>: "node key value" for every label of every node in the build
# graph the log carries, in the order the graph lists them. The graph is the
# JSON document --ir-graph prints, opening at a line holding only "{".
labels() {
  awk '
    /^\{$/ { ingraph = 1; next }
    !ingraph { next }
    /^\}$/ { ingraph = 0; next }
    /^    "nodes": \{$/ { innodes = 1; next }
    innodes && /^    \},?$/ { innodes = 0; next }
    innodes && match($0, /^      "[^"]+": \{$/) { node = $0; gsub(/^ +"|": \{$/, "", node); next }
    innodes && /^        "labels": \{$/ { inlabels = 1; next }
    inlabels && /^        \},?$/ { inlabels = 0; next }
    inlabels {
      line = $0
      sub(/^ +"/, "", line); sub(/",?$/, "", line)
      split(line, kv, /": "/)
      print node, kv[1], kv[2]
    }
  ' "$1"
}

# written <log>: the labels the attachments write, node by node, key by key.
written() {
  local all node key
  all="$(labels "$1")"
  for node in $NODES; do
    for key in $KEYS; do
      while IFS= read -r line; do
        case "$line" in "$node $key "*) printf '%s\n' "$line" ;; esac
      done <<< "$all"
    done
  done
}

# refusals <log>: the message of every [POLICY_ERROR E0005] in the log, one per
# line — the line after the code, without its "policy plugin "…" rejected the
# build: " lead.
refusals() {
  local line take=0
  while IFS= read -r line; do
    if [ "$take" -eq 1 ]; then
      take=0
      line="${line#"${line%%[![:space:]]*}"}"
      case "$line" in
        'policy plugin "'*'" rejected the build: '*) printf '%s\n' "${line#*rejected the build: }" ;;
        *) printf '%s\n' "(an unexpected line after the code: $line)" ;;
      esac
    elif [ "${line#"${line%%[![:space:]]*}"}" = "[POLICY_ERROR E0005]" ]; then
      take=1
    fi
  done < "$1"
}

row() { printf '%-24s %-12s %-5s %-9s %s\n' "$@"; }

rc=0
FAILED=""
fail() { rc=1; FAILED="$FAILED $1"; }

row RELEASE GOVERNANCE EXIT EXPECTED VERDICT
printf '%.0s-' {1..100}; printf '\n'

# The reference: no governance attachment.
copy "$WORK/none" none
ec="$(build none "$WORK/none" production)"
if [ "$ec" -eq 0 ] && [ -d "$WORK/none.dist" ]; then
  verdict="OK"
else
  verdict="MISMATCH: the reference build did not complete"; fail none
fi
row release-production.yaml none "$ec" reference "$verdict"

# The two Releases, with the attachments as written.
for rel in staging production; do
  label="$rel"
  ec="$(build "$label" "$HERE" "$rel")"
  got="$(written "$WORK/$label.log")"
  want="$(expected_labels "$rel")"
  if [ "$ec" -ne 0 ]; then
    verdict="MISMATCH: exited $ec"
  elif [ "$got" != "$want" ]; then
    verdict="MISMATCH: the nodes end with other labels than expected"
    { printf '=== expected labels\n%s\n=== labels read from the build graph\n%s\n' "$want" "$got"; } >> "$WORK/$label.log"
  elif [ "$rel" = production ] && ! diff -r "$WORK/none.dist" "$WORK/$label.dist" > "$WORK/$label.diff" 2>&1; then
    verdict="MISMATCH: the tree differs from the build with no governance attachment"
    cat "$WORK/$label.diff" >> "$WORK/$label.log"
  elif [ "$rel" = production ]; then
    verdict="OK: the expected labels; byte-identical to the build with none"
  else
    verdict="OK: the expected labels"
  fi
  case "$verdict" in OK*) ;; *) fail "$label" ;; esac
  row "release-$rel.yaml" "as attached" "$ec" pass "$verdict"
done

# The planted violation: the policy covers the datastore category only.
copy "$WORK/narrowed" narrowed
ec="$(build narrowed "$WORK/narrowed" production)"
count=0
other=""
while IFS= read -r msg; do
  count=$((count + 1))
  if [ "$msg" != "$SENTENCE" ] && [ -z "$other" ]; then other="$msg"; fi
done < <(refusals "$WORK/narrowed.log")
if [ "$ec" -eq 0 ]; then
  verdict="MISMATCH: completed"
elif [ "$count" -eq 0 ]; then
  verdict="MISMATCH: exited $ec with no E0005 policy refusal"
elif [ -n "$other" ]; then
  verdict="MISMATCH: E0005 says \"$other\"; expected \"$SENTENCE\""
else
  verdict="OK: E0005, the expected sentence"
fi
case "$verdict" in OK*) ;; *) fail narrowed ;; esac
row release-production.yaml narrowed "$ec" halt "$verdict"

# The labels each node ends with, read from each completed build's graph.
for rel in staging production; do
  printf '\nlabels the attachments wrote, release-%s.yaml:\n' "$rel"
  prev=""
  while read -r node key value; do
    if [ "$node" = "$prev" ]; then printf '  %-6s %s: %s\n' "" "$key" "$value"
    else printf '  %-6s %s: %s\n' "$node" "$key" "$value"; prev="$node"
    fi
  done < <(written "$WORK/$rel.log")
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
