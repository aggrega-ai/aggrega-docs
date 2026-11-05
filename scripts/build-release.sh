#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# build-release.sh — build one Release of an example workspace with the aggrega
# CLI, choosing the catalog source the way each example expects.
#
# The examples come in two shapes:
#
#   consumption  — a bare release.yaml plus a .aggrega-config.yaml naming the
#                  default registry that supplies the catalog entities, and the
#                  example's own catalog directory where it has one. Built with
#                  no --catalog flag.
#
#   multi-target — release-<P>.yaml paired with a sibling catalog-<P>/ (same
#                  <P> token, e.g. release-helm.yaml + catalog-helm/). Built with
#                  --catalog catalog-<P>/, which is prepended to the search stack —
#                  or with no flag, where the example's .aggrega-config.yaml
#                  names that release under workspace.releases.
#
# Catalog discovery (evaluated per release file):
#
#   1. If a catalog-<P>/ dir sits beside release-<P>.yaml (matching <P> token) →
#      pass --catalog catalog-<P>/, unless .aggrega-config.yaml names that release
#      file under workspace.releases. Then pass no --catalog: the configuration
#      gives the release its own catalog directories, and the flag would put the
#      same directory on the search stack a second time.
#   2. Else if the example dir has a .aggrega-config.yaml declaring catalog_dirs →
#      pass no --catalog; the config drives resolution.
#   3. Else → pass no --catalog; resolution falls to the configured/hub catalog.
#
#   A <P> token with no matching catalog-<P>/ dir (e.g. the "negative" in
#   release-negative.yaml) never pairs — rule 1 only fires when the dir exists,
#   so non-provider tokens fall through to rule 2/3 on their own.
#
#   What discovery does NOT do, stated because the rule numbers alone read as a
#   stronger promise than they are:
#
#   * It looks only beside the release file and at that directory's own
#     .aggrega-config.yaml. It never searches upward or elsewhere in a
#     repository, so a workspace that has neither a paired catalog-<P>/ dir nor a
#     config of its own gets rule 3 — the configured/hub catalog — even when a
#     catalog exists further up the tree. A scratchpad workspace is the usual way
#     to meet this: pass --catalog explicitly after `--`, or write a config.
#   * Rule 2 fires on a catalog_dirs KEY being declared, not on the directories it
#     lists being present. The paths in an example's config are relative to that
#     example; a listed directory that is not there is refused by the build, which
#     names the entry. The script warns on stderr when it can see that has
#     happened, and says so when it cannot read the list well enough to tell.
#   * Rule 1 reads the workspace.releases map in block style only, matching an
#     entry by its key (the release file, bare or ./-prefixed, quoted or not). A
#     map written in flow style is not read, and rule 1 then passes the flag.
#
# One release per run. If the example has several release*.yaml files, name one
# (positional arg — full filename or its <P> token) or pick from the prompt.
# The script never builds every variant in a single invocation.
#
# The script echoes the equivalent direct `aggrega build` command before running
# it, so the underlying invocation is visible. That echo is the command a reader
# can retype, so it names the program `aggrega` whichever binary was resolved;
# WHICH binary that was is on stderr, in the provenance block described below.
# Keeping the two apart is deliberate: the echoed command stays identical however
# the binary was found, so an example page can quote it, while the identity of
# the artifact that produced the output is never left implicit.
#
# The aggrega exit code is surfaced raw. Expected-fail releases (a loud guardrail
# demonstration) exit non-zero, and the script propagates that code unchanged —
# a non-zero exit is never reported as success.
#
# Binary resolution.
#
# Every run prints, on stderr, which binary it resolved, where that binary came
# from, and what is known about whether it is current. A prebuilt binary that
# predates the source it is supposed to demonstrate produces a confident result
# for the wrong artifact, which is worse than no result at all, so the choice is
# never silent and a prebuilt is never preferred over a build that supersedes it.
#
#   1. $AGGREGA_BIN, if set — an executable path or a command name. Used exactly
#      as given and NOT freshness-checked: naming it is a deliberate act, and an
#      override the script second-guessed would not be one. Refuses with exit 2
#      if the value names nothing runnable.
#   2. $AGGREGA_FROM_SOURCE=1, if set — skip every prebuilt and build. Refuses
#      with exit 2 if the module or the go toolchain is absent.
#   3. Otherwise the prebuilt candidates, in preference order: aggrega on PATH,
#      then aggrega in the sibling aggrega-cli checkout, then aggrega-light there.
#      Each is accepted only if no module input is newer than it; the first that
#      passes wins.
#   4. If no candidate passes — because each is superseded, or none exists — a
#      fresh `go build ./cmd/aggrega` in the aggrega-cli module (the Go workspace
#      file is auto-discovered). The rejected candidates are named on stderr.
#   5. If nothing is available at all, exit 2 naming the three ways forward.
#
# The freshness comparison is mtimes. A build input under aggrega-cli that is
# newer than the candidate marks that candidate superseded; the inputs are go.mod,
# go.sum, and every .go file except the _test.go ones, which are left out because
# they do not link into the binary. Being an mtime comparison it is a heuristic,
# not a proof: a
# checkout or a copy rewrites mtimes, and a binary built from a different tree
# can carry a newer one. It is reported as what it is, and $AGGREGA_BIN is the
# way to override it in either direction.
#
# A standalone aggrega-docs clone has no sibling module, so there is nothing to
# compare against; there, install aggrega on PATH and the run reports freshness
# as unverifiable rather than implying it was checked.
#
# Usage:
#   build-release.sh [--example DIR] [RELEASE] [-- EXTRA aggrega build args]
#   build-release.sh --print-binary [--build-into DIR]
#
#   --print-binary  Resolve the binary exactly as a build would, print the
#                   provenance block on stderr and the binary's path on stdout,
#                   and build no Release. It is how another script of this
#                   repository runs the same binary a build here would, without a
#                   second copy of the resolution. It refuses --example, a
#                   RELEASE and `--`, which only a build reads.
#   --build-into DIR
#                   With --print-binary: where resolution falls to building from
#                   source, write the binary into DIR, an existing directory the
#                   caller created and removes. Without it, --print-binary
#                   refuses rather than build, since nothing would own the
#                   result. This script never removes DIR.
#
#   --example DIR   Example workspace to build (default: current directory).
#                   The thin per-example wrappers pass their own location here.
#   RELEASE         Which release to build: a release*.yaml filename, or just its
#                   <P> token (e.g. `helm` for release-helm.yaml). Optional when
#                   the example has exactly one release file.
#   -- EXTRA        Everything after `--` is forwarded to `aggrega build`
#                   verbatim (e.g. --debug, --trace, or --catalog <dir> to read
#                   a local copy of the catalog ahead of the registry).
#
# Environment:
#   AGGREGA_BIN          Use this binary, unconditionally (see rule 1 above).
#   AGGREGA_FROM_SOURCE  Set to 1 to always build from source (see rule 2).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'build-release: %s\n' "$*" >&2; exit 2; }

