---
example:
  level: advanced
  products: []
  shows: [cloud-infrastructure, parameters]
---

# Declared sensitivity, rendered as Terraform's own `sensitive`

A declaration that a value carries secret material is authored once, on a
Component's schema. Where the render target offers a matching primitive of its
own, that declaration renders into it. This example is the Terraform case: the
build appends an override file that adds `sensitive = true` to the module input
the declared value flows into, and the engine then redacts that value wherever it
would otherwise display it.

The example is deliberately small and every part of it is inspectable: one
component, three module inputs, and a rendered marking that names exactly one of
them.

## What the build emits

Under `dist/infra/terraform/`, the boundary's root configuration:

- `aggrega.modules.tf` — declaring `store` as a `module` block whose `source` is
  `./modules/store` and whose arguments are the module's resolved input
  variables, in deterministic key order. Every terraform boundary gets one.

Under `dist/infra/terraform/modules/store/`, the `store` component's own files:

- the module files copied **byte-for-byte** — `variables.tf` and `main.tf`,
  exactly as the module author wrote them;
- `aggrega_override.tf.json` — the sensitivity marking, described below. It sits
  beside the module's own files because Terraform merges an override into the
  configuration in its own directory;
- `aggrega.provenance.tf` — a `#`-comment file identifying the build (the JSON
  file cannot carry a comment, so provenance rides in its own file).

## The marking, and the two inputs it does not name

`example/storage/external-object-store` declares three `values` leaves. Two carry
public identifiers; one carries the credential and declares `sensitive: true`:

```yaml
values:
  bucket:            { type: string, required: true }
  access_key_id:     { type: string, required: true }
  secret_access_key: { type: string, required: true, sensitive: true }
```

The `module` block binds all three module inputs:

```hcl
module "store" {
  source = "./modules/store"

  access_key_id     = "AKIAEXAMPLE0001"
  bucket            = "app-artifacts"
  secret_access_key = "example-placeholder-not-a-real-credential"
}
```

and the appended override names exactly one:

```json
{
  "variable": {
    "secret_access_key": {
      "sensitive": true
    }
  }
}
```

Terraform merges a file named `override` or ending in `_override` into the
configuration in the same directory, so this file adds the attribute to the
module's existing `secret_access_key` declaration and leaves its type,
description and default as the module wrote them. Every vendored byte stays as
authored.

**The two inputs the override does not name are the point of the example.** The
marking follows the declaration and nothing else — not the name of a variable,
not the shape of its value. `access_key_id` is a credential *identifier* rather
than credential material, so it is not declared sensitive and it is not marked,
even though it sits beside the secret and its name reads like one. Remove
`sensitive: true` from the one leaf and rebuild: the override file is not
emitted at all.

## Seeing it work

`main.tf` keeps the public coordinates and the credential in separate attributes
of one resource, so a plan shows both directions at once. Plan the **boundary's
root configuration** — the directory holding `aggrega.modules.tf`, which is where
this deployment's values are:

```bash
cd dist/infra/terraform
tofu init && tofu plan     # or: terraform init && terraform plan
```

```text
  # module.store.terraform_data.reference will be created
  + resource "terraform_data" "reference" {
      [… omitted: an id attribute, reported as known only after apply]
      + input            = (sensitive value)
      [… omitted: an output attribute, reported as known only after apply]
      + triggers_replace = [
          + "app-artifacts",
          + "AKIAEXAMPLE0001",
        ]
    }
```

Your own plan carries those two attributes between the lines shown. They are
[marked as left out](../reading-the-output.md) rather than missing, so a line you
cannot account for is a real difference rather than something this page dropped.

The credential is redacted; the two public values beside it are not. Delete
`aggrega_override.tf.json` and re-run the plan to see the credential printed in
full — that difference is the whole of what the marking does. The marking lives
on the module's own `variable` block, so it travels with the module and applies
wherever that module is used.

**Run it at the root and not inside `modules/store/`.** A component's inputs are
the arguments of its `module` block, which sits one level up, so the component's
own directory is not a configuration you can plan as deployed. What the engine
does there depends on the module's own `variable` blocks, and only one of the two
answers is loud:

- This module declares all three of its inputs with no `default`, so a plan in
  `modules/store/` **fails** — `No value for required variable`, once per input,
  each naming its line and offering the `-var` / `-var-file` remedy.
- A module whose inputs **all** carry defaults would instead plan **successfully**
  there, from those defaults rather than from the values the root configuration supplies.
  Nothing warns. That is the case to know about, because a plan that looks right
  is describing a configuration nobody asked for.

## What the marking does not do

`sensitive` governs **display**. It stops a value being printed in plan and apply
output, and it stops Terraform placing that value into an output that is not
itself marked sensitive. It does **not** encrypt the value and it does not change
how the value is stored: after an apply the value is present in state in the
clear. Treat state as carrying the credential, whatever the marking says.

The marking also reaches a rendered input only when the input's identity comes
from a declaration. This Recipe declares a `source:` and no `valuesMapping:`, so
the argument names are the value leaf paths the Component declared and the join
is exact. A Recipe that declares a `valuesMapping:` invents its output names
inside a template, which no declaration names, so such a Recipe renders the same
values with **no marking** — the override file is absent rather than approximated.
Marking a name no declaration reaches would assert something untrue about a
public input, and the engine's own tooling would then hide a value that was never
secret.

## Why the credential is a module input here

A managed cloud database is usually the other case: the provider generates and
rotates the master password itself, so the module needs no credential input and
there is nothing to mark. This bucket is operated outside the deployment, so
there is no such provider to delegate to — the deployment holds an access key and
must pass it in. That is why this module declares a credential variable and the
managed-database modules in the standard library do not.

The module declares that variable **without** Terraform's `sensitive` attribute,
which is what makes the example legible: the attribute a reader sees applied at
render time came from the Component's declaration, not from the module.

## Files

- `aggregate.yaml` — developer intent: one `store` component of type
  `example/storage/external-object-store`, with the bucket named directly and
  both halves of the access key exposed as typed `parameters`.
- `release.yaml` — fulfils those parameters for this environment and sets the
  operator's `endpoint`. The values here are placeholders, not credentials for
  any real service.
- `manifest.yaml` — binds the component type to the Terraform Recipe
  `terraform/external-object-store`, which sources its module locally.
- `.aggrega-config.yaml` — names the hub registry the catalog entities resolve
  from.

Both credential halves are `parameters` rather than authored values because they
are values an operator supplies and differ per environment. A Release cannot
declare `values:`, so a typed parameter is the surface for exactly this: the
developer declares the variation point, the Release fulfils it.

## Build

```bash
aggrega build --release release.yaml --auto-pull
```

`--auto-pull` writes the lockfile a fresh clone lacks during the build.
