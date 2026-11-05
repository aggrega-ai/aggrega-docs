#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Runs this example's import again, as its walkthrough page shows it, compares
# what it writes and prints with draft/, compares the blocks the page quotes
# with this example's files, and builds reviewed/, through the shared
# aggrega-docs/scripts/check-import-example.sh, whose header says what each
# step checks, which binary and catalogs it reads, and what --update does.
#
# Usage: ./check.sh [--update]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$HERE/../../../scripts/check-import-example.sh" --example "$HERE" \
  --page "$HERE/../../../authoring/import/dify.md" "$@" -- support-assistant.yml --target helm