# --- parse args -------------------------------------------------------------
EXAMPLE_DIR="."
EXAMPLE_GIVEN=0
RELEASE_ARG=""
PRINT_BINARY=0
BUILD_INTO=""
DASHDASH=0
declare -a EXTRA=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --print-binary) PRINT_BINARY=1; shift ;;
    --build-into) [ "$#" -ge 2 ] || die "--build-into needs a directory"; BUILD_INTO="$2"; shift 2 ;;
    --example) [ "$#" -ge 2 ] || die "--example needs a directory"; EXAMPLE_DIR="$2"; EXAMPLE_GIVEN=1; shift 2 ;;
    --example=*) EXAMPLE_DIR="${1#*=}"; EXAMPLE_GIVEN=1; shift ;;
    --) DASHDASH=1; shift; EXTRA=("$@"); break ;;
    -h|--help)
      printf 'Usage: build-release.sh [--example DIR] [RELEASE] [-- EXTRA aggrega build args]\n'
      printf '       build-release.sh --print-binary [--build-into DIR]\n'
      printf '           (resolve the binary as a build would and print its path; a build\n'
      printf '           from source goes into DIR, which the caller created and removes;\n'
      printf '           --example, a RELEASE and -- are refused with it)\n'
      printf '  RELEASE  a release*.yaml filename or its <P> token (e.g. helm); optional\n'
      printf '           when the example has exactly one release file.\n'
      printf '  One release per run. Catalog source is auto-discovered per release file.\n'
      printf '  See the header of this script for the full discovery rules.\n'
      printf '\n'
      printf '  AGGREGA_BIN=<path>       use this aggrega binary, unconditionally.\n'
      printf '  AGGREGA_FROM_SOURCE=1    ignore every prebuilt binary and build from source.\n'
      printf '  With neither set, a prebuilt binary is used only while no aggrega-cli build\n'
      printf '  input is newer than it; otherwise the script builds from source. Which binary\n'
      printf '  was chosen, where it came from, and what is known about its freshness are\n'
      printf '  printed on stderr on every run.\n'
      exit 0 ;;
    -*) die "unknown flag: $1 (forward aggrega flags after --)" ;;
    *) [ -z "$RELEASE_ARG" ] || die "only one release per run (got '$RELEASE_ARG' and '$1')"; RELEASE_ARG="$1"; shift ;;
  esac
