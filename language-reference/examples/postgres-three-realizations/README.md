# One contract, three realizations

A PostgreSQL database and the application that reads it, deployed **three
different ways from one unchanged Aggregate**: PostgreSQL running in the
cluster, PostgreSQL as a managed cloud instance, and a PostgreSQL server that
already existed before this deployment did.

**The lesson is what does *not* change.** The application declares which keys it
wants from the database and what to call them, once. It never learns which of the
three answered. The compiler never learns either: it reads the keys the selected
Recipe published and routes the strings.

## The one thing that varies

```text
                       .-- helm/postgres ---------- a StatefulSet in the cluster
                      /
core/datastore/postgres --- terraform/postgres-rds -- an RDS instance in Terraform
      one Component     \
      one contract       '- helm/postgres-external -- a server that already exists
```

Three Recipes implement the same Component. Each publishes the same five
`provides` keys — `host`, `port`, `user`, `database`, `protocol`. Which one runs
is a single line in the Manifest.

## Files

- [`aggregate.yaml`](aggregate.yaml) — developer intent, and the **same document
  for all three deployments**: a `db` component of type
  `core/datastore/postgres`, an `app` that `uses` it, and the five keys the
  application asks for. Nothing here names a target, a cloud, or a Recipe.
- [`manifest-selfhosted.yaml`](manifest-selfhosted.yaml),
  [`manifest-managed.yaml`](manifest-managed.yaml),
  [`manifest-external.yaml`](manifest-external.yaml) — the Ops mappings. They
  differ in **one line**: which Recipe the PostgreSQL component type binds.
- [`release-selfhosted.yaml`](release-selfhosted.yaml),
  [`release-managed.yaml`](release-managed.yaml),
  [`release-external.yaml`](release-external.yaml) — the operator's sizing per
  deployment: storage and engine version for the in-cluster one, storage plus
  HA and backup for the managed one, and the address of the existing server for
  the referenced one.
- [`catalog/`](catalog/) — the application's own Component and the one Recipe
  that renders it. Everything on the database side comes from the standard
  library unmodified.

## Build

```bash
./build-release.sh selfhosted
./build-release.sh managed
./build-release.sh external
```

Each writes to `dist/`, and a build **adds** its files rather than clearing what
an earlier one left. Remove `dist/` between runs to read one realization's output
on its own:

```bash
rm -rf dist && ./build-release.sh managed
```

## What each one renders

### Self-hosted — the deployment runs the server

`helm/postgres` synthesizes the database in the cluster: a StatefulSet, a
ClusterIP Service and a headless Service. `provides.host` is the bare name of
that Service, so the application reaches it by in-cluster DNS.

```yaml
# dist/stack/helm/app-deployment.yaml
- name: DB_HOST
  value: db-default
```

### Managed — a cloud provider runs the server

`terraform/postgres-rds` emits an `aws_db_instance` as Terraform HCL, and the
operator's `ha` and `backup` sizing maps onto the instance's native settings.
The application still renders to Kubernetes: the two sides of this deployment
meet at the database's published contract, not at a shared target.

```yaml
# dist/stack/helm/app-deployment.yaml
- name: DB_HOST
  value: aws_db_instance.db.endpoint
```

**That value is not a hostname, and nothing in this build turns it into one.**
The endpoint of an RDS instance does not exist until the instance is created, so
there is nothing for a compiler running ahead of time to look up. What the
Recipe publishes is a string written in Terraform's own address syntax; the
compiler pipes it across the edge untouched, the application's Recipe receives
it verbatim, and it renders into the Kubernetes manifest as the literal
characters shown above. The container is handed that text.

**Native wiring between two components is something a target does inside its own
output, so there is none to do here.** The two ends of this edge render through
different targets — the database into Terraform HCL, the application into a
Kubernetes manifest — and a Terraform address has meaning only inside a Terraform
configuration. Crossing that seam, the published value is delivered as text like
any other string.

This is the general rule rather than a special case for RDS: anything that
depends on the state of a running system is expressed as a deterministic pointer
the runtime resolves, never as a value the compiler fetches. The compiler's part
is to deliver the pointer unchanged. **Making it resolve where it lands is the
Recipe author's**: publish an address the consuming side can use, or give both
components Recipes that render into the same target.

### External — nobody in this deployment runs the server

`helm/postgres-external` provisions nothing at all. Its whole output is one
Service that maps an in-cluster name onto the address the Release supplies:

```yaml
# dist/stack/helm/db-service.yaml
spec:
  type: ExternalName
  externalName: postgres.data.example.net
  ports:
    - port: 5432
```

No StatefulSet, no volume, no container — the server's lifecycle sits entirely
outside this deployment. The address comes from the Release:

```yaml
db:
  infra:
    overrides:
      host: postgres.data.example.net
```

```yaml
# dist/stack/helm/app-deployment.yaml
- name: DB_HOST
  value: postgres.data.example.net
```

Referencing a server is not the same as taking one over. This Recipe reaches a
server that stays externally owned; nothing here brings it under the
deployment's management, and nothing here will change it.

**Leave the address out and the build stops and says so.** A referenced server
has an address or it has nothing, so the Recipe refuses rather than emitting a
Service that aliases an empty name:

```text
assertion failed: this deployment selects the referenced realization of
PostgreSQL, which addresses a server it does not provision, but no address was
supplied: set infra.overrides.host on this component in the Release to the DNS
name or IP literal the existing server answers on
```

## The comparison that is the point

The application's rendered environment, all three side by side:

| variable | self-hosted | managed | external |
| --- | --- | --- | --- |
| `DB_HOST` | `db-default` | `aws_db_instance.db.endpoint` | `postgres.data.example.net` |
| `DB_PORT` | `5432` | `aws_db_instance.db.port` | `5432` |
| `DB_USER` | `appuser` | `appuser` | `appuser` |
| `DB_NAME` | `appdb` | `appdb` | `appdb` |
| `DB_PROTOCOL` | `postgres` | `postgres` | `postgres` |
| `POOL_SIZE` | `10` | `10` | `10` |

**Same variables, same order, every time. Only the strings behind two of them
move.** The application's Recipe names none of these variables: it emits
whatever the `uses` edge resolved, which is why one Recipe renders unchanged
against all three databases.

And the compiler does not know what any of those strings *are*. `db-default` is
a Kubernetes Service name, `aws_db_instance.db.endpoint` is a Terraform
expression, `postgres.data.example.net` is a DNS name — to the compiler they are
three strings that a Recipe published under the key `host` and an edge asked to
be delivered as `DB_HOST`. It does not check that any of them is routable, or
that a port is a number, or that a component called `db` is a database. It
matched the edge on the label the Component carries, read the key the contract
declares, and moved the text.

## Where the seam is

Each of the three deployments was chosen by an Ops mapping, and the developer
document was untouched by that choice. That is the split the whole example
exists to make concrete:

- the **developer** says *what the application needs from a database*;
- **Ops** says *what a database is made of* — one Recipe per realization;
- the **operator** says *which one this deployment gets*, and sizes it.

Add a fourth realization tomorrow — a different cloud, a different operator, a
Compose service for local work — and it is one more Recipe publishing the same
five keys, plus one Manifest line. The `aggregate.yaml` in this directory does
not change.
