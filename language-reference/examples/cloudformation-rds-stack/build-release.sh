#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Thin wrapper: builds a Release of this example via the shared helper at
# aggrega-docs/scripts/build-release.sh. One release per run.
#
# Usage: ./build-release.sh [RELEASE] [-- EXTRA aggrega build args]
#   RELEASE is a release*.yaml filename or its <P> token; this example ships
#   three, so name one: one-stack, two-stacks, or negative-name-collision. The
#   shared helper auto-discovers the catalog source and echoes the equivalent
#   direct aggrega build command. See that helper for the full discovery rules
#   and binary resolution.
#
# release-negative-name-collision.yaml is expected to fail: it demonstrates a
# guardrail. The helper surfaces the aggrega exit code unchanged.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$HERE/../../../scripts/build-release.sh" --example "$HERE" "$@"
