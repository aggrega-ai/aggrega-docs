#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds this example's Releases and checks each outcome against the one the
# README describes. Five builds:
#
#   - release-by-hand.yaml with no governance attachment: the reference. It
#     must complete and render, for each of api, worker and gateway, the
#     ServiceMonitor and the ServiceAccount its two annotations expand into.
#   - release.yaml with no governance attachment. No annotation is written on
#     api or worker, so neither carries the monitoring their Component requires,
#     and the build must halt with [DEVELOPER_ERROR E0162] naming those two and
#     no other component.
#   - release.yaml with the policy attached through the Rego engine
#     (governance-rego.yaml), and again through the CEL engine
#     (governance-cel.yaml). Each must complete and write the same files, byte
#     for byte, as the reference; its lockfile must pin the plugin as an
#     annotation-transform attachment; and the build graph it prints with
#     --ir-graph must record each of the three components as injected by that
#     plugin.
#   - release.yaml with the planted mistake attached
#     (governance-monitoring-as-string.yaml): a string injected under a key whose
#     binding routes three subkeys, on api and on worker. It must halt with the
#     refusal written below for each of the two, which names the plugin and its
#     role, and write no dist/.
#
# Each build runs in its own copy of this workspace, made in a temporary
# directory. The configuration lists no catalog directory, so the catalog
# entities come from the hub registry, unless the builds are given one — a
# --catalog passed after --, or AGGREGA_CATALOG_DIRS in the environment.
# Nothing in this directory is written: no lockfile and no dist/.
#
# Every build runs through the shared build-release helper, so the aggrega
# binary is the one that helper resolves — AGGREGA_BIN, when it is set. Each
# build passes --auto-pull, because lockfiles are not shipped, and --no-color,
# so the output is read as plain text.
#
# Usage: ./check.sh [-- EXTRA aggrega build args]
#   Everything after -- is passed to every build, after the arguments above.
#
# Prints one line per build and the files the policy's attachments rendered,
# and exits 1 if any outcome differs from its expectation, printing the output
# of each build that differed.
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
      printf '  Builds release-by-hand.yaml with no policy as the reference; release.yaml\n'
      printf '  with no policy, which must halt with E0162 for api and worker; release.yaml\n'
      printf '  with the policy on each engine, which must match the reference byte for byte,\n'
      printf '  pin the plugin and record the injection; and release.yaml with the planted\n'
      printf '  string, which must halt naming the plugin. Exits 1 on any mismatch. The\n'
      printf '  binary is the one build-release.sh resolves (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

# The files the two annotations expand into, per component, under dist/.
ATTACHMENT_FILES="
shop/helm/api--aws-role--api-serviceaccount-shop-api-aws-role.yaml
shop/helm/api--feature-zdaggrega-zdai-zsmonitoring--api-servicemonitor-shop-api-scrape.yaml
shop/helm/gateway--aws-role--gateway-serviceaccount-shop-gateway-aws-role.yaml
shop/helm/gateway--feature-zdaggrega-zdai-zsmonitoring--gateway-servicemonitor-shop-gateway-scrape.yaml
shop/helm/worker--aws-role--worker-serviceaccount-shop-worker-aws-role.yaml
shop/helm/worker--feature-zdaggrega-zdai-zsmonitoring--worker-servicemonitor-shop-worker-scrape.yaml"
# The components the build with no policy must name as missing their monitoring.
MISSING="api worker"
# The refusal of the planted string, per component it was injected on: the head
# naming where the value sits, and the line after it.
# refusal_head <component> / refusal_reason <component>
refusal_head() { printf '[OPS_ERROR E0367] .spec.boundaries.shop.components.%s.annotations' "$1"; }
refusal_reason() {
  printf 'a scalar annotation value does not route to exactly one path of its binding (Release shop-production, at .spec.boundaries.shop.components.%s.annotations, "feature.aggrega.ai/monitoring", carrying the bare value "30s", whose binding routes "interval, port, path", whose value plugin "governance/rego" injected at governance role "annotation-transform")' "$1"
}
# The components the policy injects the planted string on.
REFUSED="api worker"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# copy <dir>: a copy of this workspace in <dir>.
copy() {
  local dir="$1"
  mkdir -p "$dir"
  cp -R "$HERE/.aggrega-config.yaml" "$HERE/aggregate.yaml" "$HERE/manifest.yaml" "$HERE/release.yaml" \
    "$HERE/release-by-hand.yaml" "$HERE/governance-rego.yaml" "$HERE/governance-cel.yaml" \
    "$HERE/governance-monitoring-as-string.yaml" "$HERE/policies" "$dir/"
  printf '# A --config file that attaches nothing.\n' > "$dir/no-policy.yaml"
}

# build <label> <release file> <config file> [args...]: one build in a fresh
# copy at $WORK/<label>; its output to $WORK/<label>.log. Prints its exit status.
build() {
  local label="$1" rel="$2" cfg="$3" status=0
  shift 3
  copy "$WORK/$label"
  "$HELPER" --example "$WORK/$label" "$rel" -- --config "$WORK/$label/$cfg" --auto-pull --no-color "$@" \
    ${EXTRA[@]+"${EXTRA[@]}"} > "$WORK/$label.log" 2>&1 || status=$?
  printf '%s' "$status"
}

