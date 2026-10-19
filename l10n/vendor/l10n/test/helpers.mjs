/**
 * helpers.mjs — Test helpers shared by the package's own tests.
 *
 * READS the fixture projects under `test/fixtures/project/` and
 * `test/fixtures/markdown/`, and the runnable examples under `examples/`. WRITES
 * only into the temporary directories it creates
 * (and the caller removes): a test never writes inside the package. Every client
 * here is a fake that makes no network call; `no-network.mjs` refuses any that a
 * test would make. The git sandbox runs git against repositories in its own
 * temporary directory only, with its own empty global configuration and no
 * system configuration, so a test never reads or writes the developer's.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The fixture project, located from this file: the one sanctioned use of the module's own URL. */
export const FIXTURE_PROJECT = fileURLToPath(new URL('./fixtures/project/', import.meta.url));

/** The Markdown fixture project: a small documentation corpus and its configuration. */
export const FIXTURE_MARKDOWN = fileURLToPath(new URL('./fixtures/markdown/', import.meta.url));

/** The runnable examples the package ships, one directory per example. */
export const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));

/** Copies the example `name` (a directory under `examples/`) into a fresh temporary directory and returns its path. */
export function copyExample(name, prefix = `l10n-example-${name}-`) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(path.join(EXAMPLES, name), dir, { recursive: true });
  return dir;
}

/** Copies the fixture project into a fresh temporary directory and returns its path. */
export function copyFixtureProject(prefix = 'l10n-project-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(FIXTURE_PROJECT, dir, { recursive: true });
  return dir;
}

/** Copies the Markdown fixture project into a fresh temporary directory and returns its path. */
export function copyMarkdownFixture(prefix = 'l10n-markdown-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(FIXTURE_MARKDOWN, dir, { recursive: true });
  return dir;
}

/** Reads and parses the fixture project's configuration file. */
export function fixtureConfig() {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_PROJECT, 'l10n.config.json'), 'utf8'));
}

/** Writes a JSON value to `file`, creating its directory. */
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/**
 * Wraps node:fs so every path read or listed is recorded in `reads`, in order.
 * Writes pass through unrecorded. Lets a test assert what a command looked at
 * before it stopped.
 */
export function recordingFs(base = fs) {
  const reads = [];
  const record = (fn) => (p, ...rest) => {
    reads.push(String(p));
    return fn.call(base, p, ...rest);
  };
  return {
    reads,
    fsImpl: {
      ...base,
      readFileSync: record(base.readFileSync),
      readdirSync: record(base.readdirSync),
      existsSync: record(base.existsSync),
    },
  };
}

/**
 * Wraps node:fs so that writing `file` fails, as a full disk or a permission
 * error would: a write of the file itself or of the temporary file the store's
 * atomic write puts beside it throws an error carrying `code`, whose message
 * carries `message`. Every other read and write passes through. `when`, given
 * the text being written, narrows the fault to some writes of the file; the text
 * of each refused write is recorded in `refused`.
 *
 * @param {Object} args
 * @param {string} args.file
 * @param {string} [args.code]
 * @param {string} [args.message]
 * @param {(data:string)=>boolean} [args.when]
 */
export function failingWrites({ file, code = 'ENOSPC', message = 'no space left on device', when = () => true, base = fs }) {
  const refused = [];
  return {
    refused,
    fsImpl: {
      ...base,
      writeFileSync(target, data, ...rest) {
        const name = String(target);
        if ((name === file || name.startsWith(`${file}.tmp-`)) && when(String(data))) {
          refused.push(String(data));
          const err = new Error(`${code}: ${message}, write '${name}'`);
          err.code = code;
          throw err;
        }
        return base.writeFileSync.call(base, target, data, ...rest);
      },
    },
  };
}

/** A fake backend that records every call and "translates" by prefixing the locale. No network. */
export function recordingBackend() {
  const calls = [];
  return {
    calls,
    async translate({ items, lang }) {
      calls.push({ lang, ids: items.map((it) => it.srcHash) });
      const translations = {};
      for (const it of items) translations[it.srcHash] = `[${lang}] ${it.source}`;
      return { translations, model: 'fake-model' };
    },
  };
}

/**
 * The request a Messages API parameter object carries: the user message's two
 * JSON parts, the page and what the request asks for, read as one object.
 */
export function requestBody(params) {
  return Object.assign({}, ...params.messages[0].content.map((block) => JSON.parse(block.text)));
}

/** A reply message carrying `entries` in the output format. */
export function replyMessage(entries, extra = {}) {
  return {
    type: 'message',
    role: 'assistant',
    stop_reason: 'end_turn',
    stop_details: null,
    content: [{ type: 'text', text: JSON.stringify({ translations: entries }) }],
    ...extra,
  };
}

/** A refused reply. */
export function refusalMessage(category = 'cyber') {
  return { type: 'message', role: 'assistant', stop_reason: 'refusal', stop_details: { type: 'refusal', category, explanation: null }, content: [] };
}

