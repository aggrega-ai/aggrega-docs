# aggrega version

`aggrega version` prints the version of the `aggrega` CLI.

## Synopsis

```
aggrega version [--json]
```

## Output

By default `aggrega version` prints a human-readable version line.

With `--json` it emits a machine-readable object:

```json
{
  "version": "1.2.3",
  "commit": "a1b2c3d",
  "goVersion": "go1.23.0",
  "platform": "linux/amd64"
}
```

The fields come from the binary's embedded build metadata. A development build that carries no embedded version reports a sentinel value (such as `(devel)`) rather than failing.

## When to use `--json`

- An editor extension compares the daemon's reported version against the version it was built for, to detect an incompatible `aggrega serve` binary before driving it.
- CI and provenance tooling record the exact compiler build that produced an artifact.

## See also

- [./aggrega-serve.md](./aggrega-serve.md) — the daemon whose version a client checks for compatibility.

<!-- BEGIN GENERATED: cli-version -->
**Synopsis**

```
aggrega version [flags]
```

**Flags**

| Flag | Default | Description |
| --- | --- | --- |
| `--json` | `false` | emit a structured JSON object instead of the human-readable line |
| `--verbose` | `false` | include the embedded-plugin set in the output |
<!-- END GENERATED: cli-version -->
