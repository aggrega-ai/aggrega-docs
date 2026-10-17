# Harbor stack — a container registry deployed as one release

This example compiles a real container registry to Kubernetes manifests from one
Developer-authored `Aggregate`.

A container registry is many cooperating services — an API and token-service
control plane, an OCI blob store and its controller, a web console, an
asynchronous worker tier, a vulnerability scanner, a relational backend, a
key-value cache, and a reverse proxy fronting them. **The catalog describes all
of that as one Component**, because the registry's own maintainers publish a Helm
chart that deploys the whole of it as a single release, in the order its services
need. The Component declares the registry; the Recipe wraps that chart.

The registry is imported as a **module**: a reusable sub-aggregate that composes
the Component and exports its published address. The top-level Aggregate imports
the module by name; the operator sizes the module's component in the Release.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: imports the container-registry module (`core/harbor`). |
| `manifest-helm-synth.yaml` | Maps the registry's component type to the Recipe that wraps its Helm chart, and the credential Feature to the realization that emits a Secret from the module's credential parameters — except the two attachments the Release makes, which it binds by name to the realization that reads a Secret already in the namespace. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Sizes the module's component by its module-scoped ID, and attaches the token-signing key and the services' shared secret to it by naming the Secrets that hold them; anything else is left to schema defaults. |

## What it demonstrates

- **A multi-service product as one Component.** What makes the registry one
  Component rather than several is not its size but where its wiring is
  maintained: the reverse-proxy routing, the token-service key the control plane
  checks every pull and push against, the connection settings each service reads
  for the backend and the cache, the logical-database split keeping the services'
  cache keyspaces apart, and the start-up ordering — all of it is kept in step
  with the product by the people who ship it, inside the chart. A consumer
  declares a registry and gets those in agreement.
- **A wrapped chart.** The Recipe names the chart in `source:` and overlays a
  `valuesMapping:` onto it — the values template is the whole implementation, and
  the Helm provider renders the chart's own templates against it. No workload is
  synthesized here.
- **A pinned external input.** The chart is an input the build fetches, so it is
  pinned like any dependency: the lockfile records the chart's version, its
  resolved URL, and the digest of the tarball, under `source_artifacts`. A build
  against a filled lockfile serves the chart from the content store and verifies
  it against that digest.
- **One published address for a whole platform.** The chart's reverse proxy
  routes the browser path `/` to the console and the registry and API paths
  (`/v2/`, `/api/`, `/service/`, `/c/`) to the control plane, so a container
  client logs in, pushes and pulls against the same host a browser reaches the
  console on. That Service is what `provides.host` publishes, and a consumer
  needs no second address to reach either path set.
- **Two public names for it.** The module exports that one address as `registry`,
  the endpoint image clients and the API talk to, and as `ui`, the web endpoint.
  Both resolve to the address that serves both path sets, so a consumer wires to
  whichever name describes its intent.
- **Operator sizing of a module's component.** The Release addresses the module's
  component by its module-scoped ID (`harbor.registry`) to set compute, without
  the developer's Aggregate restating physical sizing.
- **Completeness rules on a grouped value.** `infra.compute` carries a CPU and a
  memory key, and the Recipe halts on a group that names only one of them. A
  control plane rendered with a CPU limit and no memory limit is materially
  different from the one the Component's declared defaults describe, and nothing
  in the rendered output would say so — so the build stops and names the missing
  key instead.
- **Two credentials the Release supplies.** The key the token service signs the
  registry's tokens with, together with its certificate, and the secret the
  registry's own services authenticate to each other with have no default value,
  and neither does the request-forgery key the module fills below: a key every
  reader of the catalog held would let anyone mint tokens the registry trusts.
  The Component declares those slots required, so a build that leaves one empty
  halts and names the slot. The module attaches neither of the first two, so
  the Release attaches both to the module's component, `token_key` and
  `core_secret`, each through `core/referenced-secret` with `infra.origin`
  naming a Secret, and the Manifest binds those two attachments by name to
  `k8s-existing-secret`. The build reads neither value and renders neither: the
  control plane mounts the key from the Secret it names, and the services read
  the shared secret from theirs.
- **Credentials the module fills.** The administrator account's password, the
  cross-site request-forgery key, the worker tier's shared secret and the blob
  store's upload-state secret are credential slots on the Component too, and the
  module fills each from a parameter of its own (`admin_password`, `csrf_key`,
  `jobservice_secret`, `registry_http_secret`) through the
  `core/referenced-secret` credential Feature, so every workload reads them from
  a Secret by name. Because the module attaches that Feature, the Manifest maps
  it. This example leaves the four parameters at the module's development
  defaults and maps the Feature to `k8s-secret-from-parameter`, which emits a
  Secret carrying each value. For a Release carrying real traffic, the Aggregate
  declares parameters of its own and passes them down through
  `aggregates.harbor.parameters`, the Release fulfills them, and the Manifest
  maps the Feature to `k8s-existing-secret`, which reads each parameter as the
  name of a Secret that already exists in the namespace. The rest are written
  into the configuration the Release renders, so they are replaced by setting
  `infra` instead; unset, each takes a development value the Recipe states.
