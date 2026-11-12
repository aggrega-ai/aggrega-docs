# Data Model

This page explains one idea, who writes which data about a component, and is not a runnable workspace.
[One contract, three realizations](postgres-three-realizations/README.md) shows it in a workspace you build; write it
into a folder of your own with:

```sh
aggrega scaffold --example postgres-three-realizations
```

It then prints the commands to run next:

```sh
cd postgres-three-realizations
aggrega build --release release-selfhosted.yaml --auto-pull
aggrega build --release release-managed.yaml --auto-pull
aggrega build --release release-managed-dns.yaml --auto-pull
aggrega build --release release-external.yaml --auto-pull
```

## `values` and `infra`: two namespaces, two authors

A Component declares two separate sets of settings. Its `values` are the developer's, written in the Aggregate: what
the application needs, the same in every environment. Its `infra` are the operator's, written in the Release: sizing
and placement, which differ from one environment to the next. The schemas keep the two apart — the Aggregate schema
has no `infra` on a component and the Release schema has no `values` — so neither author can set the other's
fields. A Recipe receives both, as two separate objects, `.values` and `.infra`.

In the example, the developer names the database and its login role, from `aggregate.yaml`:

```yaml
spec:
  components:
    db:
      type: core/datastore/postgres
      values:
        database: appdb
        user: appuser
```

and the Release that builds a managed instance sizes it, from `release-managed.yaml` with its comments left out:

```yaml
spec:
  boundaries:
    stack:
      directory: stack
      components:
        db:
          infra:
            engine_version: "16"
            storage:
              size: 100Gi
              type: gp3
            ha:
              enabled: true
              read_replicas: 0
```

The other two Releases of the example build the same Aggregate in a cluster and against a server that already
exists, each with its own `infra`; the Aggregate does not change.

A value that should still vary by environment is hoisted: the Aggregate declares a parameter, writes it into the
value, and each Release fulfils the parameter (see [The files of a build](01-getting-started.md)).

## One Release built on another

A Release can name another Release as its base with `extends:` and change only what differs. The child inherits the
base's boundaries, its placement and its parameters, and declaring `aggregate:` beside `extends:` is refused by the
Release schema, because the child must build the same Aggregate as its base. It may name a Manifest of its own, or
leave `manifest:` out and inherit the base's.

```yaml
# release-prod.yaml: the base gives every other setting
spec:
  extends: ./release-base.yaml
  boundaries:
    stack:
      components:
        db:
          infra:
            storage:
              size: 500Gi
```

A boundary's `directory:` is inherited like any other setting, so a child that inherits a literal directory renders
into the same place its base does. Writing the directory against a parameter is what sends each Release's output
somewhere of its own; see [Composite Release and `extends` inheritance](../entities/release.md#composite-release-and-extends-inheritance).

## One Manifest built on another

A Manifest can extend another the same way, and its entries replace the base's entry for the same key. A
development Manifest can keep every binding of the production one and change how credentials are realized: here a
`core/referenced-secret` attachment is fetched from a secret store in production and written into a Secret from the
value an author supplies in development.

```yaml
# manifest-prod.yaml
spec:
  mappings:
    components:
      type:
        core/datastore/postgres:1.0.0: helm/postgres:1.0.0
    features:
      type:
        core/referenced-secret:1.0.0: helm/k8s-external-secret:1.0.0
---
# manifest-dev.yaml
spec:
  extends: ./manifest-prod.yaml
  mappings:
    features:
      type:
        core/referenced-secret:1.0.0: helm/k8s-secret-from-parameter:1.0.0
```

The two realizations publish the Secret's name the same way, so a component reading the credential renders the same
reference under either Manifest; [One developer intent, two credential delivery shapes](credential-shape-per-target/README.md)
builds both and compares them.

## Two labels: the type and the category

Every Component carries one value from a closed set on the reserved `component.aggrega.ai/type` label: `server`, a
long-running endpoint; `worker`, a background consumer; `stateful-server`, something that keeps its own durable data;
`task`, which runs to completion; `function`, an event-driven function; and `resource`, a managed cloud resource that
runs no compute of its own. The value sits on the catalog entity, never on the instance in an Aggregate.

The type says how infrastructure must treat a component, not what the component is for. A message broker that keeps
its own disk is a `stateful-server`, exactly as a database is: `core/messaging/kafka` and `core/datastore/postgres`
carry the same type. What a reader browses by is the other label, `component.aggrega.ai/category` — `messaging` for
the broker, `datastore` for the database — which is also the catalog directory the entity sits in. A selector
written against one label never matches on the other.
