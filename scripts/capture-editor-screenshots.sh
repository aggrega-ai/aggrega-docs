#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio s.r.l.
#
# capture-editor-screenshots.sh — take every screenshot the documentation shows
# of Visual Studio Code from the real editor, and replace images/editor/ with
# them. Run with --help for what it does and what it needs.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS="$(cd "$HERE/.." && pwd)"

usage() {
  cat <<'EOF'
capture-editor-screenshots.sh — take every screenshot the documentation shows of
Visual Studio Code, from the real editor, and replace images/editor/ with them.

Usage:
  scripts/capture-editor-screenshots.sh --compiler <file> --compiler-commit <sha> [options]
  scripts/capture-editor-screenshots.sh --help

WHEN TO RUN IT

  By hand, from time to time, to bring the documentation's screenshots of the
  editor up to date with the extension and the compiler. It is a maintenance
  step and nothing else: no release, build, check or test runs it, and nothing
  waits on it. Review the images it writes, as any change to the documentation
  is reviewed, before committing them.

WHAT IT DOES, IN ORDER

  1. Compiles the Visual Studio Code extension in its checkout by the
     extension's own compile steps, other than building the wire contract,
     stopping where the extension does not compile.
  2. Fetches the editor build the extension's end-to-end runner drives, where it
     is not already in the extension's .vscode-test/ directory.
  3. Runs that runner's capture-docs command, which launches the editor with no
     display, once per folder, in a window of 1280 x 800 with the Dark Modern
     theme and English text, and drives it the way a reader does:
       images/editor/manual/            the editor's manual: the welcome page, a
                                        compiler not found, the Aggrega view and
                                        its panels, a menu, the topology graph,
                                        the Release chooser, the Command Palette,
                                        the import's first question, the settings
                                        and a language server that is not running
       images/editor/quickstart-<track>/  each step of each quickstart open, its
                                        Aggregate beside its topology graph:
                                        step-<n>.png
       images/editor/import/<format>/   for each import page: scaffold.png, the
                                        example open; import.png, the editor's
                                        Import into Aggrega as it ends;
                                        validate.png and build.png, the drafts
                                        validated and built, as the editor ends
                                        each
     The quickstart steps and the import pages are the ones this checkout holds.
     Each folder it opens is laid out from this checkout's examples — an import
     example is scaffolded with `aggrega scaffold --example`, or laid out from
     the checkout as the scaffold writes it where the compiler finds no
     documentation for its version — and each import is the one the page's own
     import command runs. Before a frame is written, the text the window draws is
     read for your home directory and the checkouts' paths, and a frame drawing
     either is not taken.
  4. Rewrites every frame smaller, as a PNG with a palette of at most 256 colours
     (scripts/optimise-screenshots.mjs, with the sharp the site installs).
  5. Replaces images/editor/ with the result, and prints how long the run took and
     each image with its dimensions and its size before and after.

  Where a frame cannot be taken, the run says which and why, writes nothing into
  images/editor/, and exits 1; the frames it did take stay in the scratch
  directory. --replace-partial writes them anyway, removing each image the run
  did not take again.

WHAT IT NEEDS

  --compiler <file>          an aggrega binary built from a committed revision. It
                             is copied into the scratch directory, and the editor
                             runs that copy.
  --compiler-commit <sha>    the commit it was built from, which it must report.
  Node.js and npm, the extension's dependencies installed (`npm ci` in its
  checkout), and the site's (`npm ci` in site/).
  Read access to the registry the examples name (hub.aggrega.ai), for the
  dependencies they pull and the importers an import fetches — with --catalog,
  for what that catalog does not hold, such as a plugin published to the
  registry or an importer. Where DOCKER_CONFIG is set, a registry credential is
  read from the Docker configuration directory it names: its path is handed on
  to every compiler run and editor the capture starts, and nothing here opens it.

OPTIONS

  --extension <dir>          the extension's checkout; default: the
                             aggrega-vscode-extension directory beside this
                             documentation checkout
  --only <groups>            a comma-separated subset of manual, quickstart and
                             import; only those groups' directories are replaced
  --catalog <dir>            the aggrega-catalog directory of a checkout of the
                             standard library: every editor and every compiler
                             run then reads the standard library from a copy of
                             what that checkout's commit holds, instead of from
                             the registry the examples name
  --importer-catalog <dir>   a catalog folder holding the importers at the
                             compiler's own version, beside their Plugin entities.
                             A compiler built between releases has a version no
                             registry holds importers for; with this and
                             --catalog, its imports read the importers from it.
  --scratch <dir>            where every folder the editor opens, its home
                             directory and its profile are laid out; default:
                             /tmp/aggrega-screens. It is a path the frames show,
                             so keep it neutral. It must be absent, empty, or a
                             previous run's scratch directory, which is removed.
  --replace-partial          replace the images even where some frames were not
                             taken
  --help                     this text

  It launches the editor once for each folder it opens and runs the compiler in
  each; on a shared machine, run it under whatever limits heavy jobs there.

