#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds every step of this example and checks each outcome against the one the
# README describes. Each step is a workspace of its own, in the directories 1/
# to 4/, and each build must complete and write:
#
#   1/  a Compose file running the quickstart agent, pinned by digest, against
#       the Ollama model llama3.2:1b, with its conversations in Valkey, and no
#       gateway;
#   2/  the same agent reaching its model through the LiteLLM gateway, which
#       publishes cloud, takes the OpenAI key from ${OPENAI_API_KEY} and falls
#       back from cloud to local, with no guardrail yet;
#   3/  the same, plus the two Presidio services, the gateway's log masking
#       and its pattern guard with two rules;
#   4/  Kubernetes manifests: the agent running the same pinned image, and the
#       gateway reading the OpenAI key from the Secret openai-api-key, with its
#       fallback chain and pattern guard in its configuration.
#
# 4/ reads the pipeline step plugin that writes the gateway's configuration on
# Kubernetes from the hub registry, so its build needs to reach the hub.
#
# Every build runs through the shared build-release.sh helper, so the aggrega
# binary is the one that helper resolves — AGGREGA_BIN, when it is set. Each
# build passes --auto-pull, because lockfiles are not shipped, and --no-color,
# so the output is read as plain text.
#
# Usage: ./check.sh [-- EXTRA aggrega build args]
#   Everything after -- is passed to every build, after the arguments above.
#
# Prints one line per step and exits 1 if any outcome differs from its
# expectation, printing the output of each build that differed. Exits 2 before
# building anything if a step already holds a dist/ directory: each build
# writes dist/, and the script moves each tree away to read it, so it starts
# from none and leaves none.
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
      printf '  Builds the four steps, 1/ to 4/, and checks that each completes and writes\n'
      printf '  what the README describes for it. Exits 1 on any mismatch. The binary is the\n'
      printf '  one the shared build-release.sh helper resolves (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

STEPS="1 2 3 4"
AGENT='hub.aggrega.ai/tools/quickstart-agent:1.0.0@sha256:99816fe5ab1015d2576bd7bffe5a51ca07fec41fe650bda17c5555143367acab'

[ -x "$HELPER" ] || die "no build helper at $HELPER"
for n in $STEPS; do
  [ -e "$HERE/$n/dist" ] && die "$HERE/$n/dist exists; remove it first — the builds write dist/ and this script reads each tree it gets"
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; for n in $STEPS; do rm -rf "$HERE/$n/dist"; done' EXIT

# build <step>: one build, its output to $WORK/<step>.log and its tree to
# $WORK/<step>.dist; prints its exit status.
build() {
  local status=0
  "$HELPER" --example "$HERE/$1" -- --auto-pull --no-color ${EXTRA[@]+"${EXTRA[@]}"} \
    > "$WORK/$1.log" 2>&1 || status=$?
  if [ -d "$HERE/$1/dist" ]; then mv "$HERE/$1/dist" "$WORK/$1.dist"; fi
  printf '%s' "$status"
}

# summary <step>: the step's one-line summary, the first line of its
# aggregate.yaml without the comment mark.
summary() { local line; IFS= read -r line < "$HERE/$1/aggregate.yaml"; printf '%s' "${line#\# }"; }

# problem <text>: records why a completed build does not match what the README
# describes. The first one recorded is the one reported.
PROBLEM=""
problem() { [ -n "$PROBLEM" ] || PROBLEM="$1"; }
want() { case "$1" in *"$2"*) ;; *) problem "$3" ;; esac; }
refuse() { case "$1" in *"$2"*) problem "$3" ;; *) ;; esac; }

# read_file <dir> <file>: records a problem when dir/file is missing, and sets
# text to the file's content, or to nothing when it is missing.
read_file() {
  text=""
  if [ -f "$1/$2" ]; then text="$(cat "$1/$2")"; else problem "wrote no $2"; fi
}

# compose_base <text>: what the three Compose steps share.
compose_base() {
  want "$1" "image: $AGENT" "the agent does not run the pinned quickstart agent"
  want "$1" $'      LANGGRAPH_CHECKPOINTER_HOST: memory\n      LANGGRAPH_CHECKPOINTER_PORT: "6379"' "the agent does not keep its conversations in the Valkey store memory"
  want "$1" "ollama pull 'llama3.2:1b'" "the model service does not pull llama3.2:1b"
  want "$1" $'\n  memory:\n    image: valkey/valkey:' "the Compose file runs no Valkey store"
}

