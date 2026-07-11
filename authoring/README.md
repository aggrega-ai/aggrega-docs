# Authoring Guide

This guide is the hands-on companion to the architecture chapters and the language reference. Where the architecture explains *why* Aggrega is shaped the way it is and the reference specifies *what* each field means, this guide teaches *how to sit down and author* — which entity you reach for, in which order, and how the CLI and an AI assistant help you get a correct file with the least friction.

The guide is written for two audiences at once: a person authoring by hand in an editor, and an AI assistant authoring on a person's behalf through the Model Context Protocol server. Both follow the same loop and read the same reference surfaces, so the pages below serve both.

## Read in this order

1. [Getting Started](getting-started.md) — the end-to-end authoring loop: pick your role, learn the shape, scaffold, fill, validate, build. Start here.
2. [Personas](personas.md) — the four collaborating authoring roles (developer, architect, operations, operator) and the guidance-not-enforcement framing behind them.
3. [Entities by Role](entities-by-role.md) — every entity kind mapped to the role that typically owns it, so you know which file each concern belongs in.
4. [Setup](setup.md) — install the `aggrega` binary and connect the authoring assistant to your MCP-capable client (Claude Desktop, Cursor, Windsurf, Cline).

## How the assistant surfaces relate to this guide

The `aggrega mcp` server exposes this guide, the language reference, and the JSON Schemas as resources an assistant reads before it writes YAML, plus tools that scaffold and validate entities. The assistant's built-in authoring prompts point back at these pages rather than restating them, so this guide is the single prose home for the authoring method. See [Getting Started](getting-started.md) for the loop and [Setup](setup.md) for the connection.
