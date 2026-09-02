#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# A CI-layer rule over an Aggrega build's output directory: every container
# image a rendered workload declares carries a tag, and that tag is not
# `latest`.
#
# It reads only the emitted artifacts, with yq. Nothing here is specific to any
# workspace — point it at an output directory and it walks whatever is there.
#
# Usage:  ./require-pinned-image.sh <output-directory>
#
# Exit codes
#   0  no finding — every image is pinned
#   1  finding — at least one image is untagged or tagged `latest`
#   2  the rule could not be evaluated (bad usage, yq absent, unparseable file)
#
# The third code is deliberately distinct from the second: "the artifacts could
# not be read" must never be indistinguishable from "the artifacts passed".

set -uo pipefail

usage() {
  cat <<'EOF'
usage: require-pinned-image.sh <output-directory>

Refuses any container image reference with no tag, or with the tag `latest`.
Both are mutable: the bytes that run are whatever the registry serves at pull
time, which is not the deployment the artifacts describe. A digest reference
(name@sha256:...) is pinned by construction and is accepted.

Images are read from the pod-spec paths only, so a custom resource that happens
to declare a schema property named `image` is not judged as a workload.

exit 0  no finding      exit 1  finding      exit 2  could not evaluate
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  '') usage >&2; exit 2 ;;
esac

DIR=$1
[ -d "$DIR" ] || { printf 'FAULT: not a directory: %s\n' "$DIR" >&2; exit 2; }
command -v yq >/dev/null 2>&1 || { printf 'FAULT: yq is not on PATH\n' >&2; exit 2; }

# yq READS; the shell DECIDES.
#
# One row per document, so a run can say what it inspected:
COUNT_DOCUMENTS='[(.kind // "-")] | @tsv'

# One tab-separated row per container:
#   <kind>  <workload name>  <container name>  <image>
#
# The paths are explicit rather than a recursive search for any `image` key,
# because a CustomResourceDefinition's own schema carries such a key and is not
# a workload. Add a path here for a workload kind your targets emit.
# shellcheck disable=SC2016  # $kind and $workload are yq variables, not shell ones
READ_CONTAINERS='(.kind // "-") as $kind
                 | (.metadata.name // "-") as $workload
                 | [.spec.containers[]?,
                    .spec.initContainers[]?,
                    .spec.template.spec.containers[]?,
                    .spec.template.spec.initContainers[]?,
                    .spec.jobTemplate.spec.template.spec.containers[]?,
                    .spec.jobTemplate.spec.template.spec.initContainers[]?]
                 | .[]
                 | [$kind, $workload, (.name // "-"), (.image // "-")] | @tsv'

# The predicate. An image reference is pinned when a tag follows the final path
# segment and that tag is not `latest`.
refuses() {   # refuses <image>
  local image=$1 last tag
  case "$image" in
    -|'')       return 0 ;;   # a container declaring no image at all
    *@sha256:*) return 1 ;;   # digest-pinned
  esac
  last=${image##*/}
  case "$last" in
    *:*) tag=${last##*:} ;;
    *)   return 0 ;;          # no tag
  esac
  [ "$tag" = "latest" ]
}

documents=0
containers=0
findings=0
unreadable=0

while IFS= read -r -d '' file; do
  rel=${file#"$DIR"/}

  if ! docs=$(yq -N -r "$COUNT_DOCUMENTS" -- "$file" 2>/dev/null); then
    printf 'FAULT: cannot parse %s\n' "$rel" >&2
    unreadable=$((unreadable + 1))
    continue
  fi
  while IFS= read -r kind; do
    [ -n "${kind:-}" ] && documents=$((documents + 1))
  done <<EOF
$docs
EOF

  rows=$(yq -N -r "$READ_CONTAINERS" -- "$file" 2>/dev/null) || rows=''
  while IFS=$'\t' read -r kind workload container image; do
    [ -n "${container:-}" ] || continue
    containers=$((containers + 1))
    if refuses "${image:--}"; then
      findings=$((findings + 1))
      printf 'REFUSED: %s: %s/%s container %s runs unpinned image %s\n' \
        "$rel" "$kind" "$workload" "$container" "${image:--}"
    fi
  done <<EOF
$rows
EOF
done < <(find "$DIR" -type f \( -name '*.yaml' -o -name '*.yml' -o -name '*.json' \) -print0 | sort -z)

if [ "$unreadable" -gt 0 ]; then
  printf 'FAULT: %d file(s) unparseable; no verdict is claimed over them\n' "$unreadable" >&2
  exit 2
fi

if [ "$findings" -gt 0 ]; then
  printf 'REFUSED: %d finding(s) across %d container(s) in %d document(s)\n' \
    "$findings" "$containers" "$documents"
  exit 1
fi

printf 'OK: every image pinned across %d container(s) in %d document(s)\n' \
  "$containers" "$documents"
exit 0
