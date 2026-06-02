#!/usr/bin/env bash
#
# Offline label-value lint for the rendered Kubernetes manifests.
#
# Kubernetes label VALUES may not contain ':' or '/', so URI-valued provenance
# (the recipe-uri the compiler stamps on every rendered object) must be an
# annotation, not a label — otherwise `kubectl apply` rejects the manifest. This
# lint walks the rendered K8s output and fails if any label value breaks the
# rule, and confirms recipe-uri is present as an annotation. It reads only the
# generated files; it never contacts a cluster.
#
# Usage: ./lint-dist-labels.sh [dist-dir]   (default: dist)
set -euo pipefail

dist="${1:-dist}"
status=0
saw_recipe_uri_annotation=0

while IFS= read -r -d '' f; do
  # Flag any label value containing ':' or '/'. The awk tracks `labels:` blocks
  # by indentation, so a value under labels: is checked while annotations: and
  # other blocks are left alone.
  if ! awk -v file="$f" '
    function indent(s,   i){ i = match(s, /[^ ]/); return (i ? i - 1 : length(s)) }
    /^[[:space:]]*labels:[[:space:]]*$/ { inlabels = 1; lind = indent($0); next }
    {
      if (inlabels) {
        if ($0 ~ /^[[:space:]]*$/) next
        if (indent($0) <= lind) { inlabels = 0 }
        else {
          line = $0; sub(/^[[:space:]]+/, "", line)
          key = line; sub(/:.*/, "", key)
          val = line; sub(/^[^:]*:[[:space:]]*/, "", val)
          gsub(/^["'"'"']|["'"'"']$/, "", val)
          if (val ~ /[:\/]/) {
            printf "  %s: label %s has value \"%s\" containing : or /\n", file, key, val
            bad = 1
          }
        }
      }
    }
    END { exit (bad ? 1 : 0) }
  ' "$f"; then
    status=1
  fi
  if grep -q 'aggrega.ai/recipe-uri:' "$f"; then
    saw_recipe_uri_annotation=1
  fi
done < <(find "$dist" -type f \( -name '*.yaml' -o -name '*.yml' \) -path '*/helm/*' -print0)

if [ "$saw_recipe_uri_annotation" -eq 0 ]; then
  echo "label-value lint: FAIL (no recipe-uri provenance found in rendered manifests)"
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "label-value lint: OK (no label value contains : or / ; recipe-uri present)"
fi
exit "$status"
