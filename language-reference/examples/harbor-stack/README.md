---
example:
  level: start
  products: [core/devtool/harbor]
  shows: [modules, parameters, credentials, external-sources]
---

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
the module by name and passes it three of the registry's keys; the operator sizes
the module's component in the Release.

## Files

| File | Role |
| --- | --- |
| `aggregate.yaml` | Developer intent: imports the container-registry module (`core/harbor`) and passes it three of the registry's keys from parameters of its own. |
| `manifest-helm-synth.yaml` | Maps the registry's component type to the Recipe that wraps its Helm chart, and the credential Feature to the realization that reads a Secret already in the namespace — except the administrator's password, which it binds by name to the realization that emits a Secret from the module's parameter. |
| `release-helm-synth.yaml` | Operator record for the Kubernetes target. Names the Secrets holding the three keys the Aggregate passes down, sizes the module's component by its module-scoped ID, and attaches the token-signing key, the services' shared secret and the key stored credentials are encrypted with to it by naming the Secrets that hold them; anything else is left to schema defaults. |

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
  memory key, and the Recipe halts on a group that leaves either of them empty. A
  control plane rendered with a CPU limit and no memory limit is materially
  different from the one the Component's declared defaults describe, and nothing
  in the rendered output would say so — so the build stops and names the missing
  key instead. A key the group leaves out takes the Component's default.
- **Six keys with no default.** The key the token service signs the registry's
  tokens with, together with its certificate; the three secrets the registry's
  own services authenticate to each other and sign upload state with; the
  request-forgery key; and the key the control plane encrypts stored
  credentials with have no default value: a key every reader of the catalog held
  would let anyone mint tokens the registry trusts or read what it stores. The
  Component declares those slots required, so a build that leaves one empty
  halts and names the slot. The build reads none of the six values and renders
  none of them: every workload reads each from a Secret it names.
- **Three keys the Release attaches.** The module attaches neither the
  token-signing key, nor the control plane's shared secret, nor the key stored
  credentials are encrypted with, so the Release attaches all three to the
  module's component, `token_key`, `core_secret` and `secret_key`, each through
  `core/referenced-secret` with `infra.origin` naming a Secret, and the
  Manifest binds the Feature to `k8s-existing-secret`. The control plane mounts
  the token-signing key and the encryption key from the Secrets they name, and
  the services read the shared secret from theirs.
- **Credentials the module fills.** The administrator account's password, the
  cross-site request-forgery key, the worker tier's shared secret and the blob
  store's upload-state secret are credential slots on the Component too, and the
  module fills each from a parameter of its own (`admin_password`, `csrf_key`,
  `jobservice_secret`, `registry_http_secret`) through the
  `core/referenced-secret` credential Feature, so every workload reads them from
  a Secret by name. Because the module attaches that Feature, the Manifest maps
  it. The three keys have no default in the module either, so the Aggregate
  declares parameters of its own and passes them down through
  `aggregates.harbor.parameters`, the Release fulfills them, and
  `k8s-existing-secret` reads each as the name of a Secret that already exists
  in the namespace; a Release that supplies no value halts the build, naming
  the parameter. This example leaves the administrator's password at the
  module's development default, and the Manifest binds that one attachment by
  name to `k8s-secret-from-parameter`, which emits a Secret carrying it. The
  remaining passwords are written into the configuration the Release renders,
  so they are replaced by setting `infra` instead; unset, each takes a
  development value the Recipe states.
- **Deterministic output over a chart that would otherwise generate material.**
  Left to itself this chart mints its own secrets when none are supplied — the
  control plane's shared and token-signing secrets, the worker tier's and blob
  store's secrets, the request-forgery key, and the blob store's hashed password,
  which it re-hashes with a fresh salt on every render. Each one is supplied
  instead: the six keys always from the Secrets the Release names, and the
  passwords from the attached credential by name where a slot is filled and
  from a fixed development value where it is not, so two renders of identical
  input emit byte-identical bytes.
