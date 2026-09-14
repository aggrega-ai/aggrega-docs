# aggrega version

`aggrega version` prints the version of the `aggrega` CLI.

## Output

By default `aggrega version` prints a human-readable version line.

With `-o json` it emits a machine-readable object, indented two spaces, in the same shape every
`aggrega` command uses for its JSON output. Read it with a JSON parser; a consumer that matches on
the text instead should strip whitespace before matching, because the field names are the contract
and the surrounding layout is not.

```json
{
  "version": "1.2.3",
  "committed": "2026-07-09T18:07:57Z",
  "commit": "a1b2c3d",
  "abiVersion": "v1alpha1",
  "goVersion": "go1.23.0",
  "platform": "linux/amd64"
}
```

The fields come from the binary's embedded build metadata. `committed` is the commit timestamp, and
it is present only when the build recorded one. `abiVersion` is the plugin ABI version the binary
speaks, which a pipeline can read to check plugin compatibility without loading a plugin. A
development build that carries no embedded version reports a sentinel value (such as `(devel)`)
rather than failing.

## When to use `-o json`

- An editor extension compares the daemon's reported version against the version it was built for, to detect an incompatible `aggrega serve` binary before driving it.
- CI and provenance tooling record the exact compiler build that produced an artifact.

## See also

- [./aggrega-serve.md](./aggrega-serve.md) — the daemon whose version a client checks for compatibility.

<!-- BEGIN GENERATED: cli-version -->
**Synopsis**

```
aggrega version [flags]
```

**Description**

```
Print the aggrega CLI's build identity.

By default the output is a single human-readable line followed by a
one-line pointer to the plugins compiled into the binary. With
-o json, the output is a structured JSON object suitable for
programmatic consumption (the VS Code extension uses this form to
read the binary's version at activation time), in the same indented
shape every aggrega command's JSON output uses.

With --verbose, the output replaces the pointer line with a table of
the embedded plugins — type, name, served capabilities, and commit —
under a header naming the count and their shared version. With
--verbose -o json, the JSON object gains an embeddedPlugins array
carrying the same detail.

Version strings are v-less (1.0.0, not v1.0.0), homogeneous with the
version form catalog entities use. Tagged release builds report the
release version; source builds report the literal "(devel)".
Operators who see "(devel)" know they are running an unreleased
build.
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--output`, `-o` | `text` | Output format: text\|json. |
| `--verbose` | `false` | include the embedded-plugin set in the output |
<!-- END GENERATED: cli-version -->
