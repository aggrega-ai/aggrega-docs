// Documentation versions are published side by side, one per minor version.
// The latest version is served at the unversioned /docs path; every version is
// served under a version-prefixed path such as /docs/v0.8. This module
// derives, for a single build, the version label, the "is this the latest
// version" flag and the base path from the environment, so the same source tree
// can be built once per version.
//
// Environment inputs:
//   DOCS_VERSION    The version label, such as "v0.1". Unset or "latest" means a
//                   build with no version label, served at /docs.
//   DOCS_IS_LATEST  Whether this build is the latest version ("true"/"1" or
//                   "false"/"0"). The latest version is served at /docs and every
//                   other version at /docs/<label>. When unset, a build is the
//                   latest exactly when DOCS_VERSION is unset or "latest".
//
// With no environment set, the resolver yields base "/docs" and isLatest true,
// which is the default single-version build.
//
// The list of published versions is not part of any build: it is one file,
// /docs/versions.json, served with the latest version and read in the browser by
// the version selector, so an older version's pages never change because a
// newer version was published or a version was withdrawn.

const SITE = "https://aggrega.ai";
const LATEST_BASE = "/docs";

/** Where the list of published versions is served, on the same origin as every version. */
export const VERSIONS_PATH = `${LATEST_BASE}/versions.json`;

function isTruthy(value) {
  return value === "true" || value === "1";
}

function isFalsy(value) {
  return value === "false" || value === "0";
}

export function resolveVersioning(env = process.env) {
  const raw = (env.DOCS_VERSION || "").trim();
  const version = raw === "" || raw === "latest" ? "latest" : raw;

  const override = (env.DOCS_IS_LATEST || "").trim();
  let isLatest = version === "latest";
  if (isTruthy(override)) isLatest = true;
  else if (isFalsy(override)) isLatest = false;

  if (!isLatest && version === "latest") {
    throw new Error("A build that is not the latest version needs its version label in DOCS_VERSION.");
  }
  const base = isLatest ? LATEST_BASE : `${LATEST_BASE}/${version}`;

  return { version, isLatest, base, latestBase: LATEST_BASE, site: SITE };
}
