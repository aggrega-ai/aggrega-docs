# Keycloak as the authorization server for `aggrega mcp` over HTTPS

This example compiles a **Keycloak identity server backed by PostgreSQL** to
Kubernetes manifests, and then configures it as the authorization server an
`aggrega mcp` listener verifies bearer tokens against. It is a complete test
bed for reaching the Aggrega server over HTTPS: a Kubernetes cluster you
control, a Keycloak realm that publishes the three scopes the server
recognises, and a listener on your own machine that checks every token.

It is written for a test on one machine. The addresses it uses are
`http://localhost:8080` for Keycloak and `https://localhost:8443/mcp` for the
Aggrega server, and both are reached through a port on your own machine.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: the identity server and its database, with every credential slot filled from one Secret you create. |
| `manifest.yaml` | Maps the two component types to their workload-synthesis helm Recipes, and every credential to `k8s-existing-secret`. |
| `release.yaml` | The Release every cluster shares: one boundary, sized for a single-user test. |
| `release-local.yaml.example` | Template for the Release you build, which extends `release.yaml` with what differs per cluster. |
| `realm/aggrega-realm.json` | The realm, stated as data: its scopes, the audience each scope adds to a token, and who may register a client. |
| `realm/apply-realm.sh` | Applies that file to a running Keycloak through its admin API. |
| `server/.aggrega-config.yaml.example` | Template for the listener's settings, read when `aggrega mcp` starts from `server/`. |

Two files are copied from their templates and kept out of version control,
because what they hold belongs to your machine: `release-local.yaml` and
`server/.aggrega-config.yaml`. So is everything the steps below generate —
rendered output, the lockfile, key material.

## What it demonstrates

- **Credentials attached by reference.** Every password the stack uses — the
  database's, and Keycloak's bootstrap administrator's — is read at run time
  from one Kubernetes Secret you create before deploying. The standard library's
  `k8s-existing-secret` FeatureRecipe implements `core/referenced-secret` by
  publishing that Secret's name and entry as the locator, and renders nothing,
  so no password appears in any authored file or in any rendered artifact.
- **A parameter reaching an attachment.** The Secret's name is a hoisted
  parameter, `credentials_secret`, which each attachment's `origin` reads. A
  Release can fulfil it; left alone, it takes its default.
- **Cluster-specific settings in a Release of their own.** `release.yaml`
  carries what is the same everywhere. `release-local.yaml` extends it and adds
  what is not — here, the storage class the database volume is provisioned from
  — so the file you edit for your cluster is never the one in version control.
- **A configuration layer for the listener.** Every `.aggrega-config.yaml`
  from the workspace root down to the directory a command runs in contributes,
  so `server/.aggrega-config.yaml` adds the listener's settings on top of the
  workspace's own file whenever the server is started from `server/`.
- **Runtime data applied at run time.** A realm lives in the running server,
  not in anything a build renders, so it is carried as a file and applied with
  one command once Keycloak is up.

The two components and the edge between them are the ones the
standard-library `core/keycloak` module composes. They are composed directly
here because a credential attachment needs `values` — which Secret, and which
entry in it — and neither place that could attach one to a module's component
can supply them: an Aggregate importing the module attaches nothing to the
components inside it, and a Release attaches Features without `values`.

## Before you start

You need a Kubernetes cluster and a namespace you may create resources in,
`kubectl` pointed at it, the `aggrega` CLI, and `curl`, `jq` and `openssl`.
The workspace reads the standard-library catalog from a checkout beside this
repository, as its `.aggrega-config.yaml` states; without that checkout it
resolves the same entities from the hub registry.

## 1. Create the Secret

The Secret must exist in the namespace before the workloads start, and must
carry the entries `db-password` and `admin-password`. Generate both rather than
choosing them:

```sh
kubectl create namespace <namespace>
kubectl -n <namespace> create secret generic keycloak-credentials \
  --from-literal=db-password="$(openssl rand -base64 32 | tr -d '/+=')" \
  --from-literal=admin-password="$(openssl rand -base64 32 | tr -d '/+=')"
```

Read the administrator password back when you need it:

```sh
kubectl -n <namespace> get secret keycloak-credentials \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

## 2. Build

Copy the Release template. It names the storage class the database volume is
provisioned from; remove that setting to take the cluster's default class, or
name another one your cluster offers (`kubectl get storageclass` lists them —
`local-path` on k3s, `standard` on kind and minikube):

```sh
cp release-local.yaml.example release-local.yaml
aggrega build --release release-local.yaml --auto-pull
```

Rendered artifacts land under `dist/identity/helm/`: a StatefulSet, a
ClusterIP Service and a headless Service for the database, and a Deployment
and a ClusterIP Service for Keycloak. The credentials arrive as references and
nothing else:

```yaml
# dist/identity/helm/server-deployment.yaml (container env)
[… omitted: the database connection and hostname settings]
            - name: KC_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: keycloak-credentials
                  key: db-password
            - name: KC_BOOTSTRAP_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: keycloak-credentials
                  key: admin-password
