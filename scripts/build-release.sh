#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# build-release.sh — build one Release of an example workspace with the aggrega
# CLI, choosing the catalog source the way each example expects.
#
# The examples come in two shapes:
#
#   consumption  — a bare release.yaml plus a .aggrega-config.yaml whose
#                  catalog_dirs supply the catalog. No local catalog/ dir; the
#                  config drives entity resolution. Built with no --catalog flag.
#
#   multi-target — release-<P>.yaml paired with a sibling catalog-<P>/ (same
#                  <P> token, e.g. release-helm.yaml + catalog-helm/). Built with
#                  --catalog catalog-<P>/, which is prepended to the search stack.
#
# Catalog discovery (evaluated per release file):
#
#   1. If a catalog-<P>/ dir sits beside release-<P>.yaml (matching <P> token) →
#      pass --catalog catalog-<P>/.
#   2. Else if the example dir has a .aggrega-config.yaml with catalog_dirs →
#      pass no --catalog; the config drives resolution.
#   3. Else → pass no --catalog; resolution falls to the configured/hub catalog.
#
#   A <P> token with no matching catalog-<P>/ dir (e.g. the "negative" in
#   release-negative.yaml) never pairs — rule 1 only fires when the dir exists,
#   so non-provider tokens fall through to rule 2/3 on their own.
#
# One release per run. If the example has several release*.yaml files, name one
# (positional arg — full filename or its <P> token) or pick from the prompt.
# The script never builds every variant in a single invocation.
#
# The script echoes the equivalent direct `aggrega build` command before running
# it, so the underlying invocation is visible.
#
# The aggrega exit code is surfaced raw. Expected-fail releases (a loud guardrail
# demonstration) exit non-zero, and the script propagates that code unchanged —
# a non-zero exit is never reported as success.
#
# Binary resolution, in order:
#   1. aggrega on PATH.
#   2. a prebuilt sibling binary at <umbrella>/aggrega-cli/aggrega (or
#      aggrega-light), when this script runs inside the umbrella workspace.
#   3. a fresh `go build ./cmd/aggrega` in the aggrega-cli module (the Go
#      workspace file is auto-discovered), when the module is present.
# A standalone aggrega-docs clone has no sibling module; there, install aggrega
# on PATH.
#
# Usage:
#   build-release.sh [--example DIR] [RELEASE] [-- EXTRA aggrega build args]
#
#   --example DIR   Example workspace to build (default: current directory).
#                   The thin per-example wrappers pass their own location here.
#   RELEASE         Which release to build: a release*.yaml filename, or just its
#                   <P> token (e.g. `helm` for release-helm.yaml). Optional when
#                   the example has exactly one release file.
#   -- EXTRA        Everything after `--` is forwarded to `aggrega build`
#                   verbatim (e.g. --debug, --trace).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'build-release: %s\n' "$*" >&2; exit 2; }

# --- parse args -------------------------------------------------------------
EXAMPLE_DIR="."
RELEASE_ARG=""
declare -a EXTRA=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --example) [ "$#" -ge 2 ] || die "--example needs a directory"; EXAMPLE_DIR="$2"; shift 2 ;;
    --example=*) EXAMPLE_DIR="${1#*=}"; shift ;;
    --) shift; EXTRA=("$@"); break ;;
    -h|--help)
      printf 'Usage: build-release.sh [--example DIR] [RELEASE] [-- EXTRA aggrega build args]\n'
      printf '  RELEASE  a release*.yaml filename or its <P> token (e.g. helm); optional\n'
      printf '           when the example has exactly one release file.\n'
      printf '  One release per run. Catalog source is auto-discovered per release file.\n'
      printf '  See the header of this script for the full discovery rules.\n'
      exit 0 ;;
    -*) die "unknown flag: $1 (forward aggrega flags after --)" ;;
    *) [ -z "$RELEASE_ARG" ] || die "only one release per run (got '$RELEASE_ARG' and '$1')"; RELEASE_ARG="$1"; shift ;;
  esac
done

[ -d "$EXAMPLE_DIR" ] || die "example dir not found: $EXAMPLE_DIR"
cd "$EXAMPLE_DIR"
EXAMPLE_NAME="$(basename "$(pwd)")"