# gateway_base <text>: what 2/ and 3/ share — the agent behind the gateway.
gateway_base() {
  want "$1" $'      OPENAI_BASE_URL: http://gateway:4000/v1\n      OPENAI_MODEL: cloud' "the agent does not reach the model cloud through the gateway"
  want "$1" 'LITELLM_MODEL_CLOUD_API_KEY: ${OPENAI_API_KEY}' "the gateway does not take the OpenAI key from \${OPENAI_API_KEY}"
  want "$1" 'fallbacks: [{"cloud":["local"]}]' "the gateway does not fall back from cloud to local"
}

# inspect <step> <dir>: checks the tree a completed build wrote.
inspect() {
  local d="$2" text
  case "$1" in
    1)
      read_file "$d" compose/docker-compose.yaml
      compose_base "$text"
      want "$text" $'      OPENAI_BASE_URL: http://llm:11434/v1\n      OPENAI_MODEL: llama3.2:1b' "the agent does not reach llama3.2:1b on the model service"
      refuse "$text" $'\n  gateway:\n' "the Compose file runs a gateway"
      ;;
    2)
      read_file "$d" compose/docker-compose.yaml
      compose_base "$text"
      gateway_base "$text"
      refuse "$text" 'gateway-prompt-guard' "the gateway carries a pattern guard"
      refuse "$text" $'\n  analyzer:\n' "the Compose file runs a Presidio analyzer"
      ;;
    3)
      read_file "$d" compose/docker-compose.yaml
      compose_base "$text"
      gateway_base "$text"
      want "$text" $'      PRESIDIO_ANALYZER_API_BASE: http://analyzer:3000\n      PRESIDIO_ANONYMIZER_API_BASE: http://anonymizer:3000' "the gateway does not reach the two Presidio services"
      want "$text" 'guardrail_name: "gateway.log-masking"' "the gateway does not mask its logs"
      want "$text" 'guardrail_name: "gateway-prompt-guard"' "the gateway carries no pattern guard"
      want "$text" 'name: deny_pattern_2' "the pattern guard does not carry two rules"
      ;;
    4)
      read_file "$d" helm/agent-deployment.yaml
      want "$text" "image: $AGENT" "the agent does not run the pinned quickstart agent"
      want "$text" $'            - name: OPENAI_BASE_URL\n              value: http://gateway-default:4000/v1' "the agent does not reach the gateway"
      read_file "$d" helm/gateway-deployment.yaml
      want "$text" $'            - name: LITELLM_MODEL_CLOUD_API_KEY\n              valueFrom:\n                secretKeyRef:\n                  name: openai-api-key\n                  key: api-key' "the gateway does not read the OpenAI key from the Secret openai-api-key"
      read_file "$d" helm/gateway/litellm-gateway-config/configmap.yaml
      want "$text" 'gateway.log-masking' "the gateway does not mask its logs"
      want "$text" 'gateway-prompt-guard' "the gateway carries no pattern guard"
      want "$text" 'deny_pattern_2' "the pattern guard does not carry two rules"
      want "$text" 'max_fallbacks' "the gateway carries no fallback chain"
      ;;
  esac
}

row() { printf '%-70s %-5s %s\n' "$@"; }

rc=0
FAILED=""
row STEP EXIT VERDICT
printf '%.0s-' {1..120}; printf '\n'

for n in $STEPS; do
  ec="$(build "$n")"
  PROBLEM=""
  if [ "$ec" -ne 0 ]; then
    verdict="MISMATCH: exited $ec"
  elif [ ! -d "$WORK/$n.dist" ]; then
    verdict="MISMATCH: completed, but wrote no dist/"
  else
    inspect "$n" "$WORK/$n.dist"
    if [ -n "$PROBLEM" ]; then verdict="MISMATCH: $PROBLEM"; else verdict="OK: completed, what the README describes"; fi
  fi
  case "$verdict" in OK*) ;; *) rc=1; FAILED="$FAILED $n" ;; esac
  row "$n/ $(summary "$n")" "$ec" "$verdict"
done

printf '\n'
if [ "$rc" -ne 0 ]; then
  count=0
  for n in $FAILED; do
    count=$((count + 1))
    printf '=== output of %s/\n' "$n"
    cat "$WORK/$n.log"
    printf '\n'
  done
  printf 'check: %d step(s) did not build as expected.\n' "$count"
else
  printf 'check: every step built as expected.\n'
fi
exit "$rc"
