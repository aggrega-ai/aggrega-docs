// Documentation versions are published side by side. The latest version is
// served at the unversioned /docs path; every other version is served under a
// version-prefixed path such as /docs/v0.1. This module derives the base path
// and the "is this the latest version" flag for a single build from the
// environment, so the same source tree can be built once per version.
//
// Environment inputs:
//   DOCS_VERSION    A version label such as "v0.1". Unset or "latest" means the
//                   unversioned latest build.
//   DOCS_IS_LATEST  Optional override of the latest flag ("true"/"1" or
//                   "false"/"0"). When unset, a build is the latest exactly when
//                   DOCS_VERSION is unset or "latest".
//
// With no environment set, the resolver yields base "/docs" and isLatest true,
// which is the default single-version build.

const SITE = "https://aggrega.ai";
const LATEST_BASE = "/docs";

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

  const base = version === "latest" ? LATEST_BASE : `${LATEST_BASE}/${version}`;

  return { version, isLatest, base, latestBase: LATEST_BASE, site: SITE };
}
