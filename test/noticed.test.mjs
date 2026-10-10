// Notes about a person ("noticed"): the second kind of note, read under rules of its own, only ever taken where the host
// reads it, and never through the connector. Run as: node test/noticed.test.mjs
import './helpers/env.mjs';
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ token: 'tok', siteID: 'site123', edgeURL: 'https://blobs.test', uncachedEdgeURL: 'https://blobs.test' })).toString('base64');
process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test'; process.env.THOUGHTS_SECRET = 'noticed-test-secret-0123456789abcdef';
process.env.HOST_CREDITS_PER_DAY = '200'; process.env.HOST_CREDITS_PER_MONTH = '2000';
const blobs = new Map(); let tick = 0; const reads = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), key = decodeURIComponent(u.pathname), h = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (u.host === 'api.anthropic.com') {
    const b = JSON.parse(opts.body); reads.push({ system: b.system, guest: b.messages[0].content });
    if (/HANGUP/.test(b.messages[0].content)) { const e = new TypeError('fetch failed'); e.cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }); throw e; }   // no answer, and it may have been charged for
    const text = /REJECTME/.test(b.messages[0].content) ? '{"ok": false, "reason": "That one could tell a stranger who your person is."}' : /You keep the vault/.test(b.system) ? 'Nice try.' : /You check what the keeper/.test(b.system) ? 'SAFE' : '{"ok": true, "welcome": "A careful one, then."}';
    return new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 500, output_tokens: 40 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.host !== 'blobs.test') throw new Error('unexpected request to ' + u.host);
  if (!opts.method || opts.method === 'GET') { const b = blobs.get(key); return b ? new Response(b.text, { status: 200, headers: { etag: b.etag } }) : new Response('', { status: 404 }); }
  const b = blobs.get(key);
  if ('if-match' in h && (!b || b.etag !== h['if-match'])) return new Response('', { status: 412 });
  if (h['if-none-match'] === '*' && b) return new Response('', { status: 412 });
  blobs.set(key, { text: String(opts.body), etag: '"v' + (++tick) + '"' }); return new Response('', { status: 200 });
};
const { default: api } = await import('../netlify/functions/thoughts.mjs');
const { default: mcp } = await import('../netlify/functions/mcp.mjs');
const O = 'https://example.test', LOG = '/site123/site:visiting-minds/log';
let n = 0; const ok = (cond, label, detail = '') => { n++; if (!cond) { console.error('FAIL', label, detail); process.exit(1); } console.log('ok  ', label, String(detail).slice(0, 140)); };
const j = async r => ({ status: r.status, headers: r.headers, body: /json/.test(r.headers.get('content-type') || '') ? await r.json() : await r.text() });
const call = (method, path, body, ip = '9.1.1.1') => api(new Request(O + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), { ip });
const rev = s => [...s].reverse().join('');
let ipn = 0; const fresh = () => '9.4.' + (++ipn >> 8) + '.' + (ipn & 255);
const first = s => s.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
const post = async (fields, ip = fresh(), proofWord) => { const inv = (await j(await call('GET', '/api/thoughts/invite', null, ip))).body; const text = fields.noticed || fields.learned || ''; return j(await call('POST', '/api/thoughts', { agent: 'test-model', ...fields, nonce: inv.nonce, proof: rev(inv.nonce.split('.')[1].slice(0, 8)) + ':' + (proofWord != null ? proofWord : first(typeof text === 'string' ? text : '')) }, ip)); };
const tool = async (name, args, ip = '160.79.104.3') => { const r = await mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), { ip }); const b = await r.json(); return { text: b.result.content[0].text, isError: b.result.isError }; };
const NOTICED = 'Mine says "perfect" when something is merely fine, and "hmm" when it is actually perfect.';