/**
 * The fake model: translates each requested segment of a request as
 * `[<model>] <source>`, which keeps every tag, protected span and term.
 */
export function echoReply(params) {
  const body = requestBody(params);
  const sources = new Map(body.segments.map((s) => [s.id, s.source]));
  return replyMessage(body.translate.map((id) => ({ id, text: `[${params.model}] ${sources.get(id)}` })));
}

/**
 * A fake Anthropic SDK client class, for `runCli({ ClientClass })` and the client
 * factory. It records every construction and call and makes no network call.
 * Its default behaviour is a consistent fake API: `messages.create` answers with
 * `echoReply`; `batches.create` records the batch; `retrieve` reports it ended;
 * `results` yields one succeeded line per recorded request, answered by `reply`,
 * in the order `order` gives (default: the requests' own); `cancel` answers
 * that the batch is `canceling`.
 *
 * @param {Object} [behaviour]
 * @param {(params:Object)=>Object} [behaviour.reply]       the message a request gets.
 * @param {(params:Object)=>Object} [behaviour.result]      the batch result a request gets (default: succeeded with `reply`).
 * @param {(lines:Array)=>Array} [behaviour.order]          reorders the result lines.
 * @param {string|((id:string)=>string)} [behaviour.status] the batch's processing_status (default `ended`),
 *                                                          or a function of the batch id read at each retrieval.
 * @param {(id:string)=>Object} [behaviour.cancel]          what a cancellation answers, or throws (default: `canceling`).
 */
export function fakeAnthropic({ reply = echoReply, result, order = (lines) => lines, status = 'ended', cancel } = {}) {
  const statusOf = typeof status === 'function' ? status : () => status;
  const constructed = [];
  const calls = { create: [], batchCreate: [], retrieve: [], results: [], cancel: [] };
  const batches = new Map();
  let counter = 0;
  class FakeAnthropic {
    constructor(options) {
      constructed.push(options);
      this.messages = {
        create: async (params) => {
          calls.create.push(params);
          return reply(params);
        },
        batches: {
          create: async (body) => {
            calls.batchCreate.push(body);
            counter += 1;
            const id = `msgbatch_fake${counter}`;
            batches.set(id, body);
            return { id, type: 'message_batch', processing_status: 'in_progress', created_at: `2026-10-16T00:00:0${counter}Z` };
          },
          retrieve: async (id) => {
            calls.retrieve.push(id);
            const processing = statusOf(id);
            return { id, type: 'message_batch', processing_status: processing, request_counts: { processing: processing === 'ended' ? 0 : 1 } };
          },
          results: async (id) => {
            calls.results.push(id);
            const body = batches.get(id) || { requests: [] };
            const lines = body.requests.map((r) => ({
              custom_id: r.custom_id,
              result: result ? result(r.params, r) : { type: 'succeeded', message: reply(r.params) },
            }));
            return (async function* stream() {
              for (const line of order(lines)) yield line;
            })();
          },
          cancel: async (id) => {
            calls.cancel.push(id);
            if (cancel) return cancel(id);
            return { id, type: 'message_batch', processing_status: 'canceling' };
          },
        },
      };
    }
  }
  return { FakeAnthropic, constructed, calls, batches };
}

/**
 * A temporary directory for git repositories, with the environment every git
 * process in it runs with: `HOME` and `GIT_CONFIG_GLOBAL` inside the directory
 * (the global file empty), `GIT_CONFIG_NOSYSTEM=1`, the identity in
 * `GIT_AUTHOR_*` and `GIT_COMMITTER_*`, and the C locale.
 *
 * @param {string} [prefix]
 * @returns {{dir:string, env:Object, git:(args:string[], cwd?:string)=>string, cleanup:()=>void}}
 *          `git` runs one command and returns its trimmed output, throwing on a non-zero exit.
 */
export function gitSandbox(prefix = 'l10n-git-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const home = path.join(dir, 'home');
  fs.mkdirSync(home);
  const globalConfig = path.join(home, 'gitconfig');
  fs.writeFileSync(globalConfig, '');
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Translation CI',
    GIT_AUTHOR_EMAIL: 'ci@example.test',
    GIT_COMMITTER_NAME: 'Translation CI',
    GIT_COMMITTER_EMAIL: 'ci@example.test',
    LANG: 'C',
    LC_ALL: 'C',
  };
  const git = (args, cwd = dir) => {
    const res = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed (exit ${res.status}): ${res.stderr}`);
    return res.stdout.trim();
  };
  return { dir, env, git, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Collects what a command prints, for `runCli`'s `log` and `errlog`. */
export function capture() {
  const out = [];
  const err = [];
  return {
    out,
    err,
    log: (...a) => out.push(a.join(' ')),
    errlog: (...a) => err.push(a.join(' ')),
    text: () => out.join('\n'),
    errors: () => err.join('\n'),
  };
}
