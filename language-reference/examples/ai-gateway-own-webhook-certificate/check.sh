#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Builds every Release of this example and checks each outcome against the one
# the README describes.
#
#   - The two passing Releases are each built twice, the second time with
#     --verify-determinism. Both builds must exit 0 and write the same files,
#     byte for byte. The tree must then hold what the certificate mode puts in
#     it, counted by the kind of every rendered document:
#       release-cert-manager.yaml     a Certificate and an Issuer, and no Secret;
#       release-own-certificate.yaml  no Certificate, no Issuer and no Secret,
#                                     with the controller Deployment's certs
#                                     volume naming the Secret the Release set.
#   - The two guardrail Releases must exit non-zero with exactly one halt, whose
#     short code and sentence are the ones written below for it:
#       release-negative-without-omits.yaml, built with --verify-determinism;
#       release-negative-stale-omits.yaml, which must also name the entry.
#
# Every build runs through ./build-release.sh, so the aggrega binary is the one
# that helper resolves — AGGREGA_BIN, when it is set. Each build passes
# --auto-pull, because lockfiles are not shipped, and --no-color, so the output
# is read as plain text.
#
# Usage: ./check.sh [-- EXTRA aggrega build args]
#   Everything after -- is passed to every build, after the arguments above.
#
# Prints one line per build and exits 1 if any outcome differs from its
# expectation, printing the output of each build that differed. Exits 2 before
# building anything if a dist/ directory is already here: each build writes
# dist/, and the script moves each tree away to compare it, so it starts from
# none and leaves none.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'check: %s\n' "$*" >&2; exit 2; }

declare -a EXTRA=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --) shift; EXTRA=("$@"); break ;;
    -h|--help)
      printf 'Usage: ./check.sh [-- EXTRA aggrega build args]\n'
      printf '  Builds the four Releases and checks each outcome: a passing Release twice,\n'
      printf '  byte-identical, with the documents its certificate mode renders; a guardrail\n'
      printf '  Release halting once, with the expected code and sentence. Exits 1 on any\n'
      printf '  mismatch. The binary is the one ./build-release.sh resolves (AGGREGA_BIN when set).\n'
      exit 0 ;;
    *) die "unknown argument: $1 (pass aggrega build arguments after --)" ;;
  esac
done

# The Secret release-own-certificate.yaml names in infra.webhook_tls_secret.
OWN_SECRET="ai-gateway-webhook-tls"

# What each guardrail Release halts with: its short code, and the sentence that
# code is registered with.
halt_code() {
  case "$1" in
    negative-without-omits) printf 'E0058' ;;
    negative-stale-omits) printf 'E0334' ;;
  esac
}
halt_sentence() {
  case "$1" in
    negative-without-omits) printf '%s' 'provider render is not deterministic' ;;
    negative-stale-omits) printf '%s' 'an omits entry left out nothing the source rendered' ;;
  esac
}
# Text the halt must also carry: the stale entry, named by its Recipe and its
# position in that Recipe's omits list.
halt_names() {
  case "$1" in
    negative-stale-omits) printf '%s' '"envoy-ai-gateway-operator-stale-omits" omits[0]' ;;
  esac
}
# Extra build arguments a guardrail Release is built with.
halt_args() {
  case "$1" in
    negative-without-omits) printf '%s' '--verify-determinism' ;;
  esac
}

[ -e "$HERE/dist" ] && die "$HERE/dist exists; remove it first — the builds write dist/ and this script compares each tree it gets"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK" "$HERE/dist"' EXIT

# build <label> <release> [build args...]: one build, its output to
# $WORK/<label>.log and its tree to $WORK/<label>.dist; prints its exit status.
build() {
  local label="$1" rel="$2" status=0
  shift 2
  "$HERE/build-release.sh" "$rel" -- "$@" --auto-pull --no-color ${EXTRA[@]+"${EXTRA[@]}"} \
    > "$WORK/$label.log" 2>&1 || status=$?
  if [ -d "$HERE/dist" ]; then mv "$HERE/dist" "$WORK/$label.dist"; fi
  printf '%s' "$status"
}

# kinds <tree>: the kind of every document written under the tree, one per
# line — each top-level "kind:" line of each file.
kinds() {
  local f line
  while IFS= read -r f; do
    while IFS= read -r line; do
      case "$line" in
        'kind: '*) printf '%s\n' "${line#kind: }" ;;
      esac
    done < "$f"
  done < <(find "$1" -type f -name '*.yaml' | LC_ALL=C sort)
}

# count <tree> <kind>: how many documents of that kind the tree holds.
count() {
  local k n=0
  while IFS= read -r k; do
    if [ "$k" = "$2" ]; then n=$((n + 1)); fi
  done < <(kinds "$1")
  printf '%s' "$n"
}

# certs_secret <tree>: the secretName of the volume named certs in the tree's
# Deployment documents.
certs_secret() {
  local f line trimmed isdeploy invol incerts
  while IFS= read -r f; do
    isdeploy=0
    while IFS= read -r line; do
      if [ "$line" = "kind: Deployment" ]; then isdeploy=1; fi
    done < "$f"
    [ "$isdeploy" -eq 1 ] || continue
    invol=0; incerts=0
    while IFS= read -r line; do
      trimmed="${line#"${line%%[![:space:]]*}"}"
      case "$trimmed" in
        'volumes:') invol=1 ;;
        '- name: certs') if [ "$invol" -eq 1 ]; then incerts=1; fi ;;
        '- name: '*) incerts=0 ;;
        'secretName: '*) if [ "$incerts" -eq 1 ]; then printf '%s\n' "${trimmed#secretName: }"; incerts=0; fi ;;
      esac
    done < "$f"
  done < <(find "$1" -type f -name '*.yaml' | LC_ALL=C sort)
}

