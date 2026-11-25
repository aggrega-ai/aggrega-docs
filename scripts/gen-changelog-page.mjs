// Changelog page generator.
//
// Renders changelog.md, the documentation's Changelog page, from the two
// changelog files the releases keep: the compiler's (aggrega-cli) and the
// catalog's (aggrega-hub).
//
// Usage:
//   node scripts/gen-changelog-page.mjs <aggrega-cli CHANGELOG.md> <aggrega-hub CHANGELOG.md> <output>
//
// The first file must exist. The second may be absent: the page then says no
// catalog release is listed yet. Aggrega releases are listed from 0.9.0 on,
// final releases only; the page links to the full file for earlier ones.
// Catalog releases are all listed.
//
// A changelog file holds releases in this shape: `## [X.Y.Z] - YYYY-MM-DD` for
// the compiler (X.Y.Z may carry a pre-release suffix), `## [YYYY.MM.DD] -
// YYYY-MM-DD` (with an optional `.N`) for the catalog, then groups `### Added`,
// `### Changed`, `### Deprecated`, `### Removed`, `### Fixed` or `### Security`
// holding one-line `- ` entries. The generator refuses (exit 1, naming the file
// and line) a file holding an HTML comment, a release or group heading outside
// that shape, or text that is neither an entry nor a heading. Exit 2 is an
// invocation error: the wrong arguments or an unreadable first file.
//
// The page is generated, never hand-edited: change the changelog files and
// regenerate. Given the same inputs the output is byte-identical: the page
// follows the files' order and sorts nothing.
//
// A release heading is written as an HTML heading holding inline code, with its
// version as its identifier: the translation adapter makes a segment of every
// Markdown heading, even one holding only inline code, and leaves an HTML block
// as it is, so a version and its date read the same in every language, add
// nothing to translate, and keep the same anchor in each.
//
// Node built-ins only.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const FULL_FILE = "https://github.com/aggrega-ai/aggrega-cli/blob/main/CHANGELOG.md";
const GROUPS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];
const CLI_HEADING = /^## \[(([0-9]+)\.([0-9]+)\.[0-9]+(-[0-9A-Za-z.]+)?)\] - ([0-9]{4}-[0-9]{2}-[0-9]{2})$/;
const HUB_HEADING = /^## \[([0-9]{4}\.[0-9]{2}\.[0-9]{2}(?:\.[0-9]+)?)\] - ([0-9]{4}-[0-9]{2}-[0-9]{2})$/;
const SHAPE = "## [X.Y.Z] - YYYY-MM-DD or ## [YYYY.MM.DD] - YYYY-MM-DD";

const INTRODUCTION =
  "This page lists the changes of each Aggrega release (the compiler, its documentation, its editor extension and its plugin libraries) and of each catalog release.";
const NO_CATALOG = "No catalog release is listed yet.";
const CLOSING = `Earlier releases are in the [full changelog](${FULL_FILE}).`;

class Refusal extends Error {}

// Reads one changelog file into its releases, in file order: { match, groups },
// `match` being the release heading's match of `headingPattern`, each group
// { name, entries }.
function parse(file, text, headingPattern) {
  const releases = [];
  let release;
  let group;
  const refuse = (n, message) => {
    throw new Refusal(`${file}:${n}: ${message}`);
  };
  text.split("\n").forEach((line, i) => {
    const n = i + 1;
    if (line.includes("<!--")) refuse(n, `HTML comment ("<!--") is not allowed in a changelog file: ${line.slice(0, 90)}`);
    if (line.startsWith("## ")) {
      const match = headingPattern.exec(line);
      if (!match) refuse(n, `version heading is not "${SHAPE}": ${line}`);
      release = { match, groups: [] };
      releases.push(release);
      group = undefined;
      return;
    }
    if (!release) return; // the preamble
    if (line.startsWith("### ")) {
      const name = line.slice(4);
      if (!GROUPS.includes(name)) refuse(n, `group heading is not one of ${GROUPS.join(", ")}: ${line}`);
      group = { name, entries: [] };
      release.groups.push(group);
      return;
    }
    if (line.startsWith("#")) refuse(n, `heading outside the released shape: ${line}`);
    if (line.trim() === "") return;
    if (line.startsWith("- ") && group) {
      group.entries.push(line);
      return;
    }
    refuse(n, `text that is not an entry or a heading: ${line.slice(0, 90)}`);
  });
  return releases;
}

// One release as page text: its level-3 heading, then each group.
function render(version, date, groups) {
  const lines = [`<h3 id="${version}"><code>${version} - ${date}</code></h3>`, ""];
  for (const { name, entries } of groups) {
    lines.push(`#### ${name}`, "", ...entries, "");
  }
  return lines;
}

// A compiler release the page lists: 0.9.0 or later, not a pre-release.
function listed({ match }) {
  const [, , major, minor, prerelease] = match;
  return prerelease === undefined && (Number(major) > 0 || Number(minor) >= 9);
}

function main(argv) {
  if (argv.length !== 3) {
    console.error("Usage: node gen-changelog-page.mjs <aggrega-cli CHANGELOG.md> <aggrega-hub CHANGELOG.md> <output>");
    return 2;
  }
  const [cliFile, hubFile, out] = argv;
  if (!existsSync(cliFile)) {
    console.error(`gen-changelog-page: ${cliFile} does not exist`);
    return 2;
  }
  let cliReleases;
  let hubReleases = [];
  try {
    cliReleases = parse(cliFile, readFileSync(cliFile, "utf-8"), CLI_HEADING);
    if (existsSync(hubFile)) hubReleases = parse(hubFile, readFileSync(hubFile, "utf-8"), HUB_HEADING);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(error.message);
    return 1;
  }

  const page = [
    "<!-- Generated by scripts/gen-changelog-page.mjs from the changelog files of the compiler and the catalog; do not edit. -->",
    "",
    "# Changelog",
    "",
    INTRODUCTION,
    "",
    "## Aggrega releases",
    "",
  ];
  for (const release of cliReleases.filter(listed)) {
    const [, version, , , , date] = release.match;
    page.push(...render(version, date, release.groups));
  }
  page.push(CLOSING, "", "## Catalog releases", "");
  if (hubReleases.length === 0) {
    page.push(NO_CATALOG, "");
  } else {
    for (const release of hubReleases) {
      page.push(...render(release.match[1], release.match[2], release.groups));
    }
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page.join("\n").replace(/\n+$/, "\n"));
  return 0;
}

process.exit(main(process.argv.slice(2)));
