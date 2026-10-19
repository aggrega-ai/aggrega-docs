/**
 * adapters/index.mjs — Construction of the content adapter the configuration
 * names.
 *
 * READS nothing and WRITES nothing: it selects a constructor by
 * `adapter.kind` and hands it the loaded project. The configuration schema
 * already refuses an unknown kind at load, so a kind reaching here is one this
 * package ships.
 */

import { createJsonContentAdapter } from './json-content/index.mjs';
import { createMarkdownAdapter } from './markdown/index.mjs';

const CONSTRUCTORS = {
  'json-content': createJsonContentAdapter,
  markdown: createMarkdownAdapter,
};

/** The adapter kinds this package ships. */
export const SUPPORTED_ADAPTERS = Object.freeze(Object.keys(CONSTRUCTORS));

/**
 * Builds the adapter for a loaded project.
 *
 * @param {Object} args
 * @param {import('../config.mjs').Project} args.project
 * @param {Object} [args.options]  forwarded to the constructor (fsImpl, now).
 */
export function createAdapter({ project, options = {} }) {
  const kind = project.config.adapter.kind;
  const construct = CONSTRUCTORS[kind];
  if (!construct) {
    throw new Error(`adapter.kind "${kind}" is not supported; supported: ${SUPPORTED_ADAPTERS.join(', ')}.`);
  }
  return construct({ project, ...options });
}

export default { createAdapter, SUPPORTED_ADAPTERS };