EXIT STATUS

  0  every frame was taken and images/editor/ replaced.
  1  a frame was not taken, a step failed, or an image could not be written; the
     output says which.
  2  a usage error, or something it needs is missing.
EOF
}

die() { printf 'capture-editor-screenshots: %s\n' "$1" >&2; exit 2; }

COMPILER=""; COMMIT=""; EXT=""; ONLY=""; CATALOG=""; IMPORTERS=""; SCRATCH="/tmp/aggrega-screens"; PARTIAL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --compiler) COMPILER="${2:-}"; shift 2 ;;
    --compiler-commit) COMMIT="${2:-}"; shift 2 ;;
    --extension) EXT="${2:-}"; shift 2 ;;
    --only) ONLY="${2:-}"; shift 2 ;;
    --catalog) CATALOG="${2:-}"; shift 2 ;;
    --importer-catalog) IMPORTERS="${2:-}"; shift 2 ;;
    --scratch) SCRATCH="${2:-}"; shift 2 ;;
    --replace-partial) PARTIAL=1; shift ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

[ -n "$COMPILER" ] || die "--compiler is required (see --help)"
[ -x "$COMPILER" ] || die "--compiler names no executable file: $COMPILER"
[ -n "$COMMIT" ] || die "--compiler-commit is required (see --help)"
[ -n "$EXT" ] || EXT="$DOCS/../aggrega-vscode-extension"
[ -f "$EXT/package.json" ] && [ -d "$EXT/test/e2e" ] || die "no extension checkout at $EXT (--extension)"
EXT="$(cd "$EXT" && pwd)"
[ -d "$EXT/node_modules" ] || die "the extension's dependencies are not installed: run \`npm ci\` in $EXT"
[ -d "$DOCS/site/node_modules/sharp" ] || die "the site's dependencies are not installed: run \`npm ci\` in $DOCS/site"
command -v node >/dev/null 2>&1 || die "node is not on PATH"
case "$SCRATCH" in /*) : ;; *) die "--scratch must be an absolute path" ;; esac
COMPILER="$(cd "$(dirname "$COMPILER")" && pwd)/$(basename "$COMPILER")"

# The scratch directory: absent, empty, or a previous run's, which carries the
# runner-tmp directory the capture makes there before anything else.
if [ -d "$SCRATCH" ] && [ -n "$(ls -A "$SCRATCH")" ]; then
  [ -d "$SCRATCH/runner-tmp" ] || die "$SCRATCH holds files no capture wrote; name another --scratch"
  rm -rf "$SCRATCH" || die "could not remove the previous run's $SCRATCH"
fi

START="$(date +%s)"
printf 'capture-editor-screenshots: started %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 1. The extension, compiled, its vendored assets copied and its build stamped,
# every time, by the steps of its own compile script, named. The one step of that
# script left out is build-wire-contract: it installs and builds inside the
# aggrega-abi checkout beside the extension, another repository's tree, which a
# screenshot run does not write to.
( cd "$EXT" && npx tsc -p ./ ) || { printf 'capture-editor-screenshots: the extension does not compile; nothing was captured\n' >&2; exit 1; }
( cd "$EXT" && npm run --silent copy-vendor-assets ) || { printf 'capture-editor-screenshots: the vendored assets could not be copied\n' >&2; exit 1; }
( cd "$EXT" && npm run --silent stamp-build-version ) || { printf 'capture-editor-screenshots: the build stamp could not be written\n' >&2; exit 1; }

# 2. The editor build.
( cd "$EXT" && node out/test/e2e/run.js fetch-editor ) || { printf 'capture-editor-screenshots: the editor build could not be fetched\n' >&2; exit 1; }

# 3. The frames.
RAW="$(mktemp -d)"
NEW="$(mktemp -d)"
trap 'rm -rf "$RAW" "$NEW"' EXIT
# What each import page marks — its import command, the example files it quotes,
# and any marker with no fenced block under it — read with the documentation's own
# readers, scripts/lib/fenced-blocks.awk and scripts/lib/marked-blocks.awk, as
# check-import-example.sh reads the same pages, so the capture parses no page. An
# import command is one line. Written as `<format> TAB command|quote|unfenced TAB
# <value>`; the capture reports a page with an unfenced marker rather than
# guessing what it quotes.
QUOTES="$RAW/page-quotes.tsv"
: > "$QUOTES"
for page in "$DOCS"/authoring/import/*.md; do
  format="$(basename "$page" .md)"
  [ "$format" != README ] || continue
  awk -f "$HERE/lib/fenced-blocks.awk" "$page" > "$RAW/blocks" || { printf 'capture-editor-screenshots: the block reader failed on %s\n' "$page" >&2; exit 1; }
  awk -v blocks="$RAW/blocks" -f "$HERE/lib/marked-blocks.awk" "$page" > "$RAW/marked" || { printf 'capture-editor-screenshots: the marker reader failed on %s\n' "$page" >&2; exit 1; }
  awk -v format="$format" -v page="$page" '
    /^marker / {
      target = $4; kind = $3; lines = 0
      if (kind == "unfenced") print format "\tunfenced\t" target
      else if (target != "import-command") print format "\tquote\t" target
      next
    }
    target == "import-command" && kind == "fenced" {
      if (++lines > 1) { printf "the import command on %s is not one line\n", page > "/dev/stderr"; exit 1 }
      print format "\tcommand\t" substr($0, 3)
    }
  ' "$RAW/marked" >> "$QUOTES" || { printf 'capture-editor-screenshots: %s could not be read for its marked blocks\n' "$page" >&2; exit 1; }
done

ARGS=(capture-docs --scratch "$SCRATCH" --out "$RAW/frames" --docs "$DOCS" --compiler "$COMPILER" --compiler-commit "$COMMIT" --page-quotes "$QUOTES")
[ -z "$ONLY" ] || ARGS+=(--only "$ONLY")
[ -z "$CATALOG" ] || ARGS+=(--catalog "$CATALOG")
[ -z "$IMPORTERS" ] || ARGS+=(--importer-catalog "$IMPORTERS")
[ -z "${DOCKER_CONFIG:-}" ] || ARGS+=(--docker-config "$DOCKER_CONFIG")
( cd "$EXT" && node out/test/e2e/run.js "${ARGS[@]}" )
CAPTURED=$?
case "$CAPTURED" in
  0) : ;;
  1) if [ "$PARTIAL" -eq 0 ]; then
       mkdir -p "$SCRATCH/frames-taken" && cp -R "$RAW/frames/." "$SCRATCH/frames-taken/" 2>/dev/null
       printf 'capture-editor-screenshots: some frames were not taken (listed above); images/editor/ is left as it was, and the frames taken are in %s\n' "$SCRATCH/frames-taken" >&2
       exit 1
     fi ;;
  *) printf 'capture-editor-screenshots: the capture stopped before taking any frame (exit %s)\n' "$CAPTURED" >&2; exit 1 ;;
esac

# 4. Smaller.
node "$HERE/optimise-screenshots.mjs" "$RAW/frames" "$NEW/editor" || { printf 'capture-editor-screenshots: an image could not be rewritten; images/editor/ is left as it was\n' >&2; exit 1; }

# 5. Into the documentation: each group captured owns the directories named after
# it — `<group>` and `<group>-<anything>`, as quickstart-<track> — and every one of
# them is replaced whole by what this run wrote, so a directory the run no longer
# writes is removed rather than left stale.
DEST="$DOCS/images/editor"
mkdir -p "$DEST"
WANTED="${ONLY:-manual,quickstart,import}"
shopt -s nullglob
for g in ${WANTED//,/ }; do
  for d in "$DEST/$g" "$DEST/$g"-*; do rm -rf "${d:?}"; done
  for d in "$NEW/editor/$g" "$NEW/editor/$g"-*; do
    [ ! -d "$d" ] || cp -R "$d" "$DEST/$(basename "$d")"
  done
done
shopt -u nullglob

END="$(date +%s)"
printf 'capture-editor-screenshots: finished %s, run time %d s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$((END - START))"
[ "$CAPTURED" -eq 0 ] || { printf 'capture-editor-screenshots: images replaced although some frames were not taken (--replace-partial)\n' >&2; exit 1; }
exit 0