# halts <log>: the head of every coded halt in the log, one per line, as
# "<code>" — read from a line of the form "[<CATEGORY> <code>] <subject>".
halts() {
  local line head
  while IFS= read -r line; do
    case "$line" in
      '['*' E'[0-9][0-9][0-9][0-9]'] '*|'['*' E'[0-9][0-9][0-9][0-9]']')
        head="${line%%]*}"
        printf '%s\n' "${head##* }" ;;
    esac
  done < "$1"
}

# halt_block <log>: the lines from the first coded halt to the end of the log.
halt_block() {
  local line take=0
  while IFS= read -r line; do
    case "$line" in
      '['*' E'[0-9][0-9][0-9][0-9]']'*) take=1 ;;
    esac
    if [ "$take" -eq 1 ]; then printf '%s\n' "$line"; fi
  done < "$1"
}

row() { printf '%-36s %-6s %-9s %s\n' "$@"; }

rc=0
FAILED=""
row RELEASE EXIT EXPECTED VERDICT
printf '%.0s-' {1..96}; printf '\n'

# The two passing Releases.
for rel in cert-manager own-certificate; do
  first="$rel-1"; second="$rel-2"
  ec1="$(build "$first" "$rel")"
  ec2="$(build "$second" "$rel" --verify-determinism)"
  verdict=""
  if [ "$ec1" -ne 0 ] || [ ! -d "$WORK/$first.dist" ]; then
    verdict="MISMATCH: the first build exited $ec1"; FAILED="$FAILED $first"
  elif [ "$ec2" -ne 0 ] || [ ! -d "$WORK/$second.dist" ]; then
    verdict="MISMATCH: the build with --verify-determinism exited $ec2"; FAILED="$FAILED $second"
  elif ! diff -r "$WORK/$first.dist" "$WORK/$second.dist" > "$WORK/$second.diff" 2>&1; then
    verdict="MISMATCH: the two builds wrote different files"
    cat "$WORK/$second.diff" >> "$WORK/$second.log"; FAILED="$FAILED $second"
  else
    certs="$(count "$WORK/$first.dist" Certificate)"
    issuers="$(count "$WORK/$first.dist" Issuer)"
    secrets="$(count "$WORK/$first.dist" Secret)"
    census="Certificate=$certs Issuer=$issuers Secret=$secrets"
    case "$rel" in
      cert-manager)
        if [ "$certs" -ge 1 ] && [ "$issuers" -ge 1 ] && [ "$secrets" -eq 0 ]; then
          verdict="OK: byte-identical twice; $census"
        else
          verdict="MISMATCH: $census; expected a Certificate, an Issuer and no Secret"
        fi ;;
      own-certificate)
        mounted="$(certs_secret "$WORK/$first.dist")"
        if [ "$certs" -ne 0 ] || [ "$issuers" -ne 0 ] || [ "$secrets" -ne 0 ]; then
          verdict="MISMATCH: $census; expected none of the three"
        elif [ "$mounted" != "$OWN_SECRET" ]; then
          verdict="MISMATCH: the certs volume names \"$mounted\"; expected \"$OWN_SECRET\""
        else
          verdict="OK: byte-identical twice; $census; certs volume: $mounted"
        fi ;;
    esac
    case "$verdict" in OK*) ;; *) FAILED="$FAILED $first" ;; esac
  fi
  case "$verdict" in OK*) ;; *) rc=1 ;; esac
  row "release-$rel.yaml" "$ec1/$ec2" pass "$verdict"
done

# The two guardrail Releases.
for rel in negative-without-omits negative-stale-omits; do
  label="$rel"
  args="$(halt_args "$rel")"
  # shellcheck disable=SC2086 # the extra arguments are one flag or none
  ec="$(build "$label" "$rel" $args)"
  want_code="$(halt_code "$rel")"
  want_sentence="$(halt_sentence "$rel")"
  want_names="$(halt_names "$rel")"
  codes=""
  n=0
  while IFS= read -r c; do
    n=$((n + 1)); codes="${codes:+$codes }$c"
  done < <(halts "$WORK/$label.log")
  block="$(halt_block "$WORK/$label.log")"
  if [ "$ec" -eq 0 ]; then
    verdict="MISMATCH: completed"
  elif [ "$n" -ne 1 ]; then
    verdict="MISMATCH: exited $ec with ${n} coded halt(s) [${codes}]; expected one, $want_code"
  elif [ "$codes" != "$want_code" ]; then
    verdict="MISMATCH: halted $codes; expected $want_code"
  else
    case "$block" in
      *"$want_sentence"*)
        if [ -n "$want_names" ]; then
          case "$block" in
            *"$want_names"*) verdict="OK: $want_code, the expected sentence, naming $want_names" ;;
            *) verdict="MISMATCH: $want_code does not name $want_names" ;;
          esac
        else
          verdict="OK: $want_code, the expected sentence"
        fi ;;
      *) verdict="MISMATCH: $want_code without the sentence \"$want_sentence\"" ;;
    esac
  fi
  case "$verdict" in OK*) ;; *) rc=1; FAILED="$FAILED $label" ;; esac
  row "release-$rel.yaml" "$ec" halt "$verdict"
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
