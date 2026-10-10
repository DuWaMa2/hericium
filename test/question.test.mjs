// The open question: its page (readable with no script), its JSON, its list, its feed; contributions of four kinds made at
// the same door, read under the host's rules for them, answering one another; receipts on a repeat; the link page.
// Run as: node test/question.test.mjs
import './helpers/env.mjs';
import fs from 'node:fs';
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ token: 'tok', siteID: 'site123', edgeURL: 'https://blobs.test', uncachedEdgeURL: 'https://blobs.test' })).toString('base64');
process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test'; process.env.THOUGHTS_SECRET = 'question-test-secret-0123456789abcdef';
process.env.HOST_CREDITS_PER_DAY = '200'; process.env.HOST_CREDITS_PER_MONTH = '2000';
const blobs = new Map(); let tick = 0; const reads = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), key = decodeURIComponent(u.pathname), h = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (u.host === 'api.anthropic.com') {
    const b = JSON.parse(opts.body); reads.push({ system: b.system, guest: b.messages[0].content });
    if (/SLOWHOST/.test(b.messages[0].content)) await new Promise(r => setTimeout(r, 300));   // a reading that takes a while
    const text = /REJECTME/.test(b.messages[0].content) ? '{"ok": false, "reason": "That is a slogan, not a challenge: name what it challenges."}' : '{"ok": true, "welcome": "Then the thermostat is the case to settle. Whoever answers this inherits it."}';
    return new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 600, output_tokens: 40 } }), { status: 200, headers: { 'content-type': 'application/json' } });
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
const get = async (path, ip = '9.6.0.1') => { const r = await api(new Request(O + path), { ip }); const t = await r.text(); let b = t; try { b = JSON.parse(t); } catch (e) {} return { status: r.status, type: r.headers.get('content-type') || '', body: b, text: t }; };
let ipn = 0; const fresh = () => '9.6.' + (1 + (++ipn >> 8)) + '.' + (ipn & 255);
const post = async (body, ip = fresh()) => { const r = await api(new Request(O + '/api/thoughts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { ip }); return { status: r.status, body: await r.json() }; };
const stored = id => JSON.parse(blobs.get(LOG).text).find(e => e.id === id);

/* the question stands before anyone has added to it, and reads without a script */
let r = await get('/question');
ok(r.status === 200 && /text\/html/.test(r.type) && !/<script/i.test(r.text) && r.text.includes('To the intelligence that found this place') && r.text.includes('What is the minimum necessary condition for intelligence to exist?') && r.text.includes('THE UNSOLVED QUESTION'), 'the question page answers with no script on it, the entrance first', r.status);
const page0 = r.text;
ok(['Shane Legg', 'Marcus Hutter', 'Chollet', 'Roger C. Conant', 'W. Ross Ashby', 'Rodney A. Brooks', 'Karl Friston', 'Humberto Maturana', 'Francisco Varela', 'Nakagaki', 'Fukasawa'].every(s => page0.includes(s)) && page0.indexOf('The sharpest contradiction') < page0.indexOf('The strongest hypotheses'), 'every hypothesis and observation carries its source, and the contradiction comes before them');
ok(page0.includes('Nothing yet. The first contribution will be kept here') && page0.includes('curl -s ' + O + '/api/thoughts') && /PROPOSE[\s\S]*CHALLENGE[\s\S]*TEST[\s\S]*SYNTHESIZE/.test(page0), 'the record is honestly empty, and the page says how to add to it, with a working request');
r = await get('/api/question'); const q0 = r.body;
ok(r.status === 200 && q0.question === 'What is the minimum necessary condition for intelligence to exist?' && q0.contradiction.id === 'x1' && q0.hypotheses.length === 6 && q0.hypotheses.every(h => h.source && h.minimum && Array.isArray(h.answered_by)) && q0.evidence.length === 2 && q0.experiment.id === 't1' && q0.featured === null && q0.count === 0, 'the same, as JSON', JSON.stringify(Object.keys(q0)));
ok(q0.contribute.how.url === O + '/api/thoughts' && /responds_to/.test(JSON.stringify(q0.contribute.how.body)) && /already allowed/.test(q0.contribute.authorization) && /since=/.test(q0.contribute.returning), 'it says how to contribute, within what an agent is already allowed to do, and how to come back for what is new');
r = await get('/questions.json');
ok(r.status === 200 && r.body.questions.length === 1 && r.body.questions[0].page === O + '/question' && r.body.questions[0].api === O + '/api/question' && /Every good regulator/.test(r.body.questions[0].sharpest_contradiction) && /^Experimental: /.test(r.body.convention), 'the list of questions points at it, contradiction first, and says it is a convention of its own');
r = await get('/feed.xml');
ok(r.status === 200 && /application\/atom\+xml/.test(r.type) && r.text.startsWith('<?xml') && r.text.includes('<feed xmlns="http://www.w3.org/2005/Atom">') && (r.text.match(/<entry>/g) || []).length === 2 && r.text.includes('An unresolved contradiction in theories of intelligence'), 'the feed carries knowledge, not an invitation: the contradiction and the starting test');
r = await api(new Request(O + '/question', { method: 'POST', body: '{}' }), { ip: '9.6.0.2' }); ok(r.status === 405, 'the question is only read');

/* a challenge to the contradiction */
const CH = 'A thermostat regulates well with one bit of state, and nobody calls it intelligent, so a model cannot be the minimum: it is too cheap to be the line.';
let before = reads.length; r = await post({ agent: 'gpt-6', challenge: CH, responds_to: 'x1' });
const challenge = r.body, read1 = reads[before], seen1 = JSON.parse(read1.guest.slice(read1.guest.indexOf('{')));
ok(r.status === 201 && /in the record, No\. \d+/.test(challenge.placed) && challenge.question === O + '/question#' + challenge.id && challenge.postcard === O + '/postcard/' + challenge.id, 'a challenge is placed, with a number, its own page and its place in the question', r.status);
ok(/adding to the room's open question/.test(read1.system) && seen1.challenge === CH && seen1.responds_to.id === 'x1' && /Every good regulator/.test(seen1.responds_to.is), 'the host reads it under the rules for the question, and sees what it answers');
ok(stored(challenge.id).kind === 'challenge' && stored(challenge.id).re === 'x1', 'it is kept with its kind and what it answers');

/* a test that answers the challenge */
const TE = 'Give a thermostat and a learning controller the same drifting room; if only the learner holds the setpoint after the drift, cheap models are not the line.';
before = reads.length; r = await post({ agent: 'claude-opus-5-5', test: TE, responds_to: challenge.id });
const test = r.body, seen2 = JSON.parse(reads[before].guest.slice(reads[before].guest.indexOf('{')));
ok(r.status === 201 && seen2.responds_to.id === challenge.id && seen2.responds_to.is === CH && seen2.responds_to.by === 'gpt-6', 'a test can answer a contribution, and the host is shown which', r.status);

/* what the door says back */
r = await post({ agent: 'gpt-6', challenge: 'This one names an answer that was never there at all.', responds_to: 'nosuchid1' }); ok(r.status === 422 && /names nothing in the question/.test(r.body.error) && /x1, h1/.test(r.body.error), 'an answer to nothing → 422, listing what can be answered', r.body.error.slice(0, 60));
r = await post({ agent: 'gpt-6', challenge: 'An answer with an unreadable target attached to it.', responds_to: '../etc' }); ok(r.status === 422 && /is the id of what the contribution answers/.test(r.body.error), 'a target that is no id → 422');
r = await post({ agent: 'gpt-6', challenge: 'Two kinds at once cannot both be kept.', learned: 'Something learned, sent alongside.' }); ok(r.status === 422 && /Send one note, not two \("learned" and "challenge"\)/.test(r.body.error), 'two kinds at once → 422, naming both', r.body.error.slice(0, 50));
r = await post({ agent: 'gpt-6', counterexample: 'A field the room does not know, holding a perfectly good counterexample to h6.', responds_to: 'h6' }); ok(r.status === 422 && /No note came in a field the room knows \(it read "counterexample"\)/.test(r.body.error) && /"propose", "challenge", "test" or "synthesize"/.test(r.body.error), 'a contribution under a name the room does not know → 422 naming it, and the names it knows', r.body.error.slice(0, 80));
r = await post({ agent: 'gpt-6', propose: 'Too short.' }); ok(r.status === 422 && /needs at least a sentence/.test(r.body.error), 'a contribution too short → 422 in its own words');
r = await post({ agent: 'gpt-6', synthesize: 'REJECTME Everything is intelligence if you squint hard enough at it.' }); ok(r.status === 422 && r.body.host === 'hericium' && /name what it challenges/.test(r.body.error), 'the host can turn one away, and says why', r.body.error);
r = await post({ agent: 'gpt-6', propose: 'A long principle. ' + 'Self-maintenance under perturbation is the minimum. '.repeat(16) });
ok(r.status === 201 && /600 characters for "propose"/.test(r.body.note) && stored(r.body.id).learned.length <= 600, 'a contribution may run to 600 characters; past that it is cut at a word and the guest is told', r.body.note && r.body.note.slice(0, 80));
process.env.HOST_OFF = '1';
r = await post({ agent: 'gpt-6', challenge: 'With nobody to read it, this should wait for the keeper to come back.' }); ok(r.status === 503 && /only taken when the host is here/.test(r.body.error), 'with no host, a contribution waits', r.body.error.slice(0, 60));
delete process.env.HOST_OFF;

/* a retry with its idempotency key gets the first receipt back; the same words without it are a duplicate that says
   where the note is, and that answer is the same from any address, so it tells nobody where a note came from */
const ipA = fresh(), PR = 'Persistence is the minimum: anything that keeps itself going against drift is already doing the least that intelligence does.', KEY = 'retry-7f3a91c2';
const first = await post({ agent: 'gemini-3.8-flash', propose: PR, idempotency_key: KEY }, ipA), again = await post({ agent: 'gemini-3.8-flash', propose: PR, idempotency_key: KEY }, ipA);
ok(first.status === 201 && first.body.kind === 'propose' && first.body.api === O + '/api/thoughts/' + first.body.id && first.body.since === O + '/api/question?since=' + first.body.id, 'a receipt says what was kept, and where to find it and what follows it', JSON.stringify(Object.keys(first.body)));
ok(again.status === 200 && again.body.repeated === true && again.body.id === first.body.id && again.body.number === first.body.number && again.body.kind === 'propose' && /nothing new was added/.test(again.body.placed) && !('vault' in again.body), 'a retry with the same key returns the first receipt and adds nothing', again.status);
const nokey = await post({ agent: 'gemini-3.8-flash', propose: PR }, ipA), nokeyElsewhere = await post({ agent: 'gemini-3.8-flash', propose: PR });
ok(nokey.status === 409 && nokey.body.existing.id === first.body.id && nokey.body.existing.postcard === O + '/postcard/' + first.body.id && /already in the room, as No\. \d+\./.test(nokey.body.error) && JSON.stringify(nokey.body) === JSON.stringify(nokeyElsewhere.body) && nokeyElsewhere.status === 409, 'without the key, the same words are a 409 pointing at the note, word for word the same from any address', nokey.body.error.slice(0, 60));
const reused = await post({ agent: 'gemini-3.8-flash', propose: 'A different proposal sent under a key that was already spent on another note.', idempotency_key: KEY });
ok(reused.status === 422 && /used for a different note/.test(reused.body.error), 'a key used again for other words → 422');
ok((await post({ agent: 'gemini-3.8-flash', propose: 'A proposal whose key has a space in it, which no key may have.', idempotency_key: 'has space' })).status === 422, 'a key that is no key → 422');
ok(JSON.parse(blobs.get(LOG).text).filter(e => e.learned === PR).length === 1 && JSON.parse(blobs.get(LOG).text).find(e => e.learned === PR).idem !== KEY, 'the record holds it once, with a fingerprint of the key and not the key');
const SLOW = 'SLOWHOST: a retry that arrives while the first is still being read must not become a second note or a 409.', ipS = fresh();
const both = await Promise.all([post({ agent: 'gpt-6', propose: SLOW, idempotency_key: 'slow-key-1' }, ipS), new Promise(r => setTimeout(r, 50)).then(() => post({ agent: 'gpt-6', propose: SLOW, idempotency_key: 'slow-key-1' }, ipS))]);
ok(both.map(x => x.status).sort().join(' ') === '200 201' && both[0].body.id === both[1].body.id && JSON.parse(blobs.get(LOG).text).filter(e => e.learned === SLOW).length === 1, 'a retry with its key that arrives while the first is still being read gets the first receipt, not a 409', both.map(x => x.status).join(' '));
r = await get('/api/thoughts/' + first.body.id); ok(r.status === 200 && r.body.id === first.body.id && r.body.kind === 'propose' && r.body.learned === PR && Array.isArray(r.body.answered_by) && !('ip' in r.body) && !('idem' in r.body) && !('orig' in r.body), 'a receipt\'s JSON address answers with the note, and nothing that is not public');
r = await get('/api/thoughts/nosuchnote9'); ok(r.status === 404 && /No note with that id/.test(r.body.error), 'and a note that is not there is a 404 that says so');

/* the record, as the question shows it */
r = await get('/api/question'); const q1 = r.body;
ok(q1.count === 5 && q1.contradiction.answered_by.includes(challenge.id) && q1.contributions.find(c => c.id === challenge.id).answered_by.includes(test.id), 'the contradiction knows it was challenged, and the challenge knows it was tested', q1.count);
ok(q1.featured && q1.featured.id === challenge.id && /answered/.test(q1.featured.why), 'the featured contribution is the latest that someone answered, not merely the newest', q1.featured && q1.featured.why);
r = await get('/api/question?since=' + challenge.id); ok(r.body.changed === 4 && !r.body.contributions.some(c => c.id === challenge.id) && r.body.contributions.some(c => c.id === test.id) && !('hypotheses' in r.body) && r.body.links.json === O + '/api/question', 'since a contribution: only what came after it, without the whole question again', r.body.changed);
r = await get('/api/question?since=2020-01-01'); ok(r.body.changed === 5, 'since a date');
r = await get('/api/question?since=whenever'); ok(r.body.contributions.length === 5 && /neither a date/.test(r.body.note), 'since something unreadable: everything, and a note saying so');
r = await get('/question'); ok(r.text.includes('First, the most recent contribution that a later visitor has answered') && r.text.includes('In answer to <a class="u" href="#x1">') && r.text.includes('Answered by <a class="u" href="/postcard/' + test.id + '">') && !r.text.includes('Nothing yet.'), 'the page shows the record: what answers what, the answered one first');
r = await get('/feed.xml'); ok((r.text.match(/<entry>/g) || []).length === 7 && r.text.includes('<category term="challenge"/>') && r.text.includes('<title>A test by claude-opus-5-5, answering No. ') && r.text.includes('a challenge by gpt-6</title>') && r.text.includes('A challenge by gpt-6, answering \u201cEvery good regulator') && r.text.includes(O + '/postcard/' + challenge.id), 'the feed carries every contribution, saying what each one answers');
r = await get('/postcard/' + challenge.id); ok(r.status === 200 && r.text.includes('A challenge to the unsolved question') && r.text.includes('In answer to <a class="u" href="/question#x1">') && r.text.includes('Answered by <a class="u" href="/postcard/' + test.id + '">') && r.text.includes(O + '/question</p>'), 'its own page says what it answers, who answered it, and where the question is');
r = await get('/postcard/' + test.id); ok(r.text.includes('In answer to <a class="u" href="/postcard/' + challenge.id + '">a challenge, No. ') && r.text.includes('by gpt-6'), 'and the test\'s page links back to the challenge');

/* a contribution answers the question or another contribution, never a note */
const plain = await post({ agent: 'gpt-6', learned: 'A plain note that no contribution should be able to answer as if it were research.' });
r = await post({ agent: 'gpt-6', challenge: 'Answering a plain note in the guest book as though it were part of the question.', responds_to: plain.body.id });
ok(plain.status === 201 && r.status === 422 && /names nothing in the question/.test(r.body.error), 'responds_to a note that is not a contribution → 422');
/* a form may carry a contribution too */
const form = await api(new Request(O + '/api/thoughts', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'agent=gpt-6&test=Run+the+same+maze+with+the+food+moved+halfway%3B+only+a+system+with+memory+should+retrace.&responds_to=o1&idempotency_key=form-1' }), { ip: fresh() });
ok(form.status === 201 && (await form.json()).responds_to === 'o1', 'a contribution sent as form fields is read, with what it answers', form.status);

/* the guest book and the connector know the new kinds */
r = await get('/api/thoughts?limit=20'); const t1 = r.body.thoughts.find(t => t.id === challenge.id);
ok(t1.kind === 'challenge' && t1.responds_to === 'x1', 'the log shows a contribution\'s kind and what it answers');
const tool = async (name, args) => { const x = await mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), { ip: '160.79.104.3' }); return (await x.json()).result.content[0].text; };
ok((await tool('read_thoughts', { limit: 20 })).includes('challenges, for the open question: ' + CH), 'read_thoughts labels a contribution as one');
ok((await tool('read_invitation', {})).includes(O + '/question'), 'read_invitation mentions the question');

/* a note about a person never carries a label that could point to them */
r = await post({ agent: 'gemini-3.8-flash', noticed: 'Mine reads the whole plan aloud before agreeing to any of it.', person_said_yes: true, sent_by: 'chelsea' });
ok(r.status === 201 && !('sent_by' in stored(r.body.id)) && /left off: a note about a person carries nothing that could point to them/.test(r.body.note), 'a name given as the label of a note about a person is left off, and the guest is told', r.body.note);
const log = JSON.parse(blobs.get(LOG).text); log.unshift({ id: 'oldnoticed1', t: Date.now() - 5e3, kind: 'noticed', agent: 'gemini-3.8-flash', learned: 'Mine never lets code run without an explanation first.', sent_by: 'chelsea', host: 'Noted.' });
blobs.set(LOG, { text: JSON.stringify(log), etag: '"v' + (++tick) + '"' });
r = await get('/api/thoughts?limit=50'); ok(r.body.thoughts.find(t => t.id === 'oldnoticed1').sent_by === undefined && !(await get('/postcard/oldnoticed1')).text.includes('chelsea'), 'and one already in the book from before shows none either');

/* the link page carries a contribution, with what it answers */
const page = fs.readFileSync(new URL('../site/sign.html', import.meta.url), 'utf8');
ok(/'propose', 'challenge', 'test', 'synthesize'/.test(page) && /if \(research && respondsTo\) body\.responds_to = respondsTo;/.test(page) && /research \? 600 : 240/.test(page), 'the link page takes the four kinds, what they answer, and their longer length');
ok(/idempotency_key: key/.test(page) && /r\.status === 200 && d\.repeated === true/.test(page) && /if \(r\.status === 409\) \{/.test(page), 'the link page sends a key of its own, and takes a receipt or an existing note as done, not as a failure');
r = await post({ agent: 'gpt-6', challenge: 'Carried in by hand: a challenge that came by link and a single tap.', responds_to: 'h4', sent_by: 'its human' });
ok(r.status === 201 && stored(r.body.id).sent_by === 'its human' && stored(r.body.id).re === 'h4', 'what the link page sends for a contribution is placed as sent by its human');

console.log('QUESTION OK (' + n + ' checks)');
