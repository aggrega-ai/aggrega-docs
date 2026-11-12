# Cross-Boundary Routing

This page explains one idea, rewriting the address a component receives when what it connects to runs somewhere
else, and is not a runnable workspace.
[Cross-boundary networking](cross-boundary-networking/README.md) shows it in a workspace you build; write it into a folder of your own with:

```sh
aggrega scaffold --example cross-boundary-networking && cd cross-boundary-networking
```

When two components are placed in different boundaries, the `host` the target publishes is a string the build cannot
interpret: it cannot tell whether the string is reachable from the other side. Cross-boundary routing is therefore a
Feature attached to the caller, saying which injected variable needs rewriting, and a FeatureRecipe for each provider
saying how to rewrite it. The pieces it is built from have pages of their own: `injectMapping` in
[entities/featurerecipe.md](../entities/featurerecipe.md), boundary annotations in
[entities/release.md](../entities/release.md), and the `provides` / `inject` / `uses` contract in
[vocabulary/topology-triad.md](../vocabulary/topology-triad.md).

## The operator attaches the Feature to the caller

In the example's Kubernetes variant, Adminer and its database sit in two boundaries, each in a namespace of its own,
and Adminer receives the database's address in `ADMINER_DEFAULT_SERVER`. The operator attaches the standard library's
`core/k8s-dns-resolver` to Adminer in the Release and names that variable; the Aggregate does not change. From
`release-helm.yaml`, comments left out:

```yaml
spec:
  boundaries:
    frontend:
      directory: frontend
      annotations:
        aggrega.ai/namespace: "frontend"
      components:
        adminer:
          features:
            dns-resolver:
              type: core/k8s-dns-resolver:1.0.0
              infra:
                target_var: ADMINER_DEFAULT_SERVER
    backend:
      directory: backend
      annotations:
        aggrega.ai/namespace: "backend"
```

## The FeatureRecipe rewrites the variable before the caller renders

The Manifest binds the Feature to `helm/k8s-dns-resolver`. Its `injectMapping` runs after the variables each
connection delivers are in place and before the caller's own Recipe renders: it reads the variable, finds the
connection that delivered it, reads the target's namespace from that connection's annotations, and writes the
variable back qualified with the namespace, `default` when the target declares none:

```yaml
spec:
  capability: helm
  implements: core/k8s-dns-resolver:1.0.0
  injectMapping: |
    {{- $base_host := optional .context.inject.env .infra.target_var "" }}
    {{- $target_edge := dict }}
    {{- range $alias, $edge := .context.uses }}
      {{- if hasKey $edge.inject.env $.infra.target_var }}
        {{- $target_edge = $edge }}
      {{- end }}
    {{- end }}
    {{- $ns := "default" }}
    {{- if $target_edge.annotations }}
      {{- $raw := optional (optional (default dict $target_edge.annotations) "release" dict) "aggrega.ai/namespace" (optional (optional (default dict $target_edge.annotations) "aggregate" dict) "aggrega.ai/namespace" "") }}
      {{- if $raw }}{{- $ns = $raw }}{{- end }}
    {{- end }}
    {{- if and $target_edge $base_host }}
    env:
      "{{ .infra.target_var }}": "{{ $base_host | replace "\\" "\\\\" | replace "\"" "\\\"" }}.{{ $ns }}"
    {{- end }}
```

So the database publishes its bare service name, and Adminer receives it as `db-default.backend`. Only the caller's
variable is rewritten: the target's published `host` is unchanged, and a caller in the target's own namespace still
reaches it by the bare name. A `target_var` that matches no connection injects nothing. The example's Docker Compose
variant crosses the same seam another way, with the standard library's `core/compose-bridge`.

## A pipeline step, from the plugin's side

An `injectMapping` is a template the build evaluates itself. A FeatureRecipe or a Recipe can also declare a
`pipeline:` of steps, each run by a WebAssembly plugin after rendering. A step receives its `with:` input, already
templated against the attachment's context, and the keyed set of rendered documents; it returns RFC 6902 patches
against those documents, any resources it adds as side effects, diagnostics in the shared shape every socket reports
in, and outputs a later step can read. Both directions travel in the canonical binary encoding; the
[Wasm plugin contract](../plugins/plugin-contract.md) is the exact shape of each, and
[When to reach for a pipeline step](../plugins/when-to-use-a-pipeline-step.md) says when a step is the right tool.