- **Deterministic output over a chart that would otherwise generate material.**
  Left to itself this chart mints its own secrets when none are supplied — the
  control plane's shared and token-signing secrets, the worker tier's and blob
  store's secrets, the request-forgery key, and the blob store's hashed password,
  which it re-hashes with a fresh salt on every render. Each one is supplied
  instead: the token-signing key and the shared secret always from the Secret the
  Release names, and the rest from the attached credential by name where a slot
  is filled and from a fixed development value where it is not, so two renders
  of identical input emit byte-identical bytes.
- **Reproducible images.** Every image the registry runs is pinned to an explicit
  tag. The product ships them all on one tag, so `infra.engine_version` selects
  every one at once; `infra.overrides.image` replaces a single service's pin, and
  `infra.overrides.image_prefix` moves them together for a Release pulling from a
  mirror.

## Build

The workspace catalog supplies the standard-library entities, so no explicit
catalog flag is needed. The Recipe fetches a chart, so resolve the dependencies
into the lockfile first:

```sh
aggrega pull --release release-helm-synth.yaml
aggrega build --release release-helm-synth.yaml
```

Rendered artifacts land under `dist/`.

Before applying them, create the two Secrets the Release names in the namespace
the registry is deployed to: `harbor-token-key`, holding an RSA private key under
the data key `tls.key` and a certificate over that key under `tls.crt`, and
`harbor-core-secret`, holding a 16-character secret under the data key `secret`.
For example:

```sh
openssl req -x509 -newkey rsa:4096 -nodes -days 3650 -subj "/CN=harbor-token-ca" \
  -keyout tls.key -out tls.crt
kubectl create secret tls harbor-token-key --key tls.key --cert tls.crt
kubectl create secret generic harbor-core-secret --from-literal=secret="$(openssl rand -hex 8)"
```

A registry whose control plane cannot find either Secret does not start.

## What the composed registry looks like

The build emits the resources the chart defines for this configuration:
Deployments for the reverse proxy, the console, the control plane, the worker
tier and the blob store; StatefulSets for the backend, the cache and the
scanner; persistent volume claims for the blob store and for the worker tier's
logs; the ConfigMaps and Secrets each service reads; and the Services fronting
them. Beside them the credential Feature emits four Secrets, one per credential
slot the module fills — `harbor.registry-admin-password`,
`harbor.registry-csrf-key`, `harbor.registry-jobservice-secret` and
`harbor.registry-registry-http-secret` — each carrying the module's development
default, and the services read those four credentials from them rather than
from the chart's own Secrets. No Secret is emitted for the token-signing key or
the shared secret: the control plane mounts the key from `harbor-token-key`,
and the services read the shared secret from `harbor-core-secret`, the two
Secrets the Release names.

Exactly one of those Services is the address consumers wire to —
`dist/app/helm/harbor.registry-service-default-harbor-zdregistry.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: harbor-zdregistry
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: 8080
  selector:
    release: harbor-zdregistry
    app: "harbor"
    component: nginx
```

Its selector names the reverse proxy, which is what gives the registry one
address. `port` follows `infra.port`; the proxy behind it listens on the port the
chart fixes and the Service forwards to it, so moving `infra.port` moves the
published address and not the listener.

## Naming: the knob that publishes an address is not the knob that names resources

This chart derives most of its resource names from a top-level name knob and then
**suffixes** them — the control plane's Service is `<instance>-core`, the
console's `<instance>-portal`, the blob store's `<instance>-registry`, and so on
for the worker tier, the scanner, the backend and the cache. Nothing is named by
the bare name.

The published Service is named by a **separate, exposure-scoped knob**, whose own
default is a fixed literal independent of the top-level name. A Recipe pinning
only the top-level knob would publish an address no Service answers to, and two
instances in one namespace would both emit a Service under that fixed literal and
collide. The Recipe therefore sets both knobs from the instance ID, which is why
the emitted Service above is named for the instance and why `provides.host` names
an address that exists.

This is worth reading closely when wrapping any platform chart: `provides.host`
has to name the Service the chart actually creates, and which knob decides that
is a property of the chart rather than a convention across charts.

## What this configuration does not include

The chart's Ingress is left switched off and the reverse proxy exposed as a
cluster-internal Service instead, because the Component publishes an in-cluster
address rather than an external hostname. A single external endpoint is assembled
at the ingress tier, routing to the address this module exports. Transport
security is off, because the chart's own certificate source generates a
certificate authority and a signed certificate at render time, which two renders
of identical input would not reproduce. The metrics exporter and the
Prometheus-operator monitor are off, because the Component describes neither —
the exporter's image is pinned with the rest all the same, so a Release turning
it on through `infra.overrides` does not pick up a floating tag.
