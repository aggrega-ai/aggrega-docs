#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Thin wrapper: builds a Release of this example via the shared helper at
# aggrega-docs/scripts/build-release.sh. One release per run.
#
# Usage: ./build-release.sh RELEASE [-- EXTRA aggrega build args]
#   RELEASE is a release*.yaml filename or its <P> token, and naming it is
#   required here because this example carries two: `chart`, which builds the
#   chart out of the git repository, and `negative`, which demonstrates a loud
#   guardrail and is expected to exit non-zero. The shared helper auto-discovers
#   the catalog source (here this workspace's own catalog/ plus the hub
#   registry named in .aggrega-config.yaml) and echoes the equivalent direct
#   aggrega build command. See that helper for the full discovery rules and
#   binary resolution.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$HERE/../../../scripts/build-release.sh" --example "$HERE" "$@"
