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
