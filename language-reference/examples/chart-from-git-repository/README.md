---
example:
  level: authoring
  products: []
  shows: [external-sources, catalog-authoring, guardrails]
---

# A chart held in a git repository

A Helm chart does not have to come from a chart registry. This example sources one
that lives in a **git repository** — the Helm project's own `hello-world`
example chart — and builds it into Kubernetes manifests.

The developer's Aggregate says nothing about any of this. It declares one
`core/compute/server`, and where that server's packaging comes from is decided
in the Recipe and bound by the Manifest.

## The source block

```yaml
# catalog/recipe/helm/hello-world-git/1.0.0/recipe.yaml
source:
  kind: git-repository
  url: https://github.com/helm/examples.git
  ref: hello-world-0.1.0
  module_subdir: charts/hello-world
```

Three coordinates, and each answers a different question:

- **`url`** — the repository to clone. `https://`, `ssh://` and `git://` are
  all accepted. A private repository is reached over SSH through
  the SSH agent, or over HTTPS with an entry for its host in your netrc file —
  `machine github.com login <user> password <token>`. A credential written into
  the URL itself is refused, as
  [Authentication](../../cli/aggrega-pull.md#authentication) describes.
- **`ref`** — the reference to read the repository at: a tag, a branch, or a
  commit. It is whatever the repository's own authors named, which is not always
  a bare version — here the tag carries the chart's name as well.
- **`module_subdir`** — the directory inside the repository that is the chart.
  The repository holds a chart under this path rather than being one, and the
  directory is part of what makes the artifact distinct: two directories of one
  repository at one commit are two artifacts, not one.

The source kind names the **transport and the location**, not the format. The
same kind fetches a chart, a Terraform module, or any other directory of files;
what the directory holds is the consuming provider's business.

## What the lockfile records

Only a commit names content that cannot change under you. A tag or a branch is a
name the repository can repoint at a different commit, so `aggrega pull` resolves
the reference and records **both** — the reference you wrote, and the commit it
resolved to:

```yaml
# release-chart.lock
source_artifacts:
    - kind: git-repository
      url: https://github.com/helm/examples.git
      module_subdir: charts/hello-world
      pinned_version: f3dc419e558e6ccebce2ed447384e5d2e11de2f9
      digest: sha256:2bee62cfc2efccc61d8e17efeb72f9f77ad7bd87f3ea4e50b1e4219c8d5a2c78
      mediatype: application/gzip
      referenced_by:
        - entity: recipe
          uri: helm/hello-world-git:1.0.0
          field: spec.source
          requested_ref: hello-world-0.1.0
```

Both halves earn their place. The commit is what the build fetches, so the build
is reproducible. The reference is what the build **looks the entry up by**, which
is what lets you keep writing `ref: hello-world-0.1.0` in the Recipe and still
resolve to the exact commit that tag stood at when the lockfile was written.

## Building

```bash
aggrega build --release release-chart.yaml --auto-pull
```

This example carries two releases, so the one to build is named. The first build
needs a lockfile, which is why `--auto-pull` is passed here; running
`aggrega pull --release release-chart.yaml` once beforehand does the same and
lets every later build run with no flag.

The rendered Deployment carries the values the Release supplied, mapped onto the
chart's own value names:

```yaml
# dist/app/helm/web-deployment-web-hello-world.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-hello-world
  [… omitted: the chart's own labels, and the labels and annotations every rendered document carries]
spec:
  replicas: 2
  [… omitted: the selector and the pod template's own labels]
    spec:
      serviceAccountName: web-hello-world
      securityContext: {}
      containers:
        - name: hello-world
          securityContext: {}
          image: "nginx:1.27.3"
          imagePullPolicy: IfNotPresent
          [… omitted: the container port and the two probes]
```

Every build prints one warning:

```text
warning: node "web": .infra key "compute" is read by no template in recipe "hello-world-git" — correct the spelling, or remove the key
```

That is accurate and worth reading rather than silencing. The `core/compute/server`
Component offers a CPU-and-memory sizing knob; this particular chart exposes no
values for it, so the Recipe maps nothing there. A sourced Recipe maps what the
chart it sources actually accepts, and the compiler reports the value that reached
nothing instead of pretending it landed.

## When the reference moves

A tag can be repointed at the repository. When that happens, the next ordinary
`aggrega pull` finds the reference resolving somewhere other than the commit it
recorded, and **halts instead of adopting it**:

```text
# aggrega pull --release release-chart.yaml
#
# [E0130]
#   lockfile: out of date; it no longer matches what its Release resolves to
#   ---
#   source-artifact kind=git-repository url=https://github.com/helm/examples.git
#   module_subdir=charts/hello-world: reference "hello-world-0.1.0" moved — the
#   lockfile pins 03f4a18d3c2b77b7ecd91d0324a95910d4f04152, and it now resolves to
#   f3dc419e558e6ccebce2ed447384e5d2e11de2f9; adopt where it now points with
#   `aggrega pull --upgrade --release <release>`
```

It names both commits, so you can see exactly what moved before deciding. The
lockfile is left as it was — the halt lands before anything is written — and
adopting the new commit is a deliberate act:

```bash
aggrega pull --upgrade --pin-sources --release release-chart.yaml
```

A moved reference is the case `--upgrade` is for: an ordinary pull holds the
commit the lockfile records, and only an upgrade adopts where the reference now
points. A bare `--upgrade` drops every recorded pin, so it asks for confirmation
first. `--pin-sources` is needed too, because this Recipe also records its
source's commit in the `entity.lock` beside it: the upgrade rewrites that pin to
the new commit, where without the flag the pull halts on the lock and names
`aggrega pin`. Commit the rewritten `entity.lock` with the Recipe.

An edit made in this workspace, to the Aggregate or the Release say, is drift of
a different kind: the next build reports it, and an ordinary
`aggrega pull --release release-chart.yaml` clears it.

Pinning a commit in `ref:` instead of a tag is the other way to get the same
guarantee, at the cost of a coordinate no human can read.

## The guardrail release

`release-negative.yaml` is **expected to fail**, and it is here because a fetch
path exercised only on its happy path tells you nothing about its guards. It
deploys the same Aggregate through `manifest-negative.yaml`, which binds a Recipe
identical to the working one but for its reference — it names a tag the
repository does not carry:

```bash
aggrega build --release release-negative.yaml --auto-pull
# exits non-zero
```

```text
# [E0137]
#   auto-pull: resolving the source of each Recipe and FeatureRecipe the Release
#   uses: resolve: resolve source for recipe
#   "helm/hello-world-git-missing-ref:1.0.0": sourceresolver: kind=git-repository
#   url=https://github.com/helm/examples.git version=: oci: artifact not found at
#   remote source (cause: reference not found)
[… omitted: the rest of that line, a remediation naming the URL and version to check]
```

The repository is reachable and the clone succeeds; there is simply no such
reference in it, so there is no commit to pin and nothing to archive.

## What this example needs from the network

Unlike most workspaces here, this one clones a real repository on its first
build, so that build needs outbound access to the host named in `url`. Once the
lockfile and the resolution cache exist, later builds read from the cache and
run with no network at all — `aggrega build --release release-chart.yaml --offline`
rebuilds the same bytes.