done

# --print-binary builds no Release, so what only a build reads is refused rather
# than silently ignored.
if [ "$PRINT_BINARY" -eq 1 ]; then
  [ "$EXAMPLE_GIVEN" -eq 0 ] || die "--print-binary builds no Release, so it takes no --example"
  [ -z "$RELEASE_ARG" ] || die "--print-binary builds no Release, so it takes no RELEASE (got '$RELEASE_ARG')"
  [ "$DASHDASH" -eq 0 ] || die "--print-binary builds no Release, so it takes no -- and no aggrega build arguments"
fi
if [ -n "$BUILD_INTO" ]; then
  [ "$PRINT_BINARY" -eq 1 ] || die "--build-into is read with --print-binary only"
  [ -d "$BUILD_INTO" ] || die "--build-into names no directory: $BUILD_INTO"
  BUILD_INTO="$(cd "$BUILD_INTO" && pwd)"
fi
[ -d "$EXAMPLE_DIR" ] || die "example dir not found: $EXAMPLE_DIR"
cd "$EXAMPLE_DIR"
EXAMPLE_NAME="$(basename "$(pwd)")"

# --- resolve the aggrega binary ---------------------------------------------
# A prebuilt binary older than the source it is meant to demonstrate produces a
# confident result for the wrong artifact. So: the choice is announced on every
# run, and a prebuilt is taken only while nothing supersedes it.
# Normalised, so the provenance below names a path a reader can paste rather than
# one threaded back through this script's own location.
CLI_DIR="$SCRIPT_DIR/../../aggrega-cli"
[ -d "$CLI_DIR" ] && CLI_DIR="$(cd "$CLI_DIR" && pwd)"
MODULE_PRESENT=0
[ -f "$CLI_DIR/go.mod" ] && MODULE_PRESENT=1

AGGREGA=""
ORIGIN=""
FRESHNESS=""

# Absolute, symlink-resolved path of a binary — the PATH entry is commonly a
# symlink into the sibling module, and naming the link rather than the target
# would report two different-looking origins for one artifact.
resolve_path() {
  if command -v realpath >/dev/null 2>&1; then realpath "$1" 2>/dev/null || printf '%s' "$1"
  elif command -v readlink  >/dev/null 2>&1; then readlink -f "$1" 2>/dev/null || printf '%s' "$1"
  else printf '%s' "$1"
  fi
}

# Echoes the first module build input newer than $1, or nothing. Empty output
# means "nothing supersedes this binary"; it also means "could not tell" when no
# module is present, which is why every caller checks MODULE_PRESENT first.
superseding_input() {
  find "$CLI_DIR" \( \( -name '*.go' ! -name '*_test.go' \) -o -name go.mod -o -name go.sum \) \
       -newer "$1" -print -quit 2>/dev/null || true
}

build_from_source() {
  [ "$MODULE_PRESENT" -eq 1 ] || die "cannot build from source: no Go module at $CLI_DIR (a standalone aggrega-docs clone has no sibling module — install aggrega on PATH, or set AGGREGA_BIN)"
  command -v go >/dev/null 2>&1 || die "cannot build from source: no go toolchain on PATH (install Go, or set AGGREGA_BIN to a prebuilt binary)"
  if [ "$PRINT_BINARY" -eq 1 ]; then
    # The binary outlives this run, so it goes only where the caller said it owns.
    [ -n "$BUILD_INTO" ] || die "no prebuilt binary is current, and --print-binary builds from source only into a directory --build-into names"
    BUILD_TMP="$BUILD_INTO"
  else
    BUILD_TMP="$(mktemp -d)"
    trap 'rm -rf "$BUILD_TMP"' EXIT
  fi
  printf 'build-release: building aggrega from source in %s ...\n' "$CLI_DIR" >&2
  ( cd "$CLI_DIR" && go build -o "$BUILD_TMP/aggrega" ./cmd/aggrega ) \
    || die "go build of aggrega failed in $CLI_DIR (the error above is the compiler's, surfaced unchanged)"
  AGGREGA="$BUILD_TMP/aggrega"
  ORIGIN="built from source in $CLI_DIR"
  FRESHNESS="current by construction — built from the module in this working tree"
}