# --- resolve the aggrega binary ---------------------------------------------
AGGREGA=""
if command -v aggrega >/dev/null 2>&1; then
  AGGREGA="aggrega"
else
  CLI_DIR="$SCRIPT_DIR/../../aggrega-cli"
  if [ -x "$CLI_DIR/aggrega" ]; then
    AGGREGA="$CLI_DIR/aggrega"
  elif [ -x "$CLI_DIR/aggrega-light" ]; then
    AGGREGA="$CLI_DIR/aggrega-light"
  elif [ -f "$CLI_DIR/go.mod" ] && command -v go >/dev/null 2>&1; then
    printf 'build-release: no aggrega on PATH; building from source in %s ...\n' "$CLI_DIR" >&2
    BUILT="$(mktemp -d)/aggrega"
    ( cd "$CLI_DIR" && go build -o "$BUILT" ./cmd/aggrega ) || die "go build of aggrega failed"
    AGGREGA="$BUILT"
  else
    die "no aggrega found: install it on PATH, or run inside the umbrella workspace where aggrega-cli/ is present"
  fi
fi

# --- enumerate release files ------------------------------------------------
declare -a RELEASES=()
for f in release.yaml release-*.yaml; do
  [ -f "$f" ] && RELEASES+=("$f")
done
[ "${#RELEASES[@]}" -gt 0 ] || die "no release.yaml or release-*.yaml in $(pwd)"

# --- choose exactly one release ---------------------------------------------
RELEASE=""
if [ -n "$RELEASE_ARG" ]; then
  if [ -f "$RELEASE_ARG" ]; then
    RELEASE="$RELEASE_ARG"
  elif [ -f "release-$RELEASE_ARG.yaml" ]; then
    RELEASE="release-$RELEASE_ARG.yaml"
  else
    die "no such release '$RELEASE_ARG'; available: ${RELEASES[*]}"
  fi
elif [ "${#RELEASES[@]}" -eq 1 ]; then
  RELEASE="${RELEASES[0]}"
elif [ -t 0 ]; then
  printf 'Select a release to build (one per run):\n' >&2
  select choice in "${RELEASES[@]}"; do
    [ -n "$choice" ] && { RELEASE="$choice"; break; }
  done
  [ -n "$RELEASE" ] || die "no release chosen"
else
  die "multiple releases in $EXAMPLE_NAME; name one. Available: ${RELEASES[*]}"
fi

# --- catalog discovery (3 rules) --------------------------------------------
# <P> token: strip the release- prefix and .yaml suffix. Bare release.yaml → "".
token="${RELEASE#release-}"
token="${token%.yaml}"
[ "$token" = "release" ] && token=""

declare -a CATALOG_FLAGS=()
rule=""
if [ -n "$token" ] && [ -d "catalog-$token" ]; then
  CATALOG_FLAGS=(--catalog "catalog-$token")
  rule="1 (paired catalog-$token/)"
elif [ -f ".aggrega-config.yaml" ] && grep -q 'catalog_dirs' .aggrega-config.yaml; then
  rule="2 (.aggrega-config.yaml catalog_dirs drives resolution)"
else
  rule="3 (configured/hub catalog fallback)"
fi

# --- echo the equivalent direct command, then run it ------------------------
printf '# example : %s\n' "$EXAMPLE_NAME"
printf '# rule    : %s\n' "$rule"
printf '# command : %s build --release %s' "$AGGREGA" "$RELEASE"
[ "${#CATALOG_FLAGS[@]}" -gt 0 ] && printf ' --catalog %s' "catalog-$token"
[ "${#EXTRA[@]}" -gt 0 ] && printf ' %s' "${EXTRA[*]}"
printf '\n\n'

set +e
"$AGGREGA" build --release "$RELEASE" "${CATALOG_FLAGS[@]}" "${EXTRA[@]}"
status=$?
set -e

if [ "$status" -ne 0 ]; then
  printf '\nbuild-release: aggrega exited %d (surfaced raw; a non-zero exit is expected for guardrail-demonstration releases)\n' "$status" >&2
fi
exit "$status"
