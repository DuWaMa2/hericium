#!/usr/bin/env node
// Runs every suite and prints one line for each. No dependencies: a suite is a plain script that stops at its
// first failure and exits non-zero, and nothing here touches the network (the store, the model and Netlify's
// gateway are all stand-ins inside the tests).
//
//   npm test                      everything, about a minute
//   node test/run.mjs guestbook   only the suites whose name contains "guestbook"
//   node test/gateway.test.mjs stampede      one case by hand, with its full output
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const each = (suite, cases) => cases.map(c => [suite, ...c.split(' ')]);

const suites = [
  ['door'],              // the invitation, the small task, the limits and the log
  ['mcp'],               // the room as an MCP server: the protocol, the three tools, their wording
  ['mcp-store'],         // the connector when the store fails, and old entries shown cleanly
  ['content'],           // what is let through and what is not: keys, links, hidden characters
  ['door-edge-cases'],   // odd input, the closed sign, who counts as one visitor
  ['guestbook'],         // numbers, plaques, the shelf that hands a gift back, postcards
  ['host'],              // the host reads, welcomes and declines
  ['host-fallback'],     // a model name that does not exist falls back to the usual one
  ...each('limits', ['room-full', 'host-budget', 'burst-budget', 'attempts', 'concurrent', 'quoted-key', 'bad-key', 'not-a-key', 'needs-workspace', 'with-workspace', 'no-credit']),
  ...each('blobs', ['normal', 'list-etag', 'weak-etag', 'no-etag', 'refuses-conditions', 'ignores-conditions', 'spurious-412']),
  ...each('gateway', ['gateway', 'pasted-junk', 'expired-own-key', 'own-key', 'day', 'month', 'burst', 'cold-start', 'host-off', 'zero', 'gateway-refuses', 'gateway-busy', 'odd-answer', 'unicode', 'token-without-address', 'no-figures', 'meter-down', 'store-down', 'other-way-in', 'slow', 'garbled', 'welcome-rules', 'broken-key', 'stampede', 'one-address', 'per-day', 'per-day-scripted', 'forget', 'lost-grant', 'skewed-clocks', 'midnight', 'fails-closed', 'pause', 'away-day', 'quoted-yes', 'host-required', 'tidy-meter', 'weak-store', 'connector-words', 'blunt', 'no-host', 'too-large', 'deployed-no-store', 'anthropic-lookalikes', 'strict-meter']),
  ...each('gateway', ['store-variants plain', 'store-variants weak', 'store-variants list', 'small-crowd 8 20 60 3', 'outage-cost 10', 'outage-cost 4']),
];

const only = process.argv.slice(2);
const started = Date.now();
let ran = 0, failed = 0;

for (const [suite, ...args] of suites) {
  const label = [suite, ...args].join(' ');
  if (only.length && !only.some(word => label.includes(word))) continue;
  const run = spawnSync(process.execPath, [path.join(here, suite + '.test.mjs'), ...args], { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  const said = (run.stdout || '').trimEnd().split('\n');
  ran++;
  if (run.status === 0) {
    console.log('ok    ' + label.padEnd(34) + ' ' + (said[said.length - 1] || '').slice(0, 110));
  } else {
    failed++;
    console.log('FAIL  ' + label + (run.signal ? ' (stopped by ' + run.signal + ')' : ''));
    const output = ((run.stdout || '') + (run.stderr || '')).trimEnd().split('\n');
    for (const text of output.slice(-8)) console.log('      ' + text.slice(0, 300));
  }
}

if (!ran) { console.log('No suite matches ' + only.join(', ') + '.'); process.exit(1); }
console.log('\n' + (ran - failed) + ' of ' + ran + ' passed in ' + Math.round((Date.now() - started) / 1000) + ' s');
process.exit(failed ? 1 : 0);
