# aggrega push-artifact

Publish a standalone data artifact (such as a documentation bundle) to an OCI registry

<!-- BEGIN GENERATED: cli-push-artifact -->
**Synopsis**

```
aggrega push-artifact <file> [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--dry-run` | `false` | Compute the reference and print the proposed <reference>:<tag>; skip the network call |
| `--media-type` | `application/vnd.aggrega.docs.v1alpha1+tar+gz` | OCI artifact media type; defaults to the documentation-bundle media type |
| `--name` | — | Artifact name within the reserved docs/ namespace (e.g. "aggrega-docs" publishes at docs/aggrega-docs) |
| `--registry` | — | Destination registry host (overrides the workspace's default_registry) |
| `--tag` | — | Version tag to publish the artifact under (required) |
<!-- END GENERATED: cli-push-artifact -->

## The documentation-bundle artifact

A documentation bundle is a standalone data artifact — a gzipped tar of rendered
documentation — rather than a catalog entity. It carries the media type
`application/vnd.aggrega.docs.v1alpha1+tar+gz`, which is the artifact type a
consumer sees when pulling the bundle from the registry.

Bundles publish under the `docs/` repository segment: `--name aggrega-docs` places
the artifact at `docs/aggrega-docs`, and `--tag` selects the version, so the pull
coordinate is `<registry>/docs/<name>:<tag>` — for example,
`hub.aggrega.ai/docs/aggrega-docs:1.0.0`. Because the bundle is a plain data
artifact and not a catalog entity, it is fetched with any OCI-compatible client
using that reference and media type.

## See also

- [./aggrega-sign.md](./aggrega-sign.md) — a data artifact is signed after the fact, by reference;
  this command attaches no signature of its own.
- [./aggrega-serve.md](./aggrega-serve.md) — the daemon carries the same publication at
  `aggrega/publishArtifact`, so an editor can run it without leaving the session.
- [./aggrega-mcp.md](./aggrega-mcp.md) — the same capability as the `publish-artifact` tool, which an
  assistant can call. Read what that page says about allowing it before you do.