if [ -n "${AGGREGA_BIN:-}" ]; then
  # 1. Explicit override. Taken exactly as given, and deliberately not
  #    freshness-checked: naming a binary is a deliberate act.
  if [ -x "$AGGREGA_BIN" ] && [ -f "$AGGREGA_BIN" ]; then
    AGGREGA="$AGGREGA_BIN"
  elif command -v "$AGGREGA_BIN" >/dev/null 2>&1; then
    AGGREGA="$(command -v "$AGGREGA_BIN")"
  else
    die "AGGREGA_BIN='$AGGREGA_BIN' names no runnable binary (not an executable file, and not a command on PATH); unset it to fall back to the normal resolution order"
  fi
  ORIGIN="AGGREGA_BIN override -> $(resolve_path "$AGGREGA")"
  FRESHNESS="NOT CHECKED — an explicitly named binary is used as named"

elif [ "${AGGREGA_FROM_SOURCE:-}" = "1" ]; then
  # 2. Forced build.
  build_from_source

else
  # 3. Prebuilt candidates in preference order, each gated on nothing
  #    superseding it. 4. Otherwise build. 5. Otherwise refuse.
  declare -a CAND_PATH=() CAND_DESC=()
  if command -v aggrega >/dev/null 2>&1; then
    _p="$(command -v aggrega)"
    CAND_PATH+=("$_p"); CAND_DESC+=("aggrega on PATH at $_p -> $(resolve_path "$_p")")
  fi
  [ -x "$CLI_DIR/aggrega" ]       && { CAND_PATH+=("$CLI_DIR/aggrega");       CAND_DESC+=("prebuilt sibling aggrega-cli/aggrega"); }
  [ -x "$CLI_DIR/aggrega-light" ] && { CAND_PATH+=("$CLI_DIR/aggrega-light"); CAND_DESC+=("prebuilt sibling aggrega-cli/aggrega-light (the light build)"); }

  REJECTED=""
  for i in "${!CAND_PATH[@]}"; do
    cand="${CAND_PATH[$i]}"
    if [ "$MODULE_PRESENT" -eq 0 ]; then
      AGGREGA="$cand"; ORIGIN="${CAND_DESC[$i]}"
      FRESHNESS="UNVERIFIABLE — no Go module at $CLI_DIR to compare against, so nothing here checked whether this binary is current"
      break
    fi
    newer="$(superseding_input "$cand")"
    if [ -z "$newer" ]; then
      AGGREGA="$cand"; ORIGIN="${CAND_DESC[$i]}"
      FRESHNESS="no aggrega-cli build input is newer than it (mtime comparison, excluding _test.go)"
      break
    fi
    printf 'build-release: skipping %s — superseded: %s is newer than it\n' "${CAND_DESC[$i]}" "$newer" >&2
    REJECTED="${REJECTED:+$REJECTED; }${CAND_DESC[$i]}"
  done

  if [ -z "$AGGREGA" ]; then
    if [ "${#CAND_PATH[@]}" -eq 0 ] && [ "$MODULE_PRESENT" -eq 0 ]; then
      die "no aggrega found: install it on PATH, set AGGREGA_BIN to a binary, or check out aggrega-cli beside this aggrega-docs checkout to build it from source"
    fi
    build_from_source
    [ -n "$REJECTED" ] && ORIGIN="$ORIGIN (every prebuilt candidate was superseded: $REJECTED)"
  fi
fi

# The provenance block. On stderr, so the stdout transcript stays exactly the
# three lines the example pages quote — and so it is still printed by a run that
# fails before reaching them.
printf 'build-release: binary    = %s\n' "$AGGREGA"    >&2
printf 'build-release: origin    = %s\n' "$ORIGIN"     >&2
printf 'build-release: freshness = %s\n' "$FRESHNESS"  >&2

if [ "$PRINT_BINARY" -eq 1 ]; then
  printf '%s\n' "$AGGREGA"
  exit 0
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

