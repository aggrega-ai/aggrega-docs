#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# A CI-layer rule over an Aggrega build's output directory: no rendered Secret
# ships credential material as a literal.
#
# It reads only the emitted artifacts, with yq. Nothing here is specific to any
# workspace — point it at an output directory and it walks whatever is there.
#
# Usage:  ./deny-inline-credential-material.sh <output-directory>
#
# Exit codes
#   0  no finding — the output satisfies the rule
#   1  finding — at least one Secret carries inline material
#   2  the rule could not be evaluated (bad usage, yq absent, unparseable file)
#
# The third code is deliberately distinct from the second: "the artifacts could
# not be read" must never be indistinguishable from "the artifacts passed".

set -uo pipefail

usage() {
  cat <<'EOF'
usage: deny-inline-credential-material.sh <output-directory>

Refuses any rendered document of kind Secret that declares data: or stringData:,
which is how credential material reaches an artifact as a literal. A credential
delivered by reference — an ExternalSecret naming an entry in a secret store, for
instance — carries no such block and is accepted.

A ConfigMap's data: block is not credential material, so the kind is part of the
rule rather than the key alone.

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

# yq READS; the shell DECIDES. One tab-separated row per document:
#   <kind>  <name>  <data keys>  <stringData keys>
READ_DOCUMENT='[(.kind // "-"),
                (.metadata.name // "-"),
                ((.data // {}) | keys | join(",")),
                ((.stringData // {}) | keys | join(","))] | @tsv'

# The predicate. A document is refused when its kind carries credential material
# by value and it declares any key under either block.
refuses() {   # refuses <kind> <data-keys> <stringdata-keys>
  [ "$1" = "Secret" ] || return 1
  [ -n "$2" ] || [ -n "$3" ]
}

documents=0
credential_documents=0
findings=0
unreadable=0

while IFS= read -r -d '' file; do
  rel=${file#"$DIR"/}
  if ! rows=$(yq -N -r "$READ_DOCUMENT" -- "$file" 2>/dev/null); then
    printf 'FAULT: cannot parse %s\n' "$rel" >&2
    unreadable=$((unreadable + 1))
    continue
  fi
  index=0
  while IFS=$'\t' read -r kind name data_keys string_keys; do
    [ -n "${kind:-}" ] || continue
    documents=$((documents + 1))
    index=$((index + 1))
    case "$kind" in
      Secret|ExternalSecret|SealedSecret)
        credential_documents=$((credential_documents + 1)) ;;
    esac
    if refuses "$kind" "${data_keys:-}" "${string_keys:-}"; then
      findings=$((findings + 1))
      printf 'REFUSED: %s (document %d): %s/%s carries inline material under %s\n' \
        "$rel" "$index" "$kind" "$name" "${data_keys:-}${string_keys:-}"
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
  printf 'REFUSED: %d finding(s) across %d document(s), %d of them credential-carrying\n' \
    "$findings" "$documents" "$credential_documents"
  exit 1
fi

printf 'OK: no inline credential material across %d document(s), %d of them credential-carrying\n' \
  "$documents" "$credential_documents"
exit 0
