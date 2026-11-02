---
example:
  level: start
  products: [core/datastore/mysql-innodb-cluster, core/datastore/mysql-operator]
  shows: []
---

# One Aggregate, two sizes of MySQL cluster

A MySQL InnoDB Cluster and the control plane that reconciles it, built **twice
from one unchanged Aggregate**: once asking for a single server instance, once
asking for three.

**The lesson is where the size lives.** How many servers stand behind the
database is not something the developer wrote and not something the Recipe
decided — it is one line of operator sizing in the Release, and it is the whole
of what differs between the two rendered trees.

## What the compiler writes, and what it does not

This realization emits an `InnoDBCluster` custom resource. It does not emit
servers, Services or routers: the MySQL Operator for Kubernetes creates those
inside the target cluster after the custom resource is applied, which is work
that happens long after the compiler has finished.

So everything below describes what the rendered custom resource **asks for**.
What a running cluster ends up containing is the controller's answer to that
request, at a moment the compiler never sees — and the compiler makes no claim
about it, because it has no way to look.

## The one thing that varies

```text
                                .-- release-single.yaml ----- spec.instances: 1
                               /
one Aggregate -- one Manifest -+
one Component                  \
one Recipe                      '- release-replicated.yaml -- spec.instances: 3
```

Both Releases select the same Component and the same Recipe, so there is **one
Manifest, not one per Release**. When two Releases differ only in sizing, the
Ops mapping has nothing to say about the difference, and a second copy of it
would be a second thing to keep in step for no gain.

## Files

- `aggregate.yaml` — developer intent, and the **same document
  for both Releases**: a `mysql-operator` component for the control plane, a `db`
  component of type `core/datastore/mysql-innodb-cluster`, and the character set
  the developer wants the server to speak. Nothing here says how many servers
  there are.
- `manifest.yaml` — the Ops mapping, shared by both Releases.
  Two lines: which Recipe realizes the control plane, and which realizes the
  database.
- `release-single.yaml`,
  `release-replicated.yaml` — the operator's sizing.
  They differ in their `metadata.name` and in `server_instances`, and every other
  field is held equal on purpose so that one line is the whole difference.
- `.aggrega-config.yaml` — names the hub registry the standard-library catalog
  resolves from. This example authors no entities of its own.

## Build

```bash
aggrega build --release release-single.yaml --auto-pull
aggrega build --release release-replicated.yaml --auto-pull
```

`--auto-pull` writes the lockfile a fresh clone lacks during the build. Each
build writes to `dist/`, and a build **adds** its files rather than clearing what
an earlier one left. Remove `dist/` between runs to read one Release's output on
its own:

```bash
rm -rf dist && aggrega build --release release-replicated.yaml --auto-pull
```

Each Release renders five files: the database's custom resource, and the four
that stand the control plane up.

```text
dist/stack/helm/db/innodbcluster.yaml
dist/stack/helm/mysql-operator/clusterrole.yaml
dist/stack/helm/mysql-operator/clusterrolebinding.yaml
dist/stack/helm/mysql-operator/deployment.yaml
dist/stack/helm/mysql-operator/serviceaccount.yaml
```

## What the database renders to

```yaml
# dist/stack/helm/db/innodbcluster.yaml  —  aggrega build --release release-single.yaml
apiVersion: mysql.oracle.com/v2
kind: InnoDBCluster
metadata:
  [… omitted: the labels and annotations, described below]
  name: db
spec:
  instances: 1
  router:
    instances: 1
  version: "8.4.0"
  secretName: "mysql-root"
  mycnf: |
    [mysqld]
    character-set-server=utf8mb4
    collation-server=utf8mb4_0900_ai_ci
```

The rendered file also carries the labels and annotations Aggrega puts on every
artifact it renders — which Aggregate it came from, which component, which
Recipe, which boundary — elided here to keep the request itself in view.

Four of those five `spec` entries trace straight back to something authored:
`instances` to the Release's `server_instances`, `version` to the Component's
`engine_version` default, `secretName` to the Release's `credentials_secret`, and the `mycnf`
block to the developer's `charset` and `collation`. The fifth, `router.instances`,
is discussed below.

## The comparison that is the point

The whole difference between the two rendered trees:

```diff
--- dist/stack/helm/db/innodbcluster.yaml   (single)
+++ dist/stack/helm/db/innodbcluster.yaml   (replicated)
 spec:
-  instances: 1
+  instances: 3
   router:
     instances: 1
```