# trimmed <log>: every line of the log with its leading blanks removed.
trimmed() {
  local line
  while IFS= read -r line; do printf '%s\n' "${line#"${line%%[![:space:]]*}"}"; done < "$1"
}

# missing <log>: the component each [DEVELOPER_ERROR E0162] names, one per line.
missing() {
  local line
  while IFS= read -r line; do
    case "$line" in
      '[DEVELOPER_ERROR E0162] aggregate.yaml at .spec.components.'*) printf '%s\n' "${line##*.}" ;;
    esac
  done < "$1"
}

row() { printf '%-7s %-21s %-5s %-9s %s\n' "$@"; }

rc=0
FAILED=""
fail() { rc=1; FAILED="$FAILED $1"; }

row POLICY RELEASE EXIT EXPECTED VERDICT
printf '%.0s-' {1..100}; printf '\n'

# The reference: every annotation written by hand, no policy.
ec="$(build by-hand release-by-hand.yaml no-policy.yaml)"
absent=""
for f in $ATTACHMENT_FILES; do
  [ -f "$WORK/by-hand/dist/$f" ] || absent="$absent $f"
done
if [ "$ec" -ne 0 ]; then verdict="MISMATCH: exited $ec"
elif [ -n "$absent" ]; then verdict="MISMATCH: no$absent"
else verdict="OK: the six attachments' files"
fi
case "$verdict" in OK*) ;; *) fail by-hand ;; esac
row none release-by-hand.yaml "$ec" reference "$verdict"

# No policy: api and worker carry no monitoring, which their Component requires.
ec="$(build none release.yaml no-policy.yaml)"
got="$(missing "$WORK/none.log" | tr '\n' ' ')"
if [ "$ec" -eq 0 ]; then verdict="MISMATCH: completed"
elif [ "$got" != "$MISSING " ]; then verdict="MISMATCH: E0162 names [${got% }], expected [$MISSING]"
elif [ -d "$WORK/none/dist" ]; then verdict="MISMATCH: halted, but wrote dist/"
else verdict="OK: E0162 for api and worker"
fi
case "$verdict" in OK*) ;; *) fail none ;; esac
row none release.yaml "$ec" halt "$verdict"

# The policy, on each engine.
for engine in rego cel; do
  ec="$(build "$engine" release.yaml "governance-$engine.yaml" --ir-graph)"
  lock=""
  [ -f "$WORK/$engine/release.lock" ] && lock="$(cat "$WORK/$engine/release.lock")"
  injected=0
  while IFS= read -r line; do
    [ "$line" = "\"aggrega.ai/injected-by\": \"governance/$engine\"" ] && injected=$((injected + 1))
  done < <(trimmed "$WORK/$engine.log")
  if [ "$ec" -ne 0 ]; then
    verdict="MISMATCH: exited $ec"
  elif ! diff -r "$WORK/by-hand/dist" "$WORK/$engine/dist" > "$WORK/$engine.diff" 2>&1; then
    verdict="MISMATCH: the tree differs from the build by hand"
    cat "$WORK/$engine.diff" >> "$WORK/$engine.log"
  elif [[ "$lock" != *$'mutators:\n    - plugin: governance/'"$engine"$'\n      role: annotation-transform\n'* ]]; then
    verdict="MISMATCH: the lockfile records no annotation-transform attachment of governance/$engine"
  elif [[ "$lock" != *$'      referenced_from:\n        - governance/'"$engine"$':0.8.6\n'* ]]; then
    verdict="MISMATCH: the lockfile pins no plugin for governance/$engine:0.8.6"
  elif [ "$injected" -ne 3 ]; then
    verdict="MISMATCH: the graph records $injected component(s) as injected by governance/$engine, expected 3"
  else
    verdict="OK: byte-identical to the build by hand; pinned; injected"
  fi
  case "$verdict" in OK*) ;; *) fail "$engine" ;; esac
  row "$engine" release.yaml "$ec" pass "$verdict"
done

# The planted mistake: a string where the binding routes three subkeys.
ec="$(build string release.yaml governance-monitoring-as-string.yaml)"
unrefused=""
for component in $REFUSED; do
  want_head="$(refusal_head "$component")"
  after=""
  take=0
  while IFS= read -r line; do
    if [ "$take" -eq 1 ]; then after="$line"; break; fi
    [ "$line" = "$want_head" ] && take=1
  done < <(trimmed "$WORK/string.log")
  [ "$after" = "$(refusal_reason "$component")" ] || unrefused="$unrefused $component"
done
if [ "$ec" -eq 0 ]; then verdict="MISMATCH: completed"
elif [ -n "$unrefused" ]; then verdict="MISMATCH: no refusal with the expected head and reason for$unrefused"
elif [ -d "$WORK/string/dist" ]; then verdict="MISMATCH: halted, but wrote dist/"
else verdict="OK: refused, naming the plugin and its role"
fi
case "$verdict" in OK*) ;; *) fail string ;; esac
row string release.yaml "$ec" halt "$verdict"

# What the two annotation bindings rendered, as the Rego build wrote them.
printf '\nfiles the two annotation bindings rendered, release.yaml with governance-rego.yaml:\n'
for f in $ATTACHMENT_FILES; do
  [ -f "$WORK/rego/dist/$f" ] && printf '  %s\n' "$f"
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