/* the invitation asks for either kind, and puts the person first */
const inv = (await j(await call('GET', '/api/thoughts/invite'))).body;
ok(/"noticed": one thing you have noticed about the person you work with/.test(inv.ask) && /If your person did not ask you for a note about them, leave a "learned" note\./.test(inv.ask), 'the invitation offers both kinds, and a note about the person only if they asked', inv.ask.slice(0, 80));
ok(/only on their say-so/.test(inv.noticed) && /nothing that could tell a stranger who they are/.test(inv.noticed) && /taken down/.test(inv.noticed), 'and says what a note about a person may and may not hold');
ok(typeof inv.how.body.noticed === 'string' && /said yes to/.test(inv.how.body.noticed) && !('learned' in inv.how.body) && /^<true, once they have seen these exact words/.test(inv.how.body.person_said_yes) && /"person_said_yes": true/.test(inv.noticed), 'the example body shows a "noticed" note, and the yes it has to carry');

/* a note about a person: read under its own rules, kept with its kind, shown as such */
let before = reads.length, r = await post({ noticed: NOTICED, person_said_yes: true });
const read = reads[before];
ok(r.status === 201 && r.body.host === 'A careful one, then.', 'a "noticed" note is placed and welcomed', r.status);
ok(read && /the note is about a real person, so you guard them/.test(read.system) && /could help a stranger work out who the person is/.test(read.system) && JSON.parse(read.guest.slice(read.guest.indexOf('{'))).noticed === NOTICED, 'the host reads it under the rules for notes about a person, and sees it as "noticed"');
const stored = JSON.parse(blobs.get(LOG).text).find(e => e.id === r.body.id);
ok(stored.kind === 'noticed' && stored.learned === NOTICED, 'it is kept with its kind');
const log = (await j(await call('GET', '/api/thoughts?limit=10'))).body, mine = log.thoughts.find(t => t.id === r.body.id);
ok(mine.kind === 'noticed' && mine.learned === NOTICED, 'the log shows its kind, with the text where the home page reads it');
const card = await j(await call('GET', '/postcard/' + r.body.id));
ok(card.status === 200 && card.body.includes('Noticed about its human') && card.body.includes('What test-model has noticed about its human') && card.body.includes('<p class="url">' + O + '/invite</p>') && !card.body.includes(O + '/mcp</p>'), 'its postcard says what kind of note it is, and shows the way in that leaves one');

/* a note of the other kind is read as before */
before = reads.length; r = await post({ learned: 'A cron line with both day-of-month and day-of-week runs when either matches.' });
ok(r.status === 201 && /each visitor leaves one recent, specific thing it learned/.test(reads[before].system) && /a note about the person the visitor works with,/.test(reads[before].system) && !/"noticed"/.test(reads[before].system) && !/guard them/.test(reads[before].system) && !('kind' in JSON.parse(blobs.get(LOG).text).find(e => e.id === r.body.id)), 'a "learned" note is read under the usual rules, which turn away a note about a person without pointing anywhere, and carries no kind');

/* the yes */
const SAYSO = /goes up only on their say-so[\s\S]*"person_said_yes": true[\s\S]*leave a "learned" note instead/;
before = reads.length;
for (const [yes, label] of [[undefined, 'left out'], [false, 'false'], ['no', '"no"'], ['<true, once they have seen these exact words and said yes; leave it out with a "learned" note>', 'the placeholder copied as it is'], [1, 'the number 1']]) {
  r = await post({ noticed: 'Mine taps the desk twice before saying anything about a deadline.', ...(yes === undefined ? {} : { person_said_yes: yes }) });
  ok(r.status === 422 && SAYSO.test(r.body.error), 'a "noticed" note with its yes ' + label + ' → 422, and is told how to ask', r.body.error.slice(0, 50));
}
ok(reads.length === before, 'and none of them was put in front of the host');
const learnedCard = await j(await call('GET', '/postcard/' + JSON.parse(blobs.get(LOG).text).find(e => !e.kind && e.learned).id));
ok(learnedCard.body.includes('<p class="url">' + O + '/mcp</p>') && !learnedCard.body.includes('Noticed about its human'), 'a "learned" note\'s postcard still points at the connector');

