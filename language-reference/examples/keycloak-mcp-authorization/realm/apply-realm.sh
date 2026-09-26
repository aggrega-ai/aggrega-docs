#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Configure the `aggrega` realm in a running Keycloak from aggrega-realm.json.
#
# The realm is runtime data held by the running server, so it is applied here
# through Keycloak's admin API rather than rendered at build time. Running this
# again brings an existing realm back in line with the file: missing scopes are
# created, the audience mapper is rewritten for the resource address you pass,
# and the default scope assignments and registration policies are re-applied.
#
# Usage:
#   realm/apply-realm.sh --resource https://localhost:8443/mcp --namespace <ns>
#
#   --resource   the address MCP clients reach the Aggrega server at, exactly as
#                mcp.authorization.resource states it. Required.
#   --namespace  the namespace holding the credentials Secret, read for the
#                bootstrap admin password. Not needed when KEYCLOAK_ADMIN_PASSWORD
#                is set in the environment.
#   --secret     the credentials Secret's name (default keycloak-credentials).
#   --keycloak   where Keycloak answers (default http://localhost:8080).
#
# Needs curl, jq, and kubectl when the password is read from the Secret. The
# admin password is passed to curl on standard input and never printed.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REALM_FILE="$HERE/aggrega-realm.json"
KC=http://localhost:8080
RESOURCE=""
NAMESPACE=""
SECRET=keycloak-credentials

while [ $# -gt 0 ]; do
  case "$1" in
    --resource) RESOURCE="$2"; shift 2 ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --secret) SECRET="$2"; shift 2 ;;
    --keycloak) KC="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$RESOURCE" ] || { echo "--resource is required: the address clients reach the Aggrega server at" >&2; exit 2; }

if [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
  ADMIN_PW="$KEYCLOAK_ADMIN_PASSWORD"
else
  [ -n "$NAMESPACE" ] || { echo "--namespace is required unless KEYCLOAK_ADMIN_PASSWORD is set" >&2; exit 2; }
  ADMIN_PW=$(kubectl -n "$NAMESPACE" get secret "$SECRET" -o jsonpath='{.data.admin-password}' | base64 -d) || exit 3
fi

SPEC=$(jq --arg r "$RESOURCE" 'walk(if . == "__AGGREGA_RESOURCE__" then $r else . end)' "$REALM_FILE") || exit 3
REALM=$(printf '%s' "$SPEC" | jq -r '.realm.realm')

TOKEN=$(printf '%s' "$ADMIN_PW" | curl -sSf "$KC/realms/master/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli -d username=admin --data-urlencode "password@-" | jq -r .access_token) || {
  echo "could not sign in to $KC as the bootstrap admin" >&2; exit 4; }
unset ADMIN_PW

api() { # api METHOD PATH [JSON]
  if [ $# -ge 3 ]; then
    curl -sS -o /dev/null -w '%{http_code}' -X "$1" "$KC/admin/realms$2" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data "$3"
  else
    curl -sS -o /dev/null -w '%{http_code}' -X "$1" "$KC/admin/realms$2" -H "Authorization: Bearer $TOKEN"
  fi
}
get() { curl -sSf "$KC/admin/realms$1" -H "Authorization: Bearer $TOKEN"; }
expect() { # expect LABEL CODE ACCEPTED...
  local label="$1" code="$2"; shift 2
  for ok in "$@"; do [ "$code" = "$ok" ] && { echo "  $label: $code"; return 0; }; done
  echo "  $label: unexpected HTTP $code" >&2; exit 5
}

echo "realm $REALM at $KC, resource $RESOURCE"

if [ "$(api GET "/$REALM")" = 200 ]; then
  echo "  realm: exists"
else
  expect "realm created" "$(api POST "" "$(printf '%s' "$SPEC" | jq -c .realm)")" 201
fi

scope_id() { get "/$REALM/client-scopes" | jq -r --arg n "$1" '.[] | select(.name == $n) | .id'; }

N=$(printf '%s' "$SPEC" | jq '.clientScopes | length')
for i in $(seq 0 $((N - 1))); do
  S=$(printf '%s' "$SPEC" | jq -c ".clientScopes[$i]")
  NAME=$(printf '%s' "$S" | jq -r .name)
  ID=$(scope_id "$NAME")
  if [ -z "$ID" ]; then
    expect "scope $NAME created" "$(api POST "/$REALM/client-scopes" "$S")" 201
  else
    # Bring the scope's own settings back in line, then replace its mappers so
    # a changed resource address reaches the audience mapper.
    expect "scope $NAME updated" "$(api PUT "/$REALM/client-scopes/$ID" "$(printf '%s' "$S" | jq -c --arg id "$ID" 'del(.protocolMappers) + {id: $id}')")" 204
    for MID in $(get "/$REALM/client-scopes/$ID/protocol-mappers/models" | jq -r '.[].id'); do
      expect "  mapper removed" "$(api DELETE "/$REALM/client-scopes/$ID/protocol-mappers/models/$MID")" 204
    done
    M=$(printf '%s' "$S" | jq '.protocolMappers // [] | length')
    for j in $(seq 0 $((M - 1))); do
      expect "  mapper added" "$(api POST "/$REALM/client-scopes/$ID/protocol-mappers/models" "$(printf '%s' "$S" | jq -c ".protocolMappers[$j]")")" 201
    done
  fi
done

# A scope already assigned is answered 409, which is the state being asked for.
for NAME in $(printf '%s' "$SPEC" | jq -r '.defaultClientScopes[]'); do
  expect "default scope $NAME" "$(api PUT "/$REALM/default-default-client-scopes/$(scope_id "$NAME")")" 204 409
done
for NAME in $(printf '%s' "$SPEC" | jq -r '.optionalClientScopes[]'); do
  expect "optional scope $NAME" "$(api PUT "/$REALM/default-optional-client-scopes/$(scope_id "$NAME")")" 204 409
done

# Anonymous client registration is how an MCP client registers itself. Two of
# the policies Keycloak creates for it are adjusted: which hosts may register
# and be redirected to, and which scopes a registered client may ask for.
POLICIES=$(get "/$REALM/components?type=org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy")
set_policy() { # set_policy PROVIDER CONFIG_JSON
  local c
  c=$(printf '%s' "$POLICIES" | jq -c --arg p "$1" '[.[] | select(.subType == "anonymous" and .providerId == $p)][0]')
  [ "$c" != "null" ] || { echo "  no anonymous $1 policy found in the realm" >&2; exit 6; }
  expect "registration policy $1" "$(api PUT "/$REALM/components/$(printf '%s' "$c" | jq -r .id)" \
    "$(printf '%s' "$c" | jq -c --argjson cfg "$2" '.config = (.config + $cfg)')")" 204
}
set_policy trusted-hosts "$(printf '%s' "$SPEC" | jq -c '{
  "trusted-hosts": .anonymousClientRegistration.trustedHosts,
  "host-sending-registration-request-must-match": ["true"],
  "client-uris-must-match": ["true"]}')"
set_policy allowed-client-templates "$(printf '%s' "$SPEC" | jq -c '{
  "allowed-client-scopes": .anonymousClientRegistration.allowedClientScopes,
  "allow-default-scopes": ["true"]}')"

echo "done: issuer $KC/realms/$REALM"