**One line, in one of the five files.** The four control-plane files are
byte-identical between the two Releases: the controller that reconciles a
one-instance request and the controller that reconciles a three-instance request
are the same controller, so nothing about it moves.

**The router count does not move either, and it is not a dial this component
offers freely.** The address the component publishes is the Service the routers
answer on, so the count is exposed at the custom resource's own default and never
below it. That is a bound on what a Release may ask for rather than a size this
example varies, which is why the line sits in the diff above without changing.

## The control plane

```yaml
# dist/stack/helm/mysql-operator/deployment.yaml
[… omitted: the Deployment's metadata, selector and pod template up to the containers]
      containers:
        - name: controller
          image: container-registry.oracle.com/mysql/community-operator:26.7.0-2.3.0
          [… omitted: the controller's readiness probe]
```

**Neither Release names an image.** The reference comes from the Component's own
`infra.image` default, so a Release that sets nothing still renders a Deployment
with one version on it rather than one that has to be filled in before it can be
applied. A target that pulls from its own registry mirror sets `infra.image` in
the Release and gets that reference instead.

The control plane is declared in the Aggregate, beside the database, because a
custom resource on its own is inert: it only becomes a running server once a
controller is watching for it. Declaring both together is what lets the two be
applied as one unit.

## The prerequisite is asserted, never discovered

The compiler runs ahead of time and never contacts a cluster, so it cannot check
whether the controller is installed. It asks instead. Leave
`control_plane_present` unset and the build stops:

```text
[… omitted: the pull's lines, which carry the same halt]
[CATALOG_ERROR E0033]
  Recipe/FeatureRecipe assertions
  caused by: Recipe "mysql-innodb-cluster" instance "db" assertion "mysql_operator_prerequisite": assertion "Recipe/mysql-innodb-cluster/db/mysql_operator_prerequisite": template: Recipe/mysql-innodb-cluster/db/mysql_operator_prerequisite:1:48: executing "Recipe/mysql-innodb-cluster/db/mysql_operator_prerequisite" at <fail "the MySQL Operator control plane must be installed in the target cluster before this realization emits its InnoDBCluster custom resource; once the control plane is present, affirm the prerequisite by setting infra.control_plane_present to true in the Release">: error calling fail: assertion failed: the MySQL Operator control plane must be installed in the target cluster before this realization emits its InnoDBCluster custom resource; once the control plane is present, affirm the prerequisite by setting infra.control_plane_present to true in the Release
```

Nothing is written. A custom resource nobody is reconciling is not a smaller
success than a working one — it is an artifact that applies cleanly and then sits
there, so the build refuses to produce it and names the key that would say
otherwise.

## The root account

Both Releases here point the cluster at a Secret that already exists in the
target cluster:

```yaml
db:
  infra:
    credentials_secret: mysql-root
```

Nothing is rendered for that Secret and no password reaches the output — the
custom resource carries the name and the controller reads the account out of it.
Setting `infra.credentials` to `generated` instead renders the Secret beside the
custom resource from a credential attached to the component's `root_password`
slot, which puts the password in the rendered output and is the right choice when
the output is what provisions the cluster.

What this realization does **not** create is a logical database or an application
user. The controller establishes the cluster's root account and nothing below it,
so the schemas and accounts an application needs are created by whoever holds
root.

## Which realization to reach for

**Reach for `core/datastore/mysql` and its synthesized Recipe when nothing may
need installing first** — it needs no controller in the cluster and no chart
repository to reach, so it builds with nothing fetched, and it creates the
logical database and login role an application asks for. **Reach for
`core/datastore/mysql-innodb-cluster` when the target already runs the MySQL
Operator control plane**, or installs it as this example does, and what the
application needs is root access to a cluster at an in-cluster address.

The single-server shape of the synthesized realization is worked through in
[`../mysql-standalone/`](../mysql-standalone/), and is not repeated here.

## Where the seam is

The developer document was untouched by the choice between one instance and
three, and so was the Ops mapping. That is the split this example exists to make
concrete:

- the **developer** says *what the application needs from a database*;
- **Ops** says *what a database is made of* — which Recipe realizes it;
- the **operator** says *how big this one is*.

Change `server_instances` to any value the custom resource accepts and the
`aggregate.yaml` in this directory does not move.