# Rule 2 keys on catalog_dirs being DECLARED — a line whose first token is the
# key. The looser test of "the string appears anywhere in the file" also fires on
# a config that merely mentions catalog_dirs in a comment, which would announce
# that a config drives resolution when it declares nothing.
declares_catalog_dirs() {
  [ -f "$1" ] || return 1
  [ "$(awk '/^[[:space:]]*catalog_dirs:/ {n++} END{print n+0}' "$1")" -gt 0 ]
}

# The declared entries, one per line. A comment or a blank line inside the
# sequence is skipped rather than treated as its end — ending the list there
# silently yields nothing on a config that is perfectly well formed. Flow style
# (catalog_dirs: [a, b]) yields nothing here, which the caller reports as "could
# not read" rather than as "nothing declared".
catalog_dirs_entries() {
  awk '
    /^[[:space:]]*catalog_dirs:/ {inlist=1; next}
    !inlist {next}
    /^[[:space:]]*#/ {next}
    /^[[:space:]]*$/ {next}
    /^[[:space:]]*-[[:space:]]*/ {sub(/^[[:space:]]*-[[:space:]]*/,""); sub(/[[:space:]]*#.*$/,""); print; next}
    {inlist=0}
  ' "$1"
}

# Succeeds when the config at $1 names the release file $2 as a key of the
# workspace.releases map: a key one level below `releases:`, which sits in the
# top-level `workspace:` block. Block style only; comments and blank lines are
# skipped, and a key is compared with its quotes and a leading ./ removed.
names_release() {
  [ -f "$1" ] || return 1
  awk -v rel="$2" -v q="'" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      match($0, /^ */); ind = RLENGTH
      line = substr($0, ind + 1); sub(/[[:space:]]+#.*$/, "", line)
    }
    ind == 0 { inws = (line ~ /^workspace:/); inrel = 0; next }
    inrel && ind <= relind { inrel = 0 }
    inws && !inrel && line ~ /^releases:[[:space:]]*$/ { inrel = 1; relind = ind; keyind = -1; next }
    inrel {
      if (keyind < 0) keyind = ind
      if (ind == keyind) {
        key = line; sub(/:.*$/, "", key)
        gsub("^[\"" q "]|[\"" q "]$", "", key); sub(/^\.\//, "", key)
        if (key == rel) found = 1
      }
    }
    END { exit (found ? 0 : 1) }
  ' "$1"
}

declare -a CATALOG_FLAGS=()
rule=""
if [ -n "$token" ] && [ -d "catalog-$token" ]; then
  if names_release .aggrega-config.yaml "$RELEASE"; then
    rule="1 (paired catalog-$token/; .aggrega-config.yaml names $RELEASE under workspace.releases, so no --catalog)"
  else
    CATALOG_FLAGS=(--catalog "catalog-$token")
    rule="1 (paired catalog-$token/)"
  fi
elif declares_catalog_dirs .aggrega-config.yaml; then
  rule="2 (.aggrega-config.yaml catalog_dirs drives resolution)"

  # Rule 2 says the config drives resolution; it does not check that what the
  # config names is there. The paths are relative to this directory, and the
  # build refuses one that names nothing. Warn ahead of it when that is visible,
  # and say so plainly when the list cannot be read.
  entries_read=0
  missing_dirs=""
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    entries_read=$((entries_read + 1))
    case "$entry" in
      /*) probe="$entry" ;;
      *)  probe="./$entry" ;;
    esac
    [ -d "$probe" ] || missing_dirs="${missing_dirs:+$missing_dirs, }$entry"
  done < <(catalog_dirs_entries .aggrega-config.yaml)

  if [ "$entries_read" -eq 0 ]; then
    printf 'build-release: .aggrega-config.yaml declares catalog_dirs, but this script could not read the list (flow style, or a shape it does not parse). Whether those directories exist has NOT been checked.\n' >&2
  elif [ -n "$missing_dirs" ]; then
    printf 'build-release: .aggrega-config.yaml declares catalog_dirs that do not exist from %s: %s\n' "$(pwd)" "$missing_dirs" >&2
    printf 'build-release: the build refuses a listed directory that does not exist; create it, or remove the entry. The paths are relative to the example.\n' >&2
  fi
else
  rule="3 (configured/hub catalog fallback)"
fi

# --- echo the equivalent direct command, then run it ------------------------
printf '# example : %s\n' "$EXAMPLE_NAME"
printf '# rule    : %s\n' "$rule"
printf '# command : aggrega build --release %s' "$RELEASE"
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
