# Composition

This page explains one idea, building an application out of parts larger than one component, and is not a runnable
workspace. [Module boundary routing — placing whole sub-modules into boundaries](module-boundary-routing/README.md)
shows it in a workspace you build; write it into a folder of your own with:

```sh
aggrega scaffold --example module-boundary-routing
```

It then prints the commands to run next:

```sh
cd module-boundary-routing
aggrega build --release release.yaml --auto-pull
```

## Modules: an Aggregate imported by another

An Aggregate can import another Aggregate as a module under `aggregates:`. The module composes its own components and
wires its own edges, so none of its internals appear in the Aggregate that imports it. The example imports two
modules from the standard-library catalog, from `aggregate.yaml`:

```yaml
spec:
  aggregates:
    metrics:
      type: core/thanos
    documents:
      type: core/ferretdb
```

A module's `exportedComponents` block is its public interface: the components something outside the module may
connect to, each under the name it is exported as. `core/ferretdb` exports its `proxy` component as `mongo`, so a
component of the importing Aggregate reaches it with the dotted path `documents.mongo`:

```yaml
      uses:
        database:
          main:
            target: documents.mongo
```

A module may declare parameters of its own, which the importing Aggregate fulfils on the import's `parameters:`.

## Placing a module

The Release places a whole module in a boundary with an `aggregates:` entry keyed by the module's name, and every
component the module contains goes with it. It may also configure the module's components, each by the name it has
inside the module. From `release.yaml`, comments left out:

```yaml
spec:
  boundaries:
    observability:
      directory: observability
      annotations:
        aggrega.ai/namespace: observability
      aggregates:
        metrics:
          components:
            query:
              infra:
                compute:
                  cpu: 500m
                  memory: 1Gi
    data:
      directory: data
      annotations:
        aggrega.ai/namespace: data
      aggregates:
        documents: {}
```

A module's own annotations reach its own components exactly as an Aggregate's reach its own, so a module can place
its components in a namespace it declares. The importing Aggregate declares nothing that reaches into the module; the
Release does, and its value wins on the same key.

## A service the build does not provision

A server that already exists is still a node of the graph: it takes part in connections, in policy and in what its
consumers receive, and nothing is provisioned for it. Its Manifest binds a Recipe that provisions nothing, and the
Release gives the address. In [One contract, three realizations](postgres-three-realizations/README.md), the
`manifest-external.yaml` Manifest binds `core/datastore/postgres` to `helm/postgres-external`, which emits only an
ExternalName Service, and the Release supplies the address, from `release-external.yaml`:

```yaml
        db:
          infra:
            overrides:
              host: postgres.data.example.net
```

The address is a pointer string: the build passes it through without resolving it, and whatever answers at that name
when the application runs is what the application reaches. The Aggregate is the same file for all three of the
example's Releases.

## Subsystems: grouping inside one Aggregate

A subsystem groups components within an Aggregate. Annotations declared on it reach every component it holds, and a
Feature attached to it is attached to each of them:

```yaml
spec:
  subsystems:
    billing:
      annotations:
        team.aggrega.ai/owner: billing-squad
        aggrega.ai/namespace: billing
      features:
        metrics:
          type: core/prometheus-exporter
      components:
        invoice-api:
          type: core/compute/server
        payment-worker:
          type: core/compute/worker
```

The build flattens the subsystem tree: `invoice-api` and `payment-worker` each carry the `metrics` attachment and both
annotations, which a Recipe reads as `{{ index .context.annotations.aggregate "team.aggrega.ai/owner" }}`.
`aggrega.ai/namespace` is a provider annotation, so it also places both components in the `billing` namespace. The
Release configures the attachment's `infra` under each component's entry, by the name the subsystem gave it, and a
namespace the Release sets overrides the subsystem's for the components it covers.

## An attachment that connects to something of its own

An attachment can carry its own `uses:` block, drawing an edge from the attachment rather than from the component it
sits on. In [A datastore backed up on every target](datastore-backup/README.md), the operator attaches `core/backup` to
the database and connects the attachment to the bucket the backups go to, from `release-helm-velero.yaml`:

```yaml
spec:
  components:
    db:
      features:
        backup:
          type: core/backup
          infra:
            schedule: "30 2 * * *"
            retention_days: 14
          uses:
            store:
              bucket:
                target: backups
```

The database's own connections are unchanged: the edge to `backups` belongs to the attachment, is recorded as drawn
by it, and is checked by policy like any other edge. An operational Feature and a credential Feature are attached the
same way, and either may carry a `uses:` block.