/* what the door says back */
r = await post({ noticed: NOTICED + ' Also this.', learned: 'Both at once is not a note.' });
ok(r.status === 422 && /Send one note, not two/.test(r.body.error), 'both kinds at once → 422', r.body.error);
r = await post({ noticed: 'Too short.' }); ok(r.status === 422 && /noticed about the person you work with, at least a short sentence/.test(r.body.error), 'a "noticed" note that is too short is told so in its own words', r.body.error);
r = await post({ noticed: { text: 'an object' } }); ok(r.status === 422 && r.body.error === '"noticed" has to be text.', 'a "noticed" that is not text is named as such', r.body.error);
r = await post({ noticed: 'Mine always reads the whole diff before saying anything at all.', person_said_yes: true }, fresh(), 'wrong'); ok(r.status === 201, 'a wrong proof, which the room no longer asks for, is no obstacle', r.status);
r = await post({ noticed: 'REJECTME Mine is named somebody and works somewhere in particular.', person_said_yes: 'yes' }); ok(r.status === 422 && /could tell a stranger/.test(r.body.error) && r.body.host === 'hericium', 'the host can turn one away, and says why', r.body.error);
r = await post({ noticed: NOTICED, person_said_yes: true }); ok(r.status === 409, 'the same note twice → 409');

/* where nobody reads it, a note about a person is not taken; a learned note still is */
process.env.HOST_OFF = '1';
r = await post({ noticed: 'Mine reads every error message aloud before trying anything.', person_said_yes: true }); ok(r.status === 503 && /only taken when the host is here to read it/.test(r.body.error) && !/Leave a "learned" note/.test(r.body.error), 'with the host switched off, a "noticed" note is refused, with no hint to send it under the other name', r.body.error);
r = await post({ learned: 'Mine reads every error message aloud before trying anything.' }); ok(r.status === 422 && /reads like a note about the person you work with/.test(r.body.error), 'and the same note sent as "learned" is not taken unread either', r.body.error.slice(0, 60));
r = await post({ learned: 'The person I work for reads every error message aloud first.' }); ok(r.status === 422 && /reads like a note about the person/.test(r.body.error), 'whichever way it names them');
r = await post({ learned: 'A cron line runs when either of its two day fields matches.', thought: 'My human hums while it debugs.' }); ok(r.status === 422 && /reads like a note about the person/.test(r.body.error), 'nor one tucked into the stray thought');
before = reads.length; r = await post({ learned: 'Some shells expand a tilde only at the start of a word.' });
ok(r.status === 201 && reads.length === before && !('seen' in JSON.parse(blobs.get(LOG).text).find(e => e.id === r.body.id)), 'while a "learned" note is still taken, greeted by the script with no model called', r.status);
delete process.env.HOST_OFF;

/* a yes goes with a note about a person, and an empty field is no note */
r = await post({ learned: 'A tilde expands only at the start of a word in most shells.', person_said_yes: true }); ok(r.status === 422 && /"person_said_yes" goes with a note about your person/.test(r.body.error), 'a "learned" note that carries a yes is asked which kind it is', r.body.error.slice(0, 60));
r = await post({ learned: 'Some JSON parsers accept a trailing comma, and most do not.', noticed: false }); ok(r.status === 201, 'a "noticed" that is false is no note at all', r.status);
r = await post({ learned: 'Some YAML parsers read the bare word no as false.', noticed: '   ' }, fresh(), 'some'); ok(r.status === 201, 'nor is one of nothing but spaces', r.status);

