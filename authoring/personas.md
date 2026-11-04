# Personas

Aggrega's authoring surface is split across four collaborating roles. Each role has a distinct concern, a distinct change cadence, and a distinct set of entity kinds it typically authors. Understanding which role you are wearing tells you which file to open and which pillars to fill.

The split is **guidance, not a rule the compiler enforces**. The core compiler is mathematically unopinionated: it accepts any authoring pattern that passes schema validation. You are free to collapse roles — a solo author routinely wears all four hats — or to cross a boundary when a situation calls for it. The roles exist to keep cognitive load low and concerns clear, not to build a prison. For the architectural treatment of this separation, see [Team Topologies and the Four Domains](../architecture/03-team-topologies-and-domains.md).

## The four roles

<figure class="diagram not-content">
<div class="diagram-canvas">
<div class="diagram-columns">
<div class="diagram-column">

Developer

application intent

<div class="diagram-group">
<div class="diagram-node diagram-node-file">

Aggregate

</div>
</div>
</div>
<div class="diagram-column">

Platform architect

the catalog contract

<div class="diagram-group">
<div class="diagram-node diagram-node-file">

Components

</div>
<div class="diagram-node diagram-node-file">

Features

</div>
</div>
</div>
<div class="diagram-column">

Platform operations

infrastructure recipes

<div class="diagram-group">
<div class="diagram-node diagram-node-file">

Recipes

</div>
<div class="diagram-node diagram-node-file">

FeatureRecipes

</div>
<div class="diagram-node diagram-node-file">

Plugins

provider-rendering

</div>
</div>
</div>
<div class="diagram-column">

Platform operator

per-environment wiring

<div class="diagram-group">
<div class="diagram-node diagram-node-file">

Manifests

</div>
<div class="diagram-node diagram-node-file">

Releases

</div>
</div>
</div>
</div>
</div>
<figcaption class="diagram-caption">

Who typically writes which files. The split is guidance, not a rule the compiler enforces: in a small team or a solo project, one person writes all of them.

</figcaption>
</figure>

### Developer — application intent

The developer authors the **Aggregate**: what the application is and what it needs, expressed as intent. The developer says "I need a database of this size and a service that uses it," not "provision an AWS RDS instance in this subnet." Physical infrastructure is deliberately left to the catalog and to operations, so the Aggregate stays capability-agnostic — the same intent compiles for a laptop, a cloud, or an enterprise cluster without the developer's file changing.

What the developer owns: the components the Aggregate declares, the `values` it supplies, the Features whose behaviour is application intent (with their `values`), the `parameters` it exposes for per-environment variation, and the `uses` edges that wire components together.

### Platform architect — the catalog contract

The architect authors **Components** and **Features**: the reusable, versioned contracts developers consume. A Component declares the values a developer may supply (as a JSON Schema), the outputs it provides to consumers, and the sockets it exposes for wiring. A Feature declares an attachable capability. The architect builds the "paved road" — the vending machine developers order from — and guarantees that what it dispenses is well-shaped.

What the architect owns: the `schema:` that validates developer values, the `provides` outputs, the `usesSchema` sockets, and the labels that carry semantic identity. Architects do not write physical infrastructure; they define the interface to it.

### Platform operations — infrastructure recipes

Operations authors **Recipes**, **FeatureRecipes**, and provider-rendering **Plugins**: the provider-specific translations that turn a catalog contract into rendered infrastructure. A Recipe maps a Component's declared values onto a concrete provider — Helm, Docker Compose, Terraform — without changing the developer-facing values the Component declares. A FeatureRecipe does the same for a Feature at binding time.

What operations owns: the templates that render provider-native output from the developer's `values` and the operator's `infra` sizing, and the `provides` values a Recipe pipes to consumers. Operations engineers reuse their existing infrastructure code by packaging it as Recipes; they are never required to learn a catalog-specific policy language.

### Platform operator — deployment wiring

The operator authors **Manifests** and **Releases**: the routing layer and the per-environment compilation input. A Manifest tells the compiler which Recipe realizes each Component for a given target, so the same Aggregate can hit different implementations across environments. A Release is the single compilation input — it points at the Aggregate and Manifest, fulfills the parameters the developer exposed, attaches the Features whose inputs are operational, sizes with `infra` the ones the developer attached, and wires edges of its own within the sockets the architect declared.

What the operator owns: the Manifest's routing map, the Release's parameter fulfillment, the `infra` sizing each component gets, the attachments of the Features whose inputs are operational, and the per-edge `infra` a Release writes on a connection. The operator fulfills the developer's exposed variation points; the Release cannot introduce new application values or new compute — those come only from the Aggregate.

## Roles are hats, not headcount

In a large enterprise these four roles are distinct departments with different expertise and different change frequencies — the catalog evolves when the platform team ships a new capability, Recipes evolve when infrastructure changes, Releases change per deployment. In a small team or a solo project, one person wears every hat. Because Components and Recipes are shareable, versioned artifacts, an author can often stay purely in the developer role and consume a pre-built catalog for everything else.

Read [Entities by Role](entities-by-role.md) next for the complete kind-to-role map, including the library and plugin kinds that support all four roles.
