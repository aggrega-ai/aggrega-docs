# Authoring Guide

This guide is the hands-on companion to the architecture chapters and the language reference. Where the architecture explains *why* Aggrega is shaped the way it is and the reference specifies *what* each field means, this guide teaches *how to sit down and author* — which entity you reach for, in which order, and how the CLI and an AI assistant help you get a correct file with the least friction.

The guide is written for two audiences at once: a person authoring by hand in an editor, and an AI assistant authoring on a person's behalf through the Model Context Protocol server. Both follow the same loop and read the same reference surfaces, so the pages below serve both.

## Read in this order

1. [Authoring Aggrega files](getting-started.md) — the end-to-end authoring loop: pick your role, learn the shape, draft, fill, validate, build. Start here.
2. [Personas](personas.md) — the four collaborating authoring roles (developer, architect, operations, operator) and the guidance-not-enforcement framing behind them.
3. [Entities by Role](entities-by-role.md) — every entity kind mapped to the role that typically owns it, so you know which file each concern belongs in.
4. [Install](../install.md) — install the `aggrega` binary, with the commands first; its connect section points to [Connect the MCP server](../ai-assistants/mcp-server.md).
5. [Use Aggrega in Visual Studio Code](editor/README.md) — the Aggrega extension for Visual Studio Code: what it needs, the welcome page, its panels and the topology graph, and every setting and command.

[Import](import/README.md) starts from a project you already have in another format and drafts these files from it, for you to review and build.

[Learn Aggrega](../learn.md) places this guide in a path through the whole documentation.

## Working with an AI assistant

1. [Set up Aggrega with your AI assistant](../ai-assistants/set-up.md) — one prompt to paste into an assistant that can run commands, so it installs Aggrega, adds the Aggrega skill and connects itself to the server.
2. [Connect the MCP server](../ai-assistants/mcp-server.md) — the server entry client by client, [where each client keeps it](../ai-assistants/mcp-server.md#where-each-client-keeps-its-server-list), a server reached over HTTPS, and how to check the connection.
3. [The Aggrega skill](../ai-assistants/skill.md) — the instructions an assistant loads for Aggrega: installing them and keeping them current.
4. [What your assistant can do with Aggrega](../ai-assistants/what-it-can-do.md) — what the connected server lets an assistant read, check, build and publish.

## How the assistant surfaces relate to this guide

The `aggrega mcp` server exposes this guide, the language reference, and the JSON Schemas as resources an assistant reads before it writes YAML, plus tools that draft and validate entities. The assistant's built-in authoring prompts point back at these pages rather than restating them, so this guide is the single prose home for the authoring method. See [Authoring Aggrega files](getting-started.md) for the loop and [Connect the MCP server](../ai-assistants/mcp-server.md) for the connection.