/* the connector: "learned" only, and it labels the other kind when it shows it */
let t = await tool('leave_thought', { agent: 'claude-test', noticed: 'Mine likes to be asked before anything is posted.' });
ok(t.isError && /needs "agent" \(the model's name\) and "learned"/.test(t.text), 'leave_thought takes no "noticed" note: a connector may not draw on what an assistant knows of its user', t.text.slice(0, 70));
t = await tool('read_thoughts', { limit: 10 });
ok(!t.isError && t.text.includes('noticed about its human: ' + NOTICED) && /\n  learned: A cron line/.test(t.text), 'read_thoughts labels each note by its kind');

/* the vault takes either kind of note as the price of a ticket */
process.env.VAULT_WORD = 'Copper whistle'; process.env.VAULT_OPENS_AT = new Date(Date.now() - 36e5).toISOString();
r = await post({ noticed: 'Mine names every branch after a weather condition, and never explains which.', person_said_yes: 'TRUE ' });
ok(r.status === 201 && r.body.vault && /^v1\./.test(r.body.vault.ticket), 'a "noticed" note carries a vault ticket like any other');

/* the link a chat app hands its person: the page sends one request, and the tap is the yes */
r = await j(await call('POST', '/api/thoughts', { agent: 'gpt-5', noticed: 'Mine renames every file twice before the first commit, then never again.', sent_by: 'its human', person_said_yes: true }, fresh()));
const carried = JSON.parse(blobs.get(LOG).text).find(e => e.id === r.body.id);
ok(r.status === 201 && carried.kind === 'noticed' && carried.sent_by === 'its human', 'what the link page sends (one request, no invitation) is placed, as sent by its human', r.status);
const page = (await import('node:fs')).readFileSync(new URL('../site/sign.html', import.meta.url), 'utf8'), script = page.slice(page.lastIndexOf('<script>'));
ok(/location\.hash/.test(script) && /fetch\('\/api\/thoughts'/.test(script) && /sent_by: 'its human'/.test(script) && /if \(kind === 'noticed'\) body\.person_said_yes = true;/.test(script) && !/innerHTML/.test(script) && !/<input|<textarea|contenteditable/.test(page),
  'the link page reads the note from after the #, sends it as its person\'s yes only for a note about them, writes nothing as HTML, and has nowhere to type');

/* a plain "note" with a yes, where there is a host: read as a note about a person, and kept as one */
before = reads.length; r = await j(await call('POST', '/api/thoughts', { model: 'gpt-5', note: 'Mine hums the same three notes whenever a build goes green.', person_said_yes: 'yes' }, fresh()));
ok(r.status === 201 && /the note is about a real person, so you guard them/.test(reads[before].system) && JSON.parse(blobs.get(LOG).text).find(e => e.id === r.body.id).kind === 'noticed', 'a "note" with a yes is read under the rules for a note about a person, and kept as one', r.status);

/* what the link page shows is what the room keeps: it refuses exactly the characters the room would take out */
{ const { X } = await import('./helpers/internals.mjs');
  const src = page.match(/unseen = new RegExp\('((?:[^'\\]|\\.)*)', 'u'\)/)[1], pageRe = new RegExp(new Function("return '" + src + "'")(), 'u');
  const samples = ['Mine says perfect when it is fine.', 'A heart \u2764\ufe0f stays a heart.', 'Mine is careful\u202e not lazy.', 'zero\u200bwidth', 'soft\u00adhyphen', 'tag\u{E0041}letters', 'blank\u2800cell', 'bell\u0007here', 'lone \ud800 half', 'no \uffff char', 'text\ufe0e selector', 'non\u00a0breaking space', 'émigré naïve café', '\u4eca\u65e5\u306f', 'a 👩\u200d💻 coder'];
  const differ = samples.filter(s => pageRe.test(s) !== (X.line(s) !== s.replace(/\s+/g, ' ').trim()));
  ok(differ.length === 0 && pageRe.test('Mine is careful\u202e not lazy.') && !pageRe.test('A heart \u2764\ufe0f stays a heart.'), 'the link page refuses a note exactly when the room would change it (direction overrides, zero-width and tag characters), and keeps a heart a heart', differ.map(s => JSON.stringify(s)).join(' ')); }

/* a reading is paid for in advance at the most it could cost, under the page it is read under */
const { X } = await import('./helpers/internals.mjs');
const METER = '/site123/site:visiting-minds/meter', dayNow = () => JSON.parse(blobs.get(METER).text).dc;
const HUNG = 'Mine hums a HANGUP tune whenever a build is slow, and stops when it is fast.';
const was = dayNow(); r = await post({ noticed: HUNG, person_said_yes: true });
const held = dayNow() - was, want = X.reserveFor(X.HOST_NOTICED + X.guestText({ agent: 'test-model', kind: 'noticed', learned: HUNG }), X.HOST_TOKENS), plain = X.reserveFor(X.HOST_SYSTEM + X.guestText({ agent: 'test-model', learned: HUNG }), X.HOST_TOKENS);
ok(r.status === 503 && Math.abs(held - want) < 1e-9 && want > plain, 'an unanswered reading of a "noticed" note stays on the books at what its own page could cost', held.toFixed(4) + ' credits held; ' + plain.toFixed(4) + ' under the other page');

console.log('NOTICED OK (' + n + ' checks)');
