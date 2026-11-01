#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# build-docs-bundle.sh — pack the published documentation into a single
# deterministic gzipped tar for publication as a standalone OCI data artifact.
#
# The bundle carries exactly the reader-facing documentation: the architecture
# chapters, the language reference, the authoring guide, the AI assistant pages,
# and the top-level README, Getting started, install and Learn Aggrega pages —
# the pages the documentation site publishes. It is NOT a catalog entity — it has no entity envelope and no kind —
# so it rides the
# generic data-artifact transport (`aggrega push-artifact`), not the
# kind-dispatched `aggrega push`.
#
# Determinism is the whole point. The generic transport pins its OCI manifest's
# creation annotation, so byte-identical input bytes always yield a byte-identical
# manifest digest — but only if THIS script produces byte-identical bytes from
# the same tree. GitOps diff-review and idempotent re-publish both depend on it:
# re-running against an unchanged tree must reproduce the same archive to the
# byte. Every source of non-determinism a tar+gzip normally leaks is pinned here:
#
#   --sort=name           stable member order regardless of readdir order
#   --mtime=@0            every member timestamp fixed to the epoch, not "now"
#   --owner/--group=0     no host-specific owner names
#   --numeric-owner       no uid->name / gid->name lookups from the host
#   --format=ustar        a fixed, well-specified archive format
#   gzip -n               no gzip header timestamp and no embedded filename
#
# File mode bits are the one field taken from the working tree; a clean checkout
# reproduces them deterministically. gzip compression level is left at the
# default so the bytes match the transport's documented expectation.
#
# Usage:
#   build-docs-bundle.sh [--output PATH]
#
#   --output PATH   Where to write the bundle (default: dist/aggrega-docs.tar.gz,
#                   under the gitignored dist/ tree). Parent dirs are created.
#
# The script prints the output path and its sha256 so a caller (or CI log) can
# confirm reproducibility across runs. It never publishes and never signs —
# `aggrega push-artifact` publishes the bytes and `aggrega sign` signs the
# published reference.
set -euo pipefail

die() { printf 'build-docs-bundle: %s\n' "$*" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- parse args -------------------------------------------------------------
OUTPUT="$DOCS_ROOT/dist/aggrega-docs.tar.gz"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) [ "$#" -ge 2 ] || die "--output needs a path"; OUTPUT="$2"; shift 2 ;;
    --output=*) OUTPUT="${1#*=}"; shift ;;
    -h|--help)
      printf 'Usage: build-docs-bundle.sh [--output PATH]\n'
      printf '  Packs architecture/, language-reference/, authoring/, ai-assistants/,\n'
      printf '  README.md, getting-started.md, install.md and learn.md into a\n'
      printf '  deterministic .tar.gz for `aggrega push-artifact`.\n'
      printf '  Default output: dist/aggrega-docs.tar.gz\n'
      exit 0 ;;
    *) die "unexpected argument: $1" ;;
  esac
done

# --- the published documentation content ------------------------------------
# Ordered explicitly (not globbed) so the bundle's scope is a reviewed decision,
# not whatever happens to sit in the tree. Each must exist; a missing member is
# a packaging error, not a silently smaller bundle.
MEMBERS=(architecture language-reference authoring ai-assistants README.md getting-started.md install.md learn.md)
for m in "${MEMBERS[@]}"; do
  [ -e "$DOCS_ROOT/$m" ] || die "expected documentation content missing: $m"
done

# --- pack deterministically -------------------------------------------------
mkdir -p "$(dirname "$OUTPUT")"

# tar streams the canonicalised archive to stdout; gzip -n strips the header
# timestamp and filename. -C makes member paths repo-relative (architecture/...,
# not an absolute host path).
tar \
  --sort=name \
  --mtime=@0 \
  --owner=0 --group=0 --numeric-owner \
  --format=ustar \
  -C "$DOCS_ROOT" \
  -cf - "${MEMBERS[@]}" \
  | gzip -n > "$OUTPUT"

# --- report -----------------------------------------------------------------
if command -v sha256sum >/dev/null 2>&1; then
  DIGEST="$(sha256sum "$OUTPUT" | cut -d' ' -f1)"
elif command -v shasum >/dev/null 2>&1; then
  DIGEST="$(shasum -a 256 "$OUTPUT" | cut -d' ' -f1)"
else
  DIGEST="(sha256 tool unavailable)"
fi

printf 'build-docs-bundle: wrote %s\n' "$OUTPUT"
printf 'build-docs-bundle: sha256 %s\n' "$DIGEST"