```

Building `release.yaml` itself also succeeds. It names no storage class, so the
database volume is provisioned from the cluster's default storage class.

## 3. Deploy and reach Keycloak

The helm target writes one file per Kubernetes resource and names no
namespace, so the namespace is given when the files are applied:

```sh
kubectl apply -n <namespace> -f dist/identity/helm/
kubectl -n <namespace> logs -f deployment/server     # wait for "Keycloak ... started"
kubectl -n <namespace> port-forward --address 127.0.0.1 svc/server-default 8080:8080
```

The synthesized Deployment declares no readiness probe, so a rollout reported
complete says only that the container started. Keycloak's own log line is the
signal that it is serving.

**Keep Keycloak at one address.** No hostname is configured on the server, so
Keycloak states its issuer from the address each request arrives at. The
browser that signs you in, the MCP client that obtains a token and the Aggrega
server that checks it all have to see the same issuer, and reaching Keycloak
through the port-forward at `http://localhost:8080` gives all three the same
one: `http://localhost:8080/realms/aggrega`.

## 4. Apply the realm

```sh
realm/apply-realm.sh --resource https://localhost:8443/mcp --namespace <namespace>
```

`--resource` is the address clients reach the Aggrega server at, which every
token must name as its audience. The step creates the realm `aggrega` and the
scopes `aggrega:read`, `aggrega:workspace-write` and `aggrega:registry-write`
as optional scopes every client may ask for. Each of the three adds the resource
address to the access token's audience. The audience travels with the scopes,
not with a realm default scope, because Keycloak gives a client that names its
scopes at registration only the scopes it named. It also lets an MCP client
register itself from this machine: a client registering without credentials is
accepted when the request comes from `localhost` and every address it asks to
be redirected to is on `localhost`. Running it again brings the realm back in
line with the file.

The realm has no users yet. Create one in the administration console at
`http://localhost:8080/admin/`, signing in as `admin` with the password from
step 1, or connect an identity provider there.

## 5. Start the Aggrega server

The listener serves HTTPS itself, so it needs a certificate for `localhost` and
a key. Any certificate your MCP client trusts will do; for a test, a local
certificate authority made with `openssl` is enough, as long as the client is
told to trust it.

```sh
cp server/.aggrega-config.yaml.example server/.aggrega-config.yaml
# set tls.cert_file and tls.key_file to your certificate and key
cd server && aggrega mcp
```

Started from `server/`, the process serves this workspace and reads the
listener settings from `server/.aggrega-config.yaml`; `aggrega config show
--origin`, run from the same directory, shows which file decided each setting.
The server publishes its protected-resource metadata at
`https://localhost:8443/.well-known/oauth-protected-resource/mcp`, answers
liveness and readiness on `127.0.0.1:8444`, and writes one line per request on
its error stream.

Point your MCP client at `https://localhost:8443/mcp` as
[Setup](../../../authoring/setup.md#a-server-reached-over-https) describes. The
client reads the metadata document, registers itself with Keycloak, sends you
to sign in, and asks for the scopes it needs.

## Signing in with Google

Keycloak can hand sign-in to Google. Create an OAuth client in the Google
Cloud console with the authorized redirect URI
`http://localhost:8080/realms/aggrega/broker/google/endpoint` — Google accepts
a plain-HTTP redirect only for `localhost`, which is one more reason to keep
Keycloak there. Then, in the administration console, open the `aggrega` realm,
choose **Identity providers → Google**, and enter the client ID and client
secret Google issued. To admit only accounts from one Google Workspace
organisation, set **Hosted domain** to that organisation's domain. The client
secret stays in Keycloak; nothing in this workspace holds it.

## On another cluster

What changes from one cluster to another is kept out of the committed files:

- the namespace, given to `kubectl` when the Secret is created and the files
  are applied;
- the storage class, in `release-local.yaml`;
- the Secret's name, if you choose another, in `release-local.yaml` as the
  `credentials_secret` parameter;
- the certificate, the key and the listen address, in
  `server/.aggrega-config.yaml`.

The rest holds on any cluster that can pull `postgres:16` and
`quay.io/keycloak/keycloak:26.7.0`. Keycloak is served over plain HTTP here,
which is acceptable only because it is reached on `localhost`; putting it
behind an address other machines reach calls for TLS in front of it and a
configured hostname, which the Recipe used here does not offer.
