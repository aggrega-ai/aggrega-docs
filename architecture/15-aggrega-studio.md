# Aggrega Studio

This chapter describes Aggrega Studio — the visual frontend for the Aggrega ecosystem — through the architectural role Studio and similar frontends play relative to the Go compiler. Rather than reimplementing compiler internals in a frontend language, a frontend consumes a contract the Go compiler emits: the Intermediate Representation (IR) Graph. What a visual editor renders is a direct projection of what the compiler has already resolved; there is no parallel frontend re-implementation of YAML parsing, catalog resolution, or graph construction to drift from the Go reference.

## The IR Graph as the Universal Contract

After resolving the Aggregate, Manifest, and Release inputs through its pipeline, the Aggrega compiler produces a flat Intermediate Representation (IR) Graph capturing every node, edge, feature attachment, resolved annotation, and mapped value in the deployment. The IR Graph is the authoritative in-memory snapshot of what the compiler is about to render into physical artifacts.

The IR's object shape is frozen as a public schema — `ir-v1alpha1.schema.json` in the aggrega-schemas repo — which defines the structure of nodes, edges, feature mappings, secret references, and the other IR fields. Frontends write consumers against this schema as their type source.

By making the IR schema the single contract between compiler and frontend, the ecosystem has one place to evolve the shape: the schema. Frontends version-track the schema; they do not reimplement resolution logic in their own runtime. Visual editors and IDE integrations render what the Go compiler emits — the graph the developer sees is a deterministic projection of the JSON the compiler produced.

## JSON Lines Wire Format

The intended wire format for transporting the IR Graph from the compiler to frontends is JSON Lines (`.jsonl`) over `stdout`: one self-contained IR object per line, newline-terminated, with no outer array or framing envelope. Each line independently parses against `ir-v1alpha1.schema.json`. Stream consumers render graph objects incrementally as they arrive rather than waiting for a full document to close; producers emit objects as they are built, without holding the entire graph in memory.

Transport over `stdout` keeps integration simple across the frontend ecosystem: Unix pipes, Node.js `child_process.spawn`, language-client subprocess patterns, and `jq`-based ad-hoc tooling all consume `stdout` without protocol wrappers. Reversing this choice — moving to a non-streaming format, a binary wire format, or an HTTP server — would become expensive once frontends ship against the JSON-Lines contract, which is why the framing rule is set at the schema layer today even though the emission command is still landing.

*The headless-CLI stdout-streaming command that emits the IR Graph as newline-delimited JSON is under active development. The per-line IR schema is frozen today at `ir-v1alpha1.schema.json`; frontend authors can write consumers against this schema today. The stdout-emission CLI command will engage when it ships.*
