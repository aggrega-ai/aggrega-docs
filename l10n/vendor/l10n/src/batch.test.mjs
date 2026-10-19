import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { InternalServerError } from '@anthropic-ai/sdk';

import { runCli } from './cli.mjs';
import { selectWithinBudget } from './batch.mjs';
import { CUSTOM_ID_PATTERN } from './pending.mjs';
import { keyOf } from './normalize.mjs';
import { DEFAULT_MODEL } from './config.mjs';
import { networkAttempts } from '../test/no-network.mjs';
import { capture, copyFixtureProject, echoReply, failingWrites, fakeAnthropic, refusalMessage, replyMessage, requestBody, writeJson } from '../test/helpers.mjs';

let project;
let configPath;

beforeEach(() => {
  project = copyFixtureProject();
  configPath = path.join(project, 'l10n.config.json');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

const memory = (...p) => path.join(project, 'memory', ...p);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

async function run(argv, deps = {}) {
  const io = capture();
  const code = await runCli(argv, { cwd: project, env: { ANTHROPIC_API_KEY: 'test-key' }, log: io.log, errlog: io.errlog, ...deps });
  return { code, out: io.text(), err: io.errors() };
}

function editConfig(mutate) {
  const cfg = readJson(configPath);
  mutate(cfg);
  writeJson(configPath, cfg);
}

/** Every file under the project with its bytes, for before/after comparisons. */
function snapshot(dir = project) {
  const out = {};
  for (const rel of fs.readdirSync(dir, { recursive: true })) {
    const abs = path.join(dir, rel);
    if (fs.statSync(abs).isFile()) out[rel] = fs.readFileSync(abs).toString('base64');
  }
  return out;
}

/** The fixture's missing units after extract: every unit but the one the human layer carries. */
const HOME_MISSING = ['Benvenuti', 'Una pagina di prova', 'Scopri', 'Primo paragrafo.'].map(keyOf);
const UI_MISSING = ['Torna su', 'Menu'].map(keyOf);

describe('submit: the gate, the budget and the in-progress refusal', () => {
  it('a gate with no work makes no client call', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const units = readJson(memory('source.json')).units;
    writeJson(memory('messages', 'en.json'), Object.fromEntries(Object.keys(units).map((k) => [k, { text: 'x', status: 'seed', srcHash: k }])));
    const fake = fakeAnthropic();
    const r = await run(['submit'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(0);
    expect(r.out).toContain('submit: no translation needed: no batch created, no network call.');
    expect(fake.constructed).toHaveLength(0);
    expect(fs.existsSync(memory('pending.json'))).toBe(false);
  });

  it('--dry-run builds the requests and prints per locale the page count and the estimates, making no client call and writing no file', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const before = snapshot();
    const fake = fakeAnthropic();
    const r = await run(['submit', '--dry-run'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(0);
    const perLocale = r.out.match(/^ {2}en: 2 pages, 2 requests, estimated input (\d+) tokens \((\d+) cached, (\d+) uncached\), estimated output \d+ tokens$/m);
    expect(perLocale).not.toBeNull();
    expect(Number(perLocale[2]) + Number(perLocale[3])).toBe(Number(perLocale[1]));
    // The first request reads nothing from the cache: no earlier request wrote an entry.
    expect(r.out).toMatch(/^ {2}request 1: content\/it\/home\.json \(en\): estimated input (\d+) \(0 cached, \1 uncached\), output \d+$/m);
    expect(r.out).toContain('submit --dry-run: no batch created, no file written.');
    expect(fake.constructed).toHaveLength(0);
    expect(snapshot()).toEqual(before);
  });

  it('reports the cached and uncached input of a page split into sections with only the system prompt cacheable, sends one cache marker per request on the last system block, and counts each request’s whole input against the budget', async () => {
    // 28 is the home page's largest section, seo ("Benvenuti", "Una pagina di prova"): the page splits and no section is divided.
    editConfig((c) => (c.backend.sectionTokens = 28));
    expect((await run(['extract'])).code).toBe(0);
    const dry = await run(['submit', '--dry-run']);
    expect(dry.code).toBe(0);
    const lines = [...dry.out.matchAll(/^ {2}request (\d+): (\S+)(?: § (\S+))? \(en\): estimated input (\d+) \((\d+) cached, (\d+) uncached\), output \d+$/gm)].map(
      ([, , page, section, input, cached, uncached]) => ({ page, section, input: Number(input), cached: Number(cached), uncached: Number(uncached) })
    );
    // The home page splits into three sections with work; the UI dictionary, within the budget, is one request.
    expect(lines.map((l) => [l.page, l.section])).toEqual([
      ['content/it/home.json', 'seo'],
      ['content/it/home.json', 'blocks[0]'],
      ['content/it/home.json', 'blocks[1]'],
      ['ui/it.json', undefined],
    ]);
    for (const l of lines) expect(l.cached + l.uncached).toBe(l.input);
    const heading = dry.out.match(/^submit --dry-run: 4 request\(s\), estimated input (\d+) tokens \((\d+) cached, (\d+) uncached\),/m);
    expect(heading.slice(1).map(Number)).toEqual([
      lines.reduce((n, l) => n + l.input, 0),
      lines.reduce((n, l) => n + l.cached, 0),
      lines.reduce((n, l) => n + l.uncached, 0),
    ]);

    // The batch: exactly one cache marker per request, on the last system block, and none in the user message.
    const fake = fakeAnthropic();
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    const sent = fake.calls.batchCreate[0].requests.map((q) => q.params);
    for (const params of sent) {
      const markers = [...params.system, ...params.messages[0].content].filter((block) => 'cache_control' in block);
      expect(markers).toEqual([params.system[params.system.length - 1]]);
      expect(markers[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    }
    // So the first request reads nothing, and every later one reads the system prompt alone, the split page's included.
    const systemTokens = sent[0].system.reduce((n, block) => n + Buffer.byteLength(block.text, 'utf8'), 0);
    expect(lines.map((l) => l.cached)).toEqual([0, systemTokens, systemTokens, systemTokens]);

    // The budget counts the whole input: room for the first two requests' whole estimates takes exactly two,
    // although the first three would fit if the cached shares were subtracted.
    editConfig((c) => (c.backend.submission = { inputTokens: lines[0].input + lines[1].input, outputTokens: 1e9 }));
    expect(lines[2].uncached).toBeLessThan(lines[1].cached);
    const capped = await run(['submit', '--dry-run']);
    expect(capped.out).toMatch(/^submit --dry-run: 2 request\(s\), .*; 2 request\(s\) left for the next submission\.$/m);
  });

  it('resubmits only the refused segments of a split page’s section, with the context the section’s first request carried', async () => {
    // The home page's largest section, seo, is 28 estimated tokens: the page splits and no section is divided.
    editConfig((c) => (c.backend.sectionTokens = 28));
    // A fresh memory: no segment of the page is translated before the first request.
    writeJson(memory('messages', 'en.json'), {});
    expect((await run(['extract'])).code).toBe(0);
    const refused = keyOf('Una pagina di prova');
    // Every segment comes back faithful except one of the seo section's two, returned empty.
    const reply = (params) => {
      const echoed = JSON.parse(echoReply(params).content[0].text).translations;
      return replyMessage(echoed.map((e) => (e.id === refused ? { id: e.id, text: '' } : e)));
    };
    const fake = fakeAnthropic({ reply });
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    expect(Object.keys(readJson(memory('pending.json')).queue.en)).toEqual([refused]);

    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    const firstSeo = fake.calls.batchCreate[0].requests.map((q) => q.params).find((p) => requestBody(p).section === 'seo');
    const resent = fake.calls.batchCreate[1].requests.map((q) => q.params);
    expect(resent).toHaveLength(1);
    const [again] = resent;
    // Exactly the refused identifier, with its defect stated.
    expect(JSON.parse(again.messages[0].content[1].text)).toEqual({ section: 'seo', translate: [refused], corrections: { [refused]: 'the translation is empty' } });
    // The context, byte for byte the seo request's first: the outline, the seo section and the section after it.
    expect(again.messages[0].content[0].text).toBe(firstSeo.messages[0].content[0].text);
    const context = JSON.parse(again.messages[0].content[0].text);
    expect(Object.keys(context)).toEqual(['page', 'outline', 'segments']);
    expect(context.outline).toEqual([{ section: 'seo' }, { section: 'blocks[0]' }, { section: 'blocks[1]' }]);
    expect(context.segments.map((s) => s.source)).toEqual(['Benvenuti', 'Una pagina di prova', 'Ciao mondo', 'Scopri']);
    // The round's accepted translations are in the memory, and none is added to the context.
    expect(readJson(memory('machine', 'en.json'))[keyOf('Benvenuti')]).toBeDefined();
    expect(context.segments.every((s) => !('translation' in s))).toBe(true);
  });

  it('queues only the segment a reply returned twice with different texts, and accepts the one returned twice with the same text and every other', async () => {
    writeJson(memory('messages', 'en.json'), {});
    expect((await run(['extract'])).code).toBe(0);
    const twiceSame = keyOf('Benvenuti');
    const twiceDifferent = keyOf('Una pagina di prova');
    const reply = (params) => {
      const echoed = JSON.parse(echoReply(params).content[0].text).translations;
      const extra = echoed.flatMap((e) =>
        e.id === twiceSame ? [{ ...e }] : e.id === twiceDifferent ? [{ id: e.id, text: `${e.text} (again)` }] : []
      );
      return replyMessage([...echoed, ...extra]);
    };
    const fake = fakeAnthropic({ reply });
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    const queue = readJson(memory('pending.json')).queue.en;
    expect(Object.keys(queue)).toEqual([twiceDifferent]);
    expect(queue[twiceDifferent]).toEqual({ attempts: 1, defect: 'this identifier was returned 2 times with different texts; return it exactly once' });
    const machine = readJson(memory('machine', 'en.json'));
    expect(machine[twiceSame]).toBeDefined();
    expect(machine[twiceDifferent]).toBeUndefined();
  });

  it('submits only the requests that fit the budgets, in their stable order, and leaves the rest for the next submission', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const dry = await run(['submit', '--dry-run']);
    const [, input, output] = dry.out.match(/request 1: content\/it\/home\.json \(en\): estimated input (\d+) \(\d+ cached, \d+ uncached\), output (\d+)/);
    editConfig((c) => (c.backend.submission = { inputTokens: Number(input), outputTokens: Number(output) }));

    const fake = fakeAnthropic();
    const r = await run(['submit'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 request(s) left for the next submission');
    expect(fake.calls.batchCreate).toHaveLength(1);
    expect(fake.calls.batchCreate[0].requests.map((q) => requestBody(q.params).page)).toEqual(['content/it/home.json']);
    expect(Object.values(readJson(memory('pending.json')).batches[0].requests).map((q) => q.ids)).toEqual([HOME_MISSING]);

    // The next submission, once the first is collected, takes the request left over.
    expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    expect(fake.calls.batchCreate[1].requests.map((q) => requestBody(q.params).page)).toEqual(['ui/it.json']);
  });

  it('refuses when even the first request does not fit, creating no batch', async () => {
    expect((await run(['extract'])).code).toBe(0);
    editConfig((c) => (c.backend.submission = { inputTokens: 10, outputTokens: 10 }));
    const fake = fakeAnthropic();
    const r = await run(['submit'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(1);
    expect(r.err).toContain('submit: the first request, content/it/home.json (en), is estimated at');
    expect(fake.constructed).toHaveLength(0);
    expect(fs.existsSync(memory('pending.json'))).toBe(false);
  });

  it('refuses to submit while a recorded batch has not been collected', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic({ status: 'in_progress' });
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    const pendingBefore = fs.readFileSync(memory('pending.json'));
    const constructedBefore = fake.constructed.length;

    const r = await run(['submit'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(1);
    expect(r.err).toContain('submit: batch msgbatch_fake1 is recorded and not yet collected; run `l10n collect` first.');
    expect(fake.constructed).toHaveLength(constructedBefore);
    expect(fake.calls.batchCreate).toHaveLength(1);
    expect(fs.readFileSync(memory('pending.json')).equals(pendingBefore)).toBe(true);
  });

  it('a missing prompt file for a configured locale makes submit exit non-zero naming the file', async () => {
    expect((await run(['extract'])).code).toBe(0);
    fs.rmSync(memory('prompts', 'en.md'));
    const fake = fakeAnthropic();
    const r = await run(['submit'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(2);
    expect(r.err).toContain(`${memory('prompts', 'en.md')}: the per-language prompt file for "en" is missing`);
    expect(fake.constructed).toHaveLength(0);
  });

  it('records each request’s mapping — custom identifier to page, locale, segments and attempt — in the pending file', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic();
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    const [batch] = readJson(memory('pending.json')).batches;
    expect(batch.id).toBe('msgbatch_fake1');
    const sent = fake.calls.batchCreate[0].requests.map((q) => q.custom_id);
    expect(Object.keys(batch.requests)).toEqual(sent);
    for (const id of sent) expect(id).toMatch(CUSTOM_ID_PATTERN);
    expect(Object.values(batch.requests)).toEqual([
      { page: 'content/it/home.json', section: null, lang: 'en', ids: HOME_MISSING, attempt: 1, model: DEFAULT_MODEL, fallback: false },
      { page: 'ui/it.json', section: null, lang: 'en', ids: UI_MISSING, attempt: 1, model: DEFAULT_MODEL, fallback: false },
    ]);
  });
});

/** A distinctive API key, so a test can show it is never printed. */
const KEY = 'sk-ant-api-key-not-a-secret';

/**
 * The cells of a submission whose batch is created: the pending file written or
 * not, and — only reachable once it is not — the cancellation accepted or not.
 */
const PENDING_WRITE_GRID = [
  {
    name: 'cancels the batch it created when the pending file cannot be written, prints its id and exits 1',
    writeFails: true,
    cancelFails: false,
  },
  {
    name: 'prints the batch id and that it could not be canceled when the pending file cannot be written and the cancellation fails, and exits 1',
    writeFails: true,
    cancelFails: true,
  },
  {
    name: 'records the batch it created and cancels nothing when the pending file is written',
    writeFails: false,
    cancelFails: false,
  },
];

describe('submit: a created batch the pending file records or cannot record', () => {
  for (const { name, writeFails, cancelFails } of PENDING_WRITE_GRID) {
    it(name, async () => {
      expect((await run(['extract'])).code).toBe(0);
      const fake = fakeAnthropic(
        cancelFails
          ? {
              // The SDK's own error class, whose message carries the API's answer verbatim — here, the key.
              cancel: () => {
                throw new InternalServerError(500, { type: 'error', error: { type: 'api_error', message: `echo ${KEY}` } }, undefined, new Headers());
              },
            }
          : {}
      );
      // The one fault: every write of the pending file fails as a full disk would, with the key in its message.
      const faulty = failingWrites({ file: memory('pending.json'), code: 'ENOSPC', message: `no space left on device ${KEY}` });
      const deps = { ClientClass: fake.FakeAnthropic, env: { ANTHROPIC_API_KEY: KEY }, ...(writeFails ? { fsImpl: faulty.fsImpl } : {}) };

      const r = await run(['submit'], deps);
      const printed = r.out + '\n' + r.err;

      // The cell is the one its name says: one batch created, and the write failing or not.
      expect(fake.calls.batchCreate).toHaveLength(1);
      expect(faulty.refused).toHaveLength(writeFails ? 1 : 0);

      if (writeFails) {
        expect(r.code).toBe(1);
        expect(fake.calls.cancel).toEqual(['msgbatch_fake1']);
        // Both clients come from the one factory, with the configured key.
        expect(fake.constructed.map((o) => o.apiKey)).toEqual([KEY, KEY]);
        expect(r.err).toContain(`submit: batch msgbatch_fake1 was created, but ${memory('pending.json')} could not be written (ENOSPC): the batch is recorded nowhere.`);
        expect(r.out).not.toContain('recorded in');
        expect(fs.existsSync(memory('pending.json'))).toBe(false);
        expect(fs.readdirSync(memory()).filter((n) => n.includes('.tmp-'))).toEqual([]);
      } else {
        expect(r.code).toBe(0);
        expect(r.err).toBe('');
        expect(fake.calls.cancel).toEqual([]);
        expect(r.out).toContain(`submit: batch msgbatch_fake1 created with 2 request(s) and recorded in ${memory('pending.json')}.`);
        expect(readJson(memory('pending.json')).batches.map((b) => b.id)).toEqual(['msgbatch_fake1']);
      }

      if (writeFails && !cancelFails) {
        expect(r.err).toContain(
          'submit: batch msgbatch_fake1 was canceled: the API accepted the cancellation (processing status: canceling); requests it had already processed may still be billed.'
        );
        expect(r.err).not.toContain('could NOT');
      }
      if (cancelFails) {
        expect(r.err).toContain(
          'submit: batch msgbatch_fake1 could NOT be canceled (InternalServerError, HTTP 500): cancel it by hand, or the next submission requests its units again.'
        );
        expect(r.err).not.toContain('was canceled');
      }

      expect(printed).not.toContain(KEY);
      expect(printed).not.toContain('no space left on device');
      expect(networkAttempts()).toEqual([]);
    });
  }
});

describe('selectWithinBudget — a prefix of the stable order', () => {
  it('stops at the first request that does not fit, even when a later one would', () => {
    const requests = [{ estimate: { input: 5, output: 5 } }, { estimate: { input: 50, output: 5 } }, { estimate: { input: 1, output: 1 } }];
    const { selected, deferred, totals } = selectWithinBudget(requests, { inputTokens: 20, outputTokens: 20 });
    expect(selected).toEqual([requests[0]]);
    expect(deferred).toEqual([requests[1], requests[2]]);
    expect(totals).toEqual({ input: 5, output: 5 });
  });
});

describe('collect', () => {
  it('keys results by custom identifier, never by position', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic({ order: (lines) => [...lines].reverse() });
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    const r = await run(['collect'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(0);
    const machine = readJson(memory('machine', 'en.json'));
    const units = readJson(memory('source.json')).units;
    expect(Object.keys(machine).sort()).toEqual([...HOME_MISSING, ...UI_MISSING].sort());
    for (const [key, entry] of Object.entries(machine)) expect(entry.text).toBe(`[${DEFAULT_MODEL}] ${units[key].source}`);
    expect(readJson(memory('pending.json')).batches).toEqual([]);
  });

  it('writes the machine layer only, and applying the same results twice leaves the memory byte-identical', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic();
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    const pendingBefore = fs.readFileSync(memory('pending.json'));
    const humanBefore = fs.readFileSync(memory('messages', 'en.json'));

    expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    const once = snapshot(memory());
    expect(fs.readFileSync(memory('messages', 'en.json')).equals(humanBefore)).toBe(true);

    fs.writeFileSync(memory('pending.json'), pendingBefore); // the same batch, recorded again
    expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    expect(snapshot(memory())).toEqual(once);
  });

  // A reply carrying an identifier its request did not ask for, by whether every requested segment passes.
  const UNREQUESTED_ROWS = [
    {
      scenario: 'keeps every requested segment of a reply that adds an identifier, queues nothing, and names the extra one in its output and its job log',
      broken: null,
      queued: [],
    },
    {
      scenario: 'queues only the invalid requested segment of a reply that adds an identifier, writes the others, and names the extra one',
      broken: 'Scopri',
      queued: ['Scopri'],
    },
  ];
  for (const row of UNREQUESTED_ROWS) {
    it(row.scenario, async () => {
      expect((await run(['extract'])).code).toBe(0);
      const reply = (params) => {
        const echoed = JSON.parse(echoReply(params).content[0].text).translations;
        const texts = echoed.map((e) => (row.broken && e.id === keyOf(row.broken) ? { id: e.id, text: '' } : e));
        return replyMessage([...texts, { id: 'not-asked', text: 'x' }]);
      };
      const fake = fakeAnthropic({ reply });
      expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
      const r = await run(['collect'], { ClientClass: fake.FakeAnthropic });
      expect(r.code).toBe(0);

      const written = Object.keys(readJson(memory('machine', 'en.json'))).sort();
      const all = [...HOME_MISSING, ...UI_MISSING];
      expect(written).toEqual(all.filter((id) => !row.queued.map(keyOf).includes(id)).sort());
      expect(Object.keys(readJson(memory('pending.json')).queue.en || {})).toEqual(row.queued.map(keyOf));
      // Named in the output and in the job log, once per request that carried it.
      expect(r.out).toContain('  dropped an identifier the request did not ask for: content/it/home.json (en): "not-asked"');
      expect(r.out).toContain('  dropped an identifier the request did not ask for: ui/it.json (en): "not-asked"');
      const [job] = fs.readdirSync(memory('jobs')).map((f) => readJson(memory('jobs', f)));
      expect(job.dropped).toEqual([
        { id: 'not-asked', lang: 'en', page: 'content/it/home.json', section: null },
        { id: 'not-asked', lang: 'en', page: 'ui/it.json', section: null },
      ]);
      expect(job.failures.map((f) => f.srcHash)).toEqual(row.queued.map(keyOf));
    });
  }

  it('queues errored, expired and invalid segments for resubmission, stating the defect in the next request', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const result = (params) => {
      const body = requestBody(params);
      if (body.page === 'content/it/home.json') return { type: 'errored', error: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } };
      // The UI request: one segment returned with its text emptied, the other omitted.
      return { type: 'succeeded', message: replyMessage([{ id: body.translate[0], text: '' }]) };
    };
    const fake = fakeAnthropic({ result });
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);

    expect(fs.existsSync(memory('machine', 'en.json'))).toBe(false);
    const queue = readJson(memory('pending.json')).queue.en;
    expect(queue[HOME_MISSING[0]]).toEqual({ attempts: 1, defect: 'the request errored (overloaded_error: Overloaded)', whole: true });
    expect(queue[UI_MISSING[0]]).toEqual({ attempts: 1, defect: 'the translation is empty' });
    expect(queue[UI_MISSING[1]]).toEqual({ attempts: 1, defect: 'no translation was returned for this identifier' });

    const expiring = fakeAnthropic({ result: () => ({ type: 'expired' }) });
    expect((await run(['submit'], { ClientClass: expiring.FakeAnthropic })).code).toBe(0);
    const resent = expiring.calls.batchCreate[0].requests.map((q) => requestBody(q.params));
    // A defect of the whole request is stated once, beside the per-segment corrections, never once per segment.
    expect(resent[0].replyCorrections).toEqual(['the request errored (overloaded_error: Overloaded)']);
    expect(resent[0].corrections).toBeUndefined();
    expect(resent[1].corrections).toEqual({ [UI_MISSING[0]]: 'the translation is empty', [UI_MISSING[1]]: 'no translation was returned for this identifier' });
    expect(Object.values(readJson(memory('pending.json')).batches[0].requests).map((q) => q.attempt)).toEqual([2, 2]);
    expect((await run(['collect'], { ClientClass: expiring.FakeAnthropic })).code).toBe(0);
    expect(readJson(memory('pending.json')).queue.en[UI_MISSING[0]]).toEqual({ attempts: 2, defect: 'the request was expired', whole: true });
  });

  it('resubmits a refused request once on model.fallbackId, then on the primary model', async () => {
    editConfig((c) => (c.backend.model = { id: 'claude-opus-5-5', effort: 'low', fallbackId: 'claude-opus-4-8' }));
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic({ reply: () => refusalMessage('cyber') });
    const models = () => fake.calls.batchCreate[fake.calls.batchCreate.length - 1].requests.map((q) => q.params.model);
    for (const expected of ['claude-opus-5-5', 'claude-opus-4-8', 'claude-opus-5-5']) {
      expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
      expect(models()).toEqual([expected, expected]);
      expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    }
    expect(readJson(memory('pending.json')).queue.en[HOME_MISSING[0]].defect).toBe('the model declined the request (refusal category: cyber)');
  });

  it('resubmits a refused request on model.fallbackId with the configured effort and no thinking setting, and the primary keeps its own', async () => {
    editConfig((c) => (c.backend.model = { id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' }, effort: 'low', fallbackId: 'claude-opus-5-5' }));
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic({ reply: () => refusalMessage('cyber') });
    const sent = () => fake.calls.batchCreate[fake.calls.batchCreate.length - 1].requests.map((q) => q.params);
    const cycle = [
      { model: 'claude-sonnet-5-5', thinking: { type: 'between_tools' } },
      { model: 'claude-opus-5-5', thinking: undefined },
      { model: 'claude-sonnet-5-5', thinking: { type: 'between_tools' } },
    ];
    for (const expected of cycle) {
      expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
      for (const params of sent()) {
        expect(params.model).toBe(expected.model);
        expect(params.output_config.effort).toBe('low');
        expect('thinking' in params).toBe(expected.thinking !== undefined);
        expect(params.thinking).toEqual(expected.thinking);
      }
      expect(sent()).toHaveLength(2);
      expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    }
  });

  it('resubmits a refused request on the primary model when no fallback is configured', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic({ reply: () => refusalMessage(null) });
    for (let i = 0; i < 2; i++) {
      expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
      expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    }
    expect(fake.calls.batchCreate.map((b) => b.requests[0].params.model)).toEqual([DEFAULT_MODEL, DEFAULT_MODEL]);
  });

  it('after the attempt limit a segment stays untranslated, is named in the job log, and is not requested again', async () => {
    editConfig((c) => (c.backend.attempts = 2));
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic({ result: () => ({ type: 'canceled' }) });
    for (let i = 0; i < 2; i++) {
      expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
      expect((await run(['collect'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    }
    const jobs = fs.readdirSync(memory('jobs')).sort().map((f) => readJson(memory('jobs', f)));
    const last = jobs.find((j) => j.id === 'msgbatch_fake2');
    expect(last.exhausted.map((e) => e.srcHash).sort()).toEqual([...HOME_MISSING, ...UI_MISSING].sort());
    expect(last.exhausted[0].error).toBe('the request was canceled');

    const r = await run(['submit'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(0);
    expect(r.out).toContain('en: 6 segment(s) reached the attempt limit and stay untranslated');
    expect(fake.calls.batchCreate).toHaveLength(2);
  });

  it('leaves a batch that is still processing recorded, writing nothing to the memory', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic({ status: 'in_progress' });
    expect((await run(['submit'], { ClientClass: fake.FakeAnthropic })).code).toBe(0);
    const r = await run(['collect'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(0);
    expect(r.out).toContain('collect: batch msgbatch_fake1 is in_progress, 1 request(s) processing; left recorded.');
    expect(fake.calls.results).toHaveLength(0);
    expect(readJson(memory('pending.json')).batches.map((b) => b.id)).toEqual(['msgbatch_fake1']);
    expect(fs.existsSync(memory('machine', 'en.json'))).toBe(false);
  });

  it('with nothing pending, makes no client call', async () => {
    const fake = fakeAnthropic();
    const r = await run(['collect'], { ClientClass: fake.FakeAnthropic });
    expect(r.code).toBe(0);
    expect(r.out).toContain('collect: no batch is pending: no network call.');
    expect(fake.constructed).toHaveLength(0);
  });
});

describe('status', () => {
  it('prints the recorded batches and the queue, and makes no client call', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const submitting = fakeAnthropic({ status: 'in_progress' });
    expect((await run(['submit'], { ClientClass: submitting.FakeAnthropic })).code).toBe(0);
    const fake = fakeAnthropic();
    const r = await run(['status'], { ClientClass: fake.FakeAnthropic, env: {} });
    expect(r.code).toBe(0);
    expect(r.out).toContain('status: batch msgbatch_fake1, created 2026-10-16T00:00:01Z: 2 request(s) (en)');
    expect(r.out).toContain('status: the resubmission queue is empty.');
    expect(fake.constructed).toHaveLength(0);
  });
});

describe('the default reply of the fake client is a faithful one', () => {
  it('echoes every requested segment, which validation accepts', () => {
    const content = [
      { type: 'text', text: JSON.stringify({ page: 'p', segments: [{ id: 'a', format: 'text', source: 'Uno' }] }) },
      { type: 'text', text: JSON.stringify({ translate: ['a'] }) },
    ];
    const params = { model: 'm', messages: [{ role: 'user', content }] };
    expect(JSON.parse(echoReply(params).content[0].text)).toEqual({ translations: [{ id: 'a', text: '[m] Uno' }] });
  });
});
