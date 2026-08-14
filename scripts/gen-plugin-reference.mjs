// Embedded-plugin reference generator.
//
// Turns the machine-readable listing emitted by `aggrega plugin list -o json`
// into a human-readable Markdown table under language-reference/plugins/. The
// page is committed so the documentation renders itself with no binary at
// site-build time — a reader can browse the plugins compiled into the CLI
// without running it.
//
// Usage:
//   node scripts/gen-plugin-reference.mjs
//   AGGREGA_BIN=/path/to/aggrega node scripts/gen-plugin-reference.mjs
//   AGGREGA_PLUGIN_OUT=/path/to/page.md node scripts/gen-plugin-reference.mjs
//
// The generator is deterministic: given the same binary it produces
// byte-identical output. The binary already sorts each plugin group, and this
// generator preserves that order and re-writes the page from scratch on every
// run, so no stale content survives.
//
// The page is generated — never hand-edit it. To change it, change what the
// binary emits and regenerate.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = process.env.AGGREGA_BIN || "aggrega";

// Repository root is the parent of this script's directory.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIR);

// Output file for the generated page. Defaults to the committed page under
// language-reference/plugins; set AGGREGA_PLUGIN_OUT to write the same bytes
// somewhere else instead. It names the FILE rather than a directory because this
// generator writes exactly one, unlike the schema reference's whole-tree
// override.
//
// Only the destination moves. The page is rendered from the binary's listing and
// reads nothing from whatever already sits at the output path, so redirecting it
// yields byte-identical content — which is what lets a drift check regenerate
// into a throwaway location and compare, without touching the committed page.
const OUT_FILE = process.env.AGGREGA_PLUGIN_OUT
  || join(REPO_ROOT, "language-reference", "plugins", "embedded-plugins.md");

function run(args) {
  return execFileSync(BIN, args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

// Collapses whitespace and escapes the pipe character so a value is safe to
// place inside a Markdown table cell. An empty value renders as an em dash so
// the column stays legible.
function cell(text) {
  const s = String(text ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > 0 ? s : "—";
}

// Joins a list into a single cell, or an em dash when the list is empty.
function listCell(items) {
  if (!Array.isArray(items) || items.length === 0) return "—";
  return cell(items.join(", "));
}

// The version cell prefers full provenance (version and commit) and falls back
// to whichever is present, mirroring how the binary renders it.
function versionCell(entry) {
  if (entry.error) return cell(`error: ${entry.error}`);
  const { commit } = entry;
  // Committed reference carries the clean, reproducible version; strip a
  // dev-tree `-dirty` suffix here so the page stays stable. The live
  // `aggrega plugin list` command stays honest about a dirty binary.
  const version = typeof entry.version === "string"
    ? entry.version.replace(/-dirty$/, "")
    : entry.version;
  if (version && commit) return cell(`${version} (commit ${commit})`);
  if (version) return cell(version);
  if (commit) return cell(`(commit ${commit})`);
  return "—";
}

function renderTable(entries) {
  const out = [];
  out.push("| Type | Name | Capabilities | Version |");
  out.push("| --- | --- | --- | --- |");
  for (const e of entries) {
    out.push(
      `| ${cell(e.type)} | \`${cell(e.uri)}\` | ${listCell(e.capabilities)} | ${versionCell(e)} |`
    );
  }
  return out.join("\n");
}

function renderPage(embedded) {
  const out = [];
  out.push("# Embedded plugins", "");
  out.push(
    "_Generated reference. Do not edit by hand — regenerate from the CLI's plugin listing._",
    ""
  );
  out.push(
    "Aggrega ships a set of provider and linter Wasm plugins compiled directly into the CLI binary. These embedded built-ins resolve with no filesystem, cache, or network access, so a fresh binary renders and lints out of the box. Each provider serves one or more render capabilities; a linter is cross-cutting and serves none. Run `aggrega plugin list` to see this set in your own binary, or `aggrega plugin list -o json` for the full per-plugin detail.",
    ""
  );

  if (embedded.length === 0) {
    out.push("_This binary embeds no plugins._", "");
  } else {
    out.push(renderTable(embedded), "");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function main() {
  const listing = JSON.parse(run(["plugin", "list", "-o", "json"]));
  const embedded = Array.isArray(listing.embedded) ? listing.embedded : [];

  // Created from the output path in force, so an override into a throwaway
  // location neither reads nor creates anything under the committed tree.
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const page = renderPage(embedded);
  writeFileSync(OUT_FILE, page, "utf-8");

  console.log(`Generated ${OUT_FILE} (${embedded.length} embedded plugins)`);
}

main();
