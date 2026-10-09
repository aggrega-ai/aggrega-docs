# aggrega push-artifact

Publish a standalone data artifact (such as a documentation bundle) to an OCI registry

<!-- BEGIN GENERATED: cli-push-artifact -->
**Synopsis**

```
aggrega push-artifact <file> [flags]
```

**Description**

```
Publish a standalone data artifact — a documentation bundle or any other non-entity blob — to an OCI registry under the reserved docs/ namespace. Unlike push, which bundles a catalog entity and dispatches on its kind, push-artifact carries opaque bytes: it reads the file, packs it under the given media type (defaulting to the documentation-bundle media type), and tags it at docs/<name>:<tag>. The published artifact is signed separately by reference with aggrega sign. Beside it, push-artifact states when it published, as a small published-at attachment carrying this machine's clock in UTC to the second; the attachment moves no digest and changes no tag.
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
using that reference and media type. The published file carries the name given
with `--name`, so a client that writes files by name writes it under that one:
`oras pull hub.aggrega.ai/docs/aggrega-docs:1.0.0` leaves `aggrega-docs` in the
current directory, byte for byte as it was published.

## When the registry fails a write

The publication writes to the registry in steps — the file, the manifest that
names it, the tag, and then the publication date beside it — and each of those
writes is retried when the registry or the network fails it in a way a later
attempt can succeed, such as a server error, a timeout or a reset connection;
[`aggrega push`](aggrega-push.md#when-the-registry-fails-a-write) lists those
failures. A write is tried at most three times, half a second and then a second
apart, and each attempt is a new upload of the same bytes rather than a resend of
the request that failed, so a retried write lands what one attempt would have.

A write still failing after its last attempt fails the command, and the error
names the step. A failure to attach the date comes after the artifact has landed:
the artifact stays published, and the command exits non-zero saying its
publication date could not be attached.

## Offline

Publishing an artifact is a network round trip, so under the offline posture — the top-level `offline` key in a configuration file, `AGGREGA_OFFLINE`, or [`--offline`](global-flags.md#--offline) — this command refuses before it reads the file, and the refusal names which of those three set the posture. `--dry-run` keeps working, because it computes the reference and makes no call. To publish for one run from an offline workspace, pass `--offline=false`.

## See also

- [./aggrega-sign.md](./aggrega-sign.md) — a data artifact is signed after the fact, by reference;
  this command attaches no signature of its own.
- [./aggrega-serve.md](./aggrega-serve.md) — the daemon carries the same publication at
  `aggrega/publishArtifact`, so an editor can run it without leaving the session.
- [./aggrega-mcp.md](./aggrega-mcp.md) — the same capability as the `publish-artifact` tool, which an
  assistant can call. Read what that page says about allowing it before you do.
