#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Runs the two rule scripts beside it over small output directories this script
# writes itself, and checks each verdict against the one the README describes:
#
#   - an output that keeps both rules: every image pinned by a tag or a digest,
#     a CustomResourceDefinition declaring a schema property named `image`, a
#     ConfigMap with a data: block and an ExternalSecret written as JSON — both
#     rules exit 0 and say how much they looked at;
#   - an output that breaks both: an image with no tag behind a registry port, an
#     image tagged `latest`, and a Secret carrying material under stringData: —
#     both rules exit 1 and name each offending artifact;
#   - an output holding a file that does not parse, and a run given no
#     directory — both rules exit 2, the code for "could not evaluate".
#
# Nothing here builds a workspace or needs the aggrega binary: the rules read
# whatever output directory they are given, so the directories are written here
# in the shapes a build emits. Both rules need yq on PATH, as the README says.
#
# Usage: ./check.sh
#
# Prints one line per run and exits 1 if any verdict differs from its
# expectation, printing what each differing run wrote.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  '') ;;
  -h|--help)
    printf 'Usage: ./check.sh\n'
    printf '  Runs require-pinned-image.sh and deny-inline-credential-material.sh over\n'
    printf '  output directories written here, and checks each exit code and report\n'
    printf '  against the README. Exits 1 on any mismatch. Needs yq on PATH.\n'
    exit 0 ;;
  *) printf 'check: unknown argument: %s\n' "$1" >&2; exit 2 ;;
esac

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# --- the output directories -------------------------------------------------
mkdir -p "$WORK/keeps-both" "$WORK/breaks-both" "$WORK/unreadable"

cat > "$WORK/keeps-both/app.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      initContainers:
        - name: init
          image: registry.example.com/tools/init@sha256:2b7c3f0e9d1a4c6b8e5f7a9c0d2e4f6a8b1c3d5e7f9a0b2c4d6e8f0a1b3c5d7e
      containers:
        - name: web
          image: registry.example.com/web:1.4.2
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-settings
data:
  mode: production
EOF

cat > "$WORK/keeps-both/crd.yaml" <<'EOF'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: widgets.example.com
spec:
  versions:
    - name: v1
      schema:
        openAPIV3Schema:
          properties:
            spec:
              properties:
                image:
                  type: string
EOF

cat > "$WORK/keeps-both/credential.json" <<'EOF'
{"apiVersion": "external-secrets.io/v1", "kind": "ExternalSecret",
 "metadata": {"name": "web-key"},
 "spec": {"data": [{"secretKey": "api-key", "remoteRef": {"key": "web/api-key"}}]}}
EOF

cat > "$WORK/breaks-both/app.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      containers:
        - name: web
          image: registry.example.com:5000/web
        - name: proxy
          image: registry.example.com/proxy:latest
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cleanup
spec:
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: cleanup
              image: registry.example.com/cleanup:2.0.1
EOF

cat > "$WORK/breaks-both/secret.yaml" <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: web-key
stringData:
  api-key: placeholder
EOF

printf 'kind: [unclosed\n' > "$WORK/unreadable/broken.yaml"

# --- the expectations ---------------------------------------------------------
row() { printf '%-38s %-36s %-5s %s\n' "$@"; }

rc=0
FAILED=""
# expect <label> <rule script> <directory or ""> <exit code> <expected report or "">
# Runs the rule, compares its exit code and, when an expected report is named,
# its standard output byte for byte.
expect() {
  local label=$1 rule=$2 dir=$3 want_ec=$4 want_out=$5 ec=0 verdict
  if [ -n "$dir" ]; then
    "$HERE/$rule" "$dir" > "$WORK/$label.out" 2> "$WORK/$label.err" || ec=$?
  else
    "$HERE/$rule" > "$WORK/$label.out" 2> "$WORK/$label.err" || ec=$?
  fi
  if [ "$ec" -ne "$want_ec" ]; then
    verdict="MISMATCH: exited $ec, expected $want_ec"
  elif [ -n "$want_out" ] && ! cmp -s "$want_out" "$WORK/$label.out"; then
    verdict="MISMATCH: the report differs from the expected one"
    printf '%s\n' '--- expected' >> "$WORK/$label.err"
    cat "$want_out" >> "$WORK/$label.err"
  else
    verdict="OK"
  fi
  case "$verdict" in OK) ;; *) rc=1; FAILED="$FAILED $label" ;; esac
  row "$label" "$rule" "$ec" "$verdict"
}

# expected <name> <line>...: writes the lines as the expected report and prints its path.
expected() { local name=$1; shift; printf '%s\n' "$@" > "$WORK/want-$name.txt"; printf '%s' "$WORK/want-$name.txt"; }

row RUN RULE EXIT VERDICT
printf '%.0s-' {1..96}; printf '\n'

expect pinned-keeps-both require-pinned-image.sh "$WORK/keeps-both" 0 \
  "$(expected pinned-keeps 'OK: every image pinned across 2 container(s) in 4 document(s)')"
expect credential-keeps-both deny-inline-credential-material.sh "$WORK/keeps-both" 0 \
  "$(expected credential-keeps 'OK: no inline credential material across 4 document(s), 1 of them credential-carrying')"
expect pinned-breaks-both require-pinned-image.sh "$WORK/breaks-both" 1 \
  "$(expected pinned-breaks \
    'REFUSED: app.yaml: Deployment/web container web runs unpinned image registry.example.com:5000/web' \
    'REFUSED: app.yaml: Deployment/web container proxy runs unpinned image registry.example.com/proxy:latest' \
    'REFUSED: 2 finding(s) across 3 container(s) in 3 document(s)')"
expect credential-breaks-both deny-inline-credential-material.sh "$WORK/breaks-both" 1 \
  "$(expected credential-breaks \
    'REFUSED: secret.yaml (document 1): Secret/web-key carries inline material under api-key' \
    'REFUSED: 1 finding(s) across 3 document(s), 1 of them credential-carrying')"
expect pinned-unreadable require-pinned-image.sh "$WORK/unreadable" 2 ""
expect credential-unreadable deny-inline-credential-material.sh "$WORK/unreadable" 2 ""
expect pinned-no-directory require-pinned-image.sh "" 2 ""
expect credential-no-directory deny-inline-credential-material.sh "" 2 ""

printf '\n'
if [ "$rc" -ne 0 ]; then
  n=0
  for label in $FAILED; do
    n=$((n + 1))
    printf '=== output of %s\n' "$label"
    cat "$WORK/$label.out" "$WORK/$label.err"
    printf '\n'
  done
  printf 'check: %d run(s) did not end as expected.\n' "$n"
else
  printf 'check: every run ended as expected.\n'
fi
exit "$rc"
