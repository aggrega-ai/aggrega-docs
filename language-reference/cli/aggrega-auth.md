# aggrega auth

`aggrega auth` groups commands that deal with the **signing identity** — the OIDC identity token used by keyless signing. It is distinct from `aggrega login`, which stores registry username/password credentials: `auth` concerns who you are when you sign, `login` concerns how you reach a registry.

## aggrega auth token

`aggrega auth token` runs the interactive OIDC flow once and prints the raw identity token to stdout, so you can acquire an identity a single time and reuse it across a batch of keyless signs without a browser round-trip per artifact.

### Synopsis

```
aggrega auth token
```

### What it does

`aggrega auth token` opens a browser to complete the federated OIDC login (the same acquisition `aggrega sign` and `aggrega push` use when no token is supplied), then writes the resulting identity token to stdout and exits. The token is the value keyless signing presents to Fulcio for certificate issuance.

Only the token — followed by a single newline — is written to stdout. Any prompt or diagnostic goes to stderr, so command substitution captures the token alone:

```
export AGGREGA_IDENTITY_TOKEN=$(aggrega auth token)
```

With the token exported, each subsequent keyless `aggrega sign` (or `aggrega push --sign`) reuses it with no further browser interaction:

```
export AGGREGA_IDENTITY_TOKEN=$(aggrega auth token)
aggrega sign hub.example.com/component/core/api-server:1.0.0
aggrega sign hub.example.com/component/core/worker:1.0.0
```

This is the scripted counterpart to interactive batch signing: `aggrega sign <ref1> <ref2> ...` acquires the identity once in-process for the batch, while `aggrega auth token` exports it for use across separate invocations.

### Security

The identity token is short-lived and is **not persisted** by this command — printing it to stdout is your explicit choice, for your terminal and your export. It lives only where you put it (typically a shell environment variable for the duration of the session). If the token expires before a long batch finishes, re-run `aggrega auth token` to mint a fresh one.

## See also

- [./aggrega-sign.md](./aggrega-sign.md) — sign one or more artifacts; batch signing acquires the identity once.
- [./aggrega-push.md](./aggrega-push.md) — publish, optionally signing at push time.
- [environment-variables.md](environment-variables.md) — `AGGREGA_IDENTITY_TOKEN` and the other signing inputs.