- **Reproducible images.** Every image the registry runs is pinned to an explicit
  tag. The product ships them all on one tag, so `infra.engine_version` selects
  every one at once; `infra.overrides.image` replaces a single service's pin, and
  `infra.overrides.image_prefix` moves them together for a Release pulling from a
  mirror.

## Build

This workspace carries no `.aggrega-config.yaml`, so the standard-library
entities resolve from the hub registry, `hub.aggrega.ai`, and no catalog flag is
needed. The Recipe fetches a chart, so resolve the dependencies into the lockfile
first:

```sh
aggrega pull --release release-helm-synth.yaml
aggrega build --release release-helm-synth.yaml
```

Rendered artifacts land under `dist/`.

Before applying them, create the six Secrets the Release names in the namespace
the registry is deployed to: `harbor-token-key`, holding an RSA private key under
the data key `tls.key` and a certificate over that key under `tls.crt`;
`harbor-core-secret`, holding a 16-character secret under the data key `secret`;
`harbor-secret-key`, holding a 16-character key under `secretKey`;
`harbor-csrf-key`, holding a 32-character key under `CSRF_KEY`; and
`harbor-jobservice-secret` and `harbor-registry-http-secret`, holding a
16-character secret under `JOBSERVICE_SECRET` and `REGISTRY_HTTP_SECRET`. For
example:

```sh
openssl req -x509 -newkey rsa:4096 -nodes -days 3650 -subj "/CN=harbor-token-ca" \
  -keyout tls.key -out tls.crt
kubectl create secret tls harbor-token-key --key tls.key --cert tls.crt
kubectl create secret generic harbor-core-secret --from-literal=secret="$(openssl rand -hex 8)"
kubectl create secret generic harbor-secret-key --from-literal=secretKey="$(openssl rand -hex 8)"
kubectl create secret generic harbor-csrf-key --from-literal=CSRF_KEY="$(openssl rand -hex 16)"
kubectl create secret generic harbor-jobservice-secret --from-literal=JOBSERVICE_SECRET="$(openssl rand -hex 8)"
kubectl create secret generic harbor-registry-http-secret --from-literal=REGISTRY_HTTP_SECRET="$(openssl rand -hex 8)"
```

A registry whose services cannot find these Secrets does not start.

## What the composed registry looks like

The build emits the resources the chart defines for this configuration:
Deployments for the reverse proxy, the console, the control plane, the worker
tier and the blob store; StatefulSets for the backend, the cache and the
scanner; persistent volume claims for the blob store and for the worker tier's
logs; the ConfigMaps and Secrets each service reads; and the Services fronting
them. Beside them the credential Feature emits one Secret,
`harbor-zdregistry-admin-password`, carrying the module's development default
for the administrator's password, which the control plane reads from it rather
than from the chart's own Secret. No Secret is emitted for any of the six keys:
the control plane mounts the token-signing key from `harbor-token-key` and the
encryption key from `harbor-secret-key`, and the services read the others from
`harbor-core-secret`, `harbor-csrf-key`, `harbor-jobservice-secret` and
`harbor-registry-http-secret`, the Secrets the Release names.

Exactly one of those Services is the address consumers wire to —
`dist/app/helm/harbor.registry-service-default-harbor-zdregistry.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: harbor-zdregistry
  [… omitted: the namespace, the chart's labels, and the labels and annotations every rendered document carries]
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
of identical input would not reproduce. The Prometheus-operator monitor is off.

The registry's metrics are off too. The Component's `values.metrics_enabled`
turns them on for the control plane, the worker tier, the blob store and an
added exporter, and publishes the four Services for a scraper to discover; the
same chart setting also opens the blob store's debug listener — profiling,
execution traces and runtime variables, with no caller check — to every
in-cluster caller. The module leaves that value at its default of false, so this
example renders no metrics; an Aggregate that declares the Component itself can
set it. The exporter's image is pinned with the rest all the same.
