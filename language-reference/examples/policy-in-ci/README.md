---
example:
  level: advanced
  products: []
  shows: [policy]
---

# Policy in CI, over the build output

Two ready-to-use rule scripts that read an Aggrega build's output directory and
refuse it when it breaks a rule. They run in a pipeline, after `aggrega build`,
alongside whatever else that pipeline already runs over configuration.

This directory is not an Aggrega workspace — it authors no `Aggregate`, no
`Release` and no catalog entity. It is a pair of scripts you copy into your own
repository, plus the pipeline step that invokes each one.

The route they belong to, and when the in-build governance socket is the right
one instead, is described in
[the governance socket page](../../plugins/policy-socket.md#running-policy-in-ci-over-the-build-output).

## The two rules

| Script | Refuses |
| --- | --- |
| `require-pinned-image.sh` | a container image with no tag, or the tag `latest` |
| `deny-inline-credential-material.sh` | a rendered `Secret` carrying credential material as a literal |

Each takes the output directory as its only argument and walks whatever is
there. Neither knows anything about where the build ran, which target it was, or
how the workspace is laid out:

```sh
./require-pinned-image.sh <output-directory>
./deny-inline-credential-material.sh <output-directory>
```

Both need [`yq`](https://github.com/mikefarah/yq) on `PATH` and nothing else.
`yq` reads a JSON document with the same expression it reads a YAML one, because
JSON is a subset of YAML, so one script covers both shapes of output.

Beyond `yq`, this directory needs nothing: no catalog checkout, no `aggrega`
binary and no network. `./check.sh` runs both rules over small output
directories it writes itself, in the shapes a build emits, and compares each exit
code and report with the one expected for that directory; it exits 1 on any
mismatch. Producing a real build to run the rules against needs what the example
you build needs.

## Three exit codes, not two

```
0  no finding      — the output satisfies the rule
1  finding         — the output breaks it, and every offending artifact is named
2  cannot evaluate — bad usage, yq absent, or an artifact that does not parse
```

The third is deliberately distinct from the second. "The artifacts could not be
read" must never be indistinguishable from "the artifacts passed", which is the
same reason an unevaluable policy at the governance socket is reported as a fault
rather than as an allow. A pipeline that treats any non-zero exit as a failure
gets the right behaviour from both; one that wants to distinguish them can.

A run that finds nothing says how much it looked at, so a rule that matched
nothing at all is visible rather than indistinguishable from a rule that
matched and was satisfied:

```
OK: every image pinned across 3 container(s) in 43 document(s)
OK: no inline credential material across 43 document(s), 1 of them credential-carrying
```

## Adapting a rule

Each script keeps `yq` and the decision apart, and says so in a comment at the
point where they meet: a `yq` expression **reads** each document into
tab-separated rows, and a shell function **decides** on each row. To express a
different rule, change those two and leave the walk alone.

The separation is not decoration. Two rules that look similar need it for
opposite reasons:

- **A key alone is not enough.** A `ConfigMap` carries a `data:` block exactly as
  a `Secret` does, and a ConfigMap's `data:` is not credential material. So the
  kind is part of the credential rule, not just the key.
- **A recursive search is too much.** A `CustomResourceDefinition` declares its
  own schema, and that schema can declare a property named `image`. A rule that
  searched every document for an `image` key would report a CRD's schema as an
  unpinned workload. So `require-pinned-image.sh` reads the six pod-spec paths
  explicitly, and adding a workload kind means adding a path.

## Producing a build to run them against

Any built example in this tree works. The commands below are the ones that
produced the exit codes recorded further down.

```sh
cd ../external-secrets-operator
aggrega build --release release.yaml
```

```sh
cd ../ai-agent-and-model-router
aggrega build --release release.yaml
```

Lockfiles are generated rather than shipped, so a fresh clone has none and the
first build needs one; [the examples overview](../README.md) states the two ways
to resolve it.

## The pipeline step

The snippets below are GitHub Actions; the shape carries to any pipeline that
can run a shell command and read its exit code. Each `run:` line is the command
these exit codes came from.

```yaml
# every image a rendered workload runs is pinned
jobs:
  policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Compile the Release
        run: aggrega build --release release.yaml --auto-pull
        working-directory: ai-agent-and-model-router
      - name: Images are pinned
        run: ./require-pinned-image.sh ../ai-agent-and-model-router/dist
        working-directory: policy-in-ci
```

```yaml
# no credential material reaches the artifacts as a literal
jobs:
  policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Compile the Release
        run: aggrega build --release release.yaml --auto-pull
        working-directory: external-secrets-operator
      - name: No inline credential material
        run: ./deny-inline-credential-material.sh ../external-secrets-operator/dist
        working-directory: policy-in-ci
```

In your own repository there is one workspace rather than a tree of examples,
so the argument is wherever your build writes — `dist` beside the workspace, in
the usual case — and the scripts sit wherever you keep pipeline tooling. Only
those two paths change.

## What each rule reports

Run from this directory, over builds of three of the sibling examples. A refusal
names every artifact it objects to, so the pipeline log is the finding list.

**Images are pinned** — over a Release whose Recipes pin every image:

```console
$ ./require-pinned-image.sh ../ai-agent-and-model-router/dist
OK: every image pinned across 4 container(s) in 12 document(s)
$ echo $?
0
```

Over a Release whose Recipe sources an upstream Helm chart and does not
override the chart's own image reference:

```console
$ ./require-pinned-image.sh ../advanced-platform/dist
REFUSED: data/helm/db-statefulset-default-db-mariadb.yaml: StatefulSet/db-mariadb container mariadb runs unpinned image registry-1.docker.io/bitnami/mariadb:latest
REFUSED: data/helm/db-statefulset-default-db-mariadb.yaml: StatefulSet/db-mariadb container preserve-logs-symlinks runs unpinned image registry-1.docker.io/bitnami/mariadb:latest
REFUSED: 2 finding(s) across 3 container(s) in 12 document(s)
$ echo $?
1
```

**No inline credential material** — over a Release whose one `Secret` is
filled by its operator at runtime rather than rendered with a value in it:

```console
$ ./deny-inline-credential-material.sh ../external-secrets-operator/dist
OK: no inline credential material across 43 document(s), 1 of them credential-carrying
$ echo $?
0
```

Over a Release that fills three credential slots by value:

```console
$ ./deny-inline-credential-material.sh ../ai-agent-and-model-router/dist
REFUSED: helm/agent--router-zumodel-zdcredential--agent-secret-agent-router-model-credential.yaml (document 1): Secret/agent-router-model.credential carries inline material under api-key
REFUSED: helm/router--api-zukey--router-secret-router-api-key.yaml (document 1): Secret/router-api-key carries inline material under master-key
REFUSED: helm/router--provider-zukey--router-secret-router-provider-key.yaml (document 1): Secret/router-provider-key carries inline material under provider-key
REFUSED: 3 finding(s) across 12 document(s), 3 of them credential-carrying
$ echo $?
1
```

That last refusal is a rule an estate chooses, not a defect in the Release.
Filling a credential slot by value is a supported shape: an author supplies
the material and the target renders it where the workload can read it, and the
compiler carries no opinion about that. Nearby, and separately, it does warn when
a value an author declared sensitive travels to a delivery key as a literal —
and that one advises rather than halts, because the by-value credential family is
deliberate. Either way, an estate that forbids the shape is the thing that says
so: here, or at the governance socket. The two routes and the choice between them
are on
[the governance socket page](../../plugins/policy-socket.md#running-policy-in-ci-over-the-build-output).
