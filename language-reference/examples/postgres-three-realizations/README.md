---
example:
  level: authoring
  products: [core/datastore/postgres]
  shows: [multi-target, recipe-selection, cloud-infrastructure, connections, catalog-authoring]
---

# One contract, three realizations

A PostgreSQL database and the application that reads it, deployed **three
different ways from one unchanged Aggregate**: PostgreSQL running in the
cluster, PostgreSQL as a managed cloud instance, and a PostgreSQL server that
already existed before this Release was deployed.

**The lesson is what does *not* change.** The application names the keys it
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

Three Recipes implement the same Component. Each publishes the same `provides`
keys — `host`, `port`, `user`, `database`, `protocol`, and the keys saying where
a scraper finds the database's metrics, empty on all three. Which one runs is a
single line in the Manifest.

## Files

- `aggregate.yaml` — developer intent, and the **same document
  for all three deployments**: a `db` component of type
  `core/datastore/postgres`, an `app` that `uses` it, and the five keys the
  application asks for. Nothing here names a target, a cloud, or a Recipe.
- `manifest-selfhosted.yaml`,
  `manifest-managed.yaml`,
  `manifest-external.yaml` — the Ops mappings. Each
  chooses its realization in **one line**: which Recipe the PostgreSQL
  component type binds. The managed one also binds the backup Feature its
  Releases attach.
- `release-selfhosted.yaml`,
  `release-managed.yaml`,
  `release-external.yaml` — the operator's sizing in
  each Release: storage and engine version for the in-cluster one, storage, HA
  and a `core/backup` attachment for the managed one, and the address of the
  existing server for the referenced one.
- `release-managed-dns.yaml` — the managed
  Release once more, with the DNS name the operator gives the instance, so
  the application is handed a name it can resolve.
- `catalog/` — the application's own Component and the one Recipe
  that renders it. Everything on the database side comes from the standard
  library unmodified.

## Build

```bash
aggrega build --release release-selfhosted.yaml --auto-pull
aggrega build --release release-managed.yaml --auto-pull
aggrega build --release release-managed-dns.yaml --auto-pull
aggrega build --release release-external.yaml --auto-pull
```

`--auto-pull` writes each Release's lockfile on its first build; later builds
need no flag. Each writes to `dist/`, and a build **adds** its files rather than clearing what
an earlier one left. Remove `dist/` between runs to read one realization's output
on its own:

```bash
rm -rf dist && aggrega build --release release-managed.yaml
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
operator's `ha` sizing and `core/backup` attachment map onto the instance's
native settings: the attachment's `retention_days: 14` becomes the instance's
`backup_retention_period = 14`.
The application still renders to Kubernetes: the two sides of this deployment
meet at the database's published contract, not at a shared target.

```yaml
# dist/stack/helm/app-deployment.yaml
- name: DB_HOST
  value: ${module.db.address}
```

**That value is not a hostname, and nothing in this build turns it into one.**
The address of an RDS instance does not exist until the instance is created, so
there is nothing for a compiler running ahead of time to look up. What the
Recipe publishes is a Terraform reference to an output of the database's own
module; the compiler pipes it across the edge untouched, the application's
Recipe receives it verbatim, and it renders into the Kubernetes manifest as the
literal characters shown above. The container is handed that text.

`DB_PORT` is different: it renders as `"5432"`, because the Recipe sets the
instance's port from the Release and publishes that same value, which is known
before anything exists.

**Native wiring between two components is something a target does inside its own
output, so there is none to do here.** The two ends of this edge render through
different targets — the database into Terraform HCL, the application into a
Kubernetes manifest — and a Terraform reference has meaning only inside a
Terraform configuration. Crossing that seam, the published value is delivered as
text like any other string. A consumer rendered on Terraform as a `source:`
Recipe, in the same root configuration as the database, receives the same
reference as one of its module's arguments, and there Terraform resolves it.

This is the general rule rather than a special case for RDS: anything that
depends on the state of a running system is expressed as a deterministic pointer
the runtime resolves, never as a value the compiler fetches. The compiler's part
is to deliver the pointer unchanged. **Making it resolve where it lands is the
Recipe author's**: publish an address the consuming side can use, or give both
components Recipes that render into the same target.

#### Giving the instance a name the application can resolve

`terraform/postgres-rds` takes the first of those as an option the operator
sets. `release-managed-dns.yaml` is the managed
Release with one addition, the DNS name the operator gives the instance:

```yaml
db:
  infra:
    overrides:
      host: db.internal.example.net
```

The Recipe publishes that name as `host` in place of the Terraform reference,
and the application receives it:

```yaml
# dist/stack/helm/app-deployment.yaml
- name: DB_HOST
  value: db.internal.example.net
```

| variable | `release-managed.yaml` | `release-managed-dns.yaml` |
| --- | --- | --- |
| `DB_HOST` | `${module.db.address}` | `db.internal.example.net` |
| `DB_PORT` | `5432` | `5432` |

That is the only line of the output that moves. The Recipe emits no DNS record
and no alias for the name, and the build does not look it up: the compiler pipes
it exactly as it piped the reference. Pointing `db.internal.example.net` at the
instance once it exists — a record in the operator's own DNS zone, aimed at the
instance's address — is the operator's, outside the Release. The key is the
one the referenced realization below reads for the same address; this Recipe
takes it as a bare name or IP literal, and a value carrying a scheme, a path, a
user or a port stops the build, since the port is the Release's `infra.port` and a consumer
composes its connection from the two.

A consumer rendered into the same Terraform configuration as the database
receives the name too, and with it loses the ordering the reference gave it:
Terraform acts on a module after a module it references, and a name references
nothing. Placing that consumer in a boundary of its own that shares the
database's `directory:` and carries a later `syncWave:` restores the order.

### External — nobody in this deployment runs the server

`helm/postgres-external` provisions nothing at all. Its whole output is one
Service that maps an in-cluster name onto the address the Release supplies:

```yaml
# dist/stack/helm/db-service.yaml
[… omitted: the Service's apiVersion, kind and metadata — its name, db, and the labels and annotations every rendered document carries]
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
[… omitted: what resolving the lockfile prints, the same halt among it, then [CATALOG_ERROR E0033], the Recipe's assertion external_host_supplied, its template position and source, and "error calling fail:"]
assertion failed: the Manifest selects the referenced realization of
PostgreSQL, which addresses a server it does not provision, but no address was
supplied: set infra.overrides.host on this component in the Release to the DNS
name or IP literal the existing server answers on
```

## The comparison that is the point

The application's rendered environment, all three side by side:

| variable | self-hosted | managed | external |
| --- | --- | --- | --- |
| `POOL_SIZE` | `10` | `10` | `10` |
| `DB_HOST` | `db-default` | `${module.db.address}` | `postgres.data.example.net` |
| `DB_NAME` | `appdb` | `appdb` | `appdb` |
| `DB_PORT` | `5432` | `5432` | `5432` |
| `DB_PROTOCOL` | `postgres` | `postgres` | `postgres` |
| `DB_USER` | `appuser` | `appuser` | `appuser` |

**Same variables, same order, every time. Only the string behind one of them
moves.** The application's Recipe names none of the `DB_` variables: it emits
whatever the `uses` edge resolved, which is why one Recipe renders unchanged
against all three databases.

And the compiler does not know what any of those strings *are*. `db-default` is
a Kubernetes Service name, `${module.db.address}` is a Terraform
reference, `postgres.data.example.net` is a DNS name — to the compiler they are
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
keys, plus one Manifest line. The `aggregate.yaml` in this directory does not
change.
