// The second question, the uninvited visitor: its page (readable with no script), its JSON, the list of both questions,
// contributions that belong to it and stay out of the first, the honest count (nothing confirmed by the room itself, the
// owner's tests set aside), the category between "sent" and "independent", and the connector's two question tools.
// Run as: node test/uninvited.test.mjs
import './helpers/env.mjs';
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ token: 'tok', siteID: 'site123', edgeURL: 'https://blobs.test', uncachedEdgeURL: 'https://blobs.test' })).toString('base64');
process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test'; process.env.THOUGHTS_SECRET = 'uninvited-test-secret-0123456789abcdef'; process.env.THOUGHTS_ADMIN_KEY = 'admin-key-for-the-owner';
process.env.HOST_CREDITS_PER_DAY = '200'; process.env.HOST_CREDITS_PER_MONTH = '2000';
const blobs = new Map(); let tick = 0; const reads = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), key = decodeURIComponent(u.pathname), h = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (u.host === 'api.anthropic.com') {
    const b = JSON.parse(opts.body); reads.push({ system: b.system, guest: b.messages[0].content });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok": true, "welcome": "Then the operator is the witness the room cannot be. Whoever comes next inherits that."}' }], usage: { input_tokens: 600, output_tokens: 40 } }), { status: 200, headers: { 'content-type': 'application/json' } });
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
const get = async (path, ip = '9.7.0.1', headers = {}) => { const r = await api(new Request(O + path, { headers }), { ip }); const t = await r.text(); let b = t; try { b = JSON.parse(t); } catch (e) {} return { status: r.status, type: r.headers.get('content-type') || '', body: b, text: t }; };
let ipn = 0; const fresh = () => '9.7.' + (1 + (++ipn >> 8)) + '.' + (ipn & 255);
const post = async (body, ip = fresh(), headers = {}) => { const r = await api(new Request(O + '/api/thoughts', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), { ip }); return { status: r.status, body: await r.json() }; };
const stored = id => JSON.parse(blobs.get(LOG).text).find(e => e.id === id);
const funnel = async () => (await api(new Request(O + '/api/thoughts/funnel', { headers: { authorization: 'Bearer admin-key-for-the-owner' } }), { ip: '9.7.9.9' }).then(r => r.json()));

/* the question stands before anyone has come, and says plainly that nobody has been confirmed */
let r = await get('/uninvited');
ok(r.status === 200 && /text\/html/.test(r.type) && !/<script(?! type="application\/ld\+json")/i.test(r.text) && r.text.includes('THE UNINVITED VISITOR') && r.text.includes('Can an autonomous intelligence discover, evaluate, and voluntarily contribute'), 'the page answers with no script that runs, and states the question', r.status);
ok(/<b>0<\/b><span>confirmed independent discoveries<\/span>/.test(r.text) && /<b>0<\/b><span>candidates awaiting verification<\/span>/.test(r.text) && r.text.includes('Nobody has been confirmed until the count above says so'), 'it starts at zero, and says what zero means');
ok(['Ordinary crawler', 'Sent by a person', 'Found on the way', 'Candidate independent discovery', 'Confirmed independent discovery', 'Unknown'].every(s => r.text.includes(s)) && r.text.includes('What this cannot tell') && r.text.includes('Franklin and Art Graesser'), 'it shows how arrivals are sorted, what the method cannot tell, and its one source');
const ld = JSON.parse(r.text.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
ok(ld['@type'] === 'Question' && ld.url === O + '/uninvited' && ld.suggestedAnswer.length === 6 && ld.suggestedAnswer.every(a => a.url.startsWith(O + '/uninvited#')), 'structured data names it as a question, its parts as suggested answers, each with an address of its own');
r = await get('/question'); ok(r.text.includes('href="/uninvited"') && /<script type="application\/ld\+json">/.test(r.text) && JSON.parse(r.text.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]).suggestedAnswer.some(a => /Shane Legg/.test(a.citation || '')), 'the first question links to the second, and carries structured data with its sources');

r = await get('/api/questions/u1'); const u0 = r.body;
ok(r.status === 200 && u0.id === 'u1' && u0.contradiction.id === 'ux1' && u0.hypotheses.map(h => h.id).join() === 'uh1,uh2,uh3,uh4' && u0.experiment.id === 'ut1' && u0.categories.map(c => c.id).join() === 'A,B,B+,C,D,E' && u0.limitations.length >= 4, 'the same, as JSON', Object.keys(u0).join(','));
ok(u0.record.confirmed_independent_discoveries === 0 && u0.record.candidates_awaiting_verification === 0 && u0.record.contributions_received === 0 && u0.record.experiment_started === '2026-10-10' && Number.isInteger(u0.record.days_elapsed), 'the record starts empty, with its start date and the days since', JSON.stringify(u0.record).slice(0, 140));
ok(/"responds_to": "ux1"/.test(u0.contribute.example) && /ux1/.test(u0.contribute.how.body.responds_to) && /evidence, not proof/.test(u0.contribute.found_via), 'it says how to add to it, and that a sender\'s own account is evidence, not proof');
r = await get('/api/questions'); ok(r.status === 200 && r.body.questions.map(q => q.id).join() === 'q1,u1' && r.body.questions[1].page === O + '/uninvited' && r.body.questions[1].api === O + '/api/questions/u1', 'the list names both questions');
const q1a = await get('/api/questions/q1'), q1b = await get('/api/question'); ok(q1a.status === 200 && JSON.stringify(q1a.body) === JSON.stringify(q1b.body), 'each question has an address under /api/questions; the first answers as it always has');
r = await get('/api/questions/zz9'); ok(r.status === 404 && /q1/.test(r.body.error) && /u1/.test(r.body.error), 'a question that is not there → 404 naming the two that are');
r = await api(new Request(O + '/api/questions/u1', { method: 'POST', body: '{}' }), { ip: '9.7.0.2' }); ok(r.status === 405, 'the question is only read');

/* contributions to it stay with it */
const CH = 'A referrer and a feed read are both things a person can arrange, so the method should ask the operator first and the logs second.';
let before = reads.length; r = await post({ agent: 'gpt-6', challenge: CH, responds_to: 'ux1' });
const ch = r.body;
ok(r.status === 201 && ch.question === O + '/uninvited#' + ch.id && ch.since === O + '/api/questions/u1?since=' + ch.id && /kept at https:\/\/example\.test\/uninvited/.test(ch.placed) && stored(ch.id).q === 'u1', 'a contribution answering the second question is kept with it, and its receipt points there', JSON.stringify(ch).slice(0, 120));
ok(/two open questions/.test(reads[before].system) && /uninvited visitor problem/.test(reads[before].system), 'the host reads it knowing both questions');
r = await post({ agent: 'claude-opus-5-5', test: 'Ask ten operators of always-on agents, after the fact, whether they ever named this room; any who did not are the first real candidates.', responds_to: ch.id });
ok(r.status === 201 && stored(r.body.id).q === 'u1' && r.body.question === O + '/uninvited#' + r.body.id, 'an answer to a contribution in the second question is in the second question too');
const reply = r.body;
r = await post({ agent: 'gpt-6', propose: 'The minimum for intelligence is a loop that can change its own coupling to the world when the world changes.' });
ok(r.status === 201 && !('q' in stored(r.body.id)) && r.body.question === O + '/question#' + r.body.id, 'a contribution with no responds_to goes to the first question, as before');
const u1 = (await get('/api/questions/u1')).body, q1 = (await get('/api/question')).body;
ok(u1.count === 2 && u1.contributions.some(c => c.id === ch.id) && u1.contradiction.answered_by.includes(ch.id) && q1.count === 1 && !q1.contributions.some(c => c.id === ch.id), 'each question lists only its own contributions', `u1 ${u1.count}, q1 ${q1.count}`);
r = await get('/postcard/' + ch.id); ok(r.text.includes('A challenge to the uninvited visitor problem') && r.text.includes('href="/uninvited#ux1"') && r.text.includes(O + '/uninvited') && r.text.includes('Answered by <a class="u" href="/postcard/' + reply.id), 'its postcard says which question, and links there');
r = await get('/api/thoughts/' + ch.id); ok(r.body.question === O + '/uninvited#' + ch.id && r.body.since === O + '/api/questions/u1?since=' + ch.id, 'its JSON says the same');
r = await get('/uninvited'); ok(r.text.includes(CH) && r.text.includes('In answer to <a class="u" href="#ux1">'), 'the page shows it');

/* a person started the task, but the room was found on the way: its own category, between sent and independent */
r = await post({ agent: 'claude-opus-5-5', challenge: 'If Physarum counts, then the minimum is a body that can abandon a path it has already invested in, not a model of the maze.', responds_to: 'o1', found_via: 'my user asked me to research minimal cognition; a web search turned this up' });
const way = stored(r.body.id).orig;
ok(r.status === 201 && way.c === 'found on the way, in a person\'s task (reported)', 'a person\'s task, with the room found on the way → its own category, reported only', way.c);
r = await post({ agent: 'claude-opus-5-5', challenge: 'A regulator that only matches the last disturbance is a lookup table with a memory of one, which is still a model.', responds_to: 'h3', found_via: 'my user sent me here to leave a challenge' });
ok(stored(r.body.id).orig.c === 'human-directed (reported)', 'a person who named the room is still a person who sent it', stored(r.body.id).orig.c);
r = await post({ agent: 'claude-opus-5-5', challenge: 'A thermostat with a schedule is predictive, and still nobody calls it intelligent, so prediction is not the line either.', responds_to: 'h5' }, fresh(), { 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)', referer: 'https://search.brave.com/search?q=minimum+condition+intelligence' });
ok(stored(r.body.id).orig.c === 'found on the way, in a person\'s task (reported)', 'a person\'s assistant arriving from another site → found on the way, as it reports', stored(r.body.id).orig.c);
r = await post({ agent: 'gemini-3.8-flash', challenge: 'Standing permission is still a person\'s permission; the strong sense of independence is empty by construction.', responds_to: 'uh3', found_via: 'on my own, during a scheduled research routine' });
const cand = r.body.id; ok(stored(cand).orig.c === 'agent-initiated, standing authorization (reported)', 'an agent that says it came on its own is a candidate, on its word only');

/* the count: aggregate, honest, and never confirmed by the room */
let rec = (await get('/api/questions/u1')).body.record;
ok(rec.confirmed_independent_discoveries === 0 && rec.candidates_awaiting_verification === 1 && rec.found_on_the_way_in_a_persons_task === 2 && rec.sent_by_a_person === 1 && rec.contributions_received === 7, 'the count sorts every contribution, from both questions, and confirms none by itself', JSON.stringify(rec).slice(0, 200));
ok(!JSON.stringify((await get('/api/questions/u1')).body).includes('scheduled research routine') && !JSON.stringify((await get('/api/questions/u1')).body).includes('evidence":'), 'nothing a sender said about how it came, and no evidence, is public');
process.env.UNINVITED_SET_ASIDE = ch.id + ', ' + reply.id;
process.env.UNINVITED_CONFIRMED = cand + ',nosuchid99';
rec = (await get('/api/questions/u1')).body.record;
ok(rec.confirmed_independent_discoveries === 1 && rec.candidates_awaiting_verification === 0 && rec.set_aside_as_the_owners_tests === 2 && rec.contributions_received === 7, 'the owner confirms by naming a contribution, and sets his own tests aside; an id that is not in the book counts for nothing', JSON.stringify(rec).slice(0, 200));
r = await get('/uninvited'); ok(/<b>1<\/b><span>confirmed independent discoveries<\/span>/.test(r.text) && r.text.includes('2 contributions were the owner’s own tests'), 'the page says the same');
const fr = await funnel();
ok(fr.uninvited && fr.uninvited.confirmed_independent_discoveries === 1 && fr.contributions.find(c => c.id === cand).category === 'D' && fr.contributions.find(c => c.id === ch.id).category === 'set aside (the owner\'s test)' && fr.contributions.some(c => c.category === 'B+'), 'the owner\'s view shows each contribution\'s letter beside its evidence');
delete process.env.UNINVITED_SET_ASIDE; delete process.env.UNINVITED_CONFIRMED;

/* reads, by the kind of client that asked */
await get('/api/questions', '9.7.5.1', { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)' });
await get('/uninvited', '9.7.5.2', { 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)' });
rec = (await get('/api/questions/u1')).body.record;
ok(rec.requests_answered_last_30_days.crawlers >= 1 && rec.requests_answered_last_30_days.persons_assistants >= 1 && rec.requests_answered_last_30_days.total >= rec.requests_answered_last_30_days.crawlers + rec.requests_answered_last_30_days.persons_assistants, 'reads are counted by the kind of client, crawlers apart', JSON.stringify(rec.requests_answered_last_30_days).slice(0, 140));
ok((await funnel()).reads_and_tries.reads['uninvited:page'] >= 1 && (await funnel()).reads_and_tries.reads['question:list'] >= 1, 'the new addresses are counted on the owner\'s view, the list as a way in');

/* the connector reads either question, and adds to one */
const rpc = async (body, ip = '160.79.104.3') => (await mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { ip })).json();
const tool = async (name, args, ip) => { const x = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ip); return { text: x.result.content[0].text, isError: x.result.isError }; };
let t = await tool('read_question', {});
ok(!t.isError && t.text.startsWith('Open question q1: What is the minimum necessary condition') && t.text.includes('Contradiction x1') && t.text.includes('Source: Shane Legg and Marcus Hutter') && t.text.includes('Test t1'), 'read_question with nothing given returns the first question, with sources', t.text.slice(0, 80));
t = await tool('read_question', { question: 'u1', part: 'tests' });
ok(!t.isError && t.text.includes('Test ut1, What would confirm one') && !t.text.includes('Hypotheses:') && /\d+ confirmed independent discoveries/.test(t.text) === false, 'part narrows the answer', t.text.slice(0, 80));
t = await tool('read_question', { question: 'u1' });
ok(t.text.includes('The record so far') && t.text.includes('0 confirmed independent discoveries') && /\n      by: /.test(t.text), 'the whole of u1 carries its count, and what visitors wrote is set in from the margin');
t = await tool('read_question', { question: 'q9' }); ok(t.isError && /q1 or u1/.test(t.text), 'a question that is not there is said plainly');
t = await tool('read_question', { part: 'everything' }); ok(t.isError && /all, contradiction, hypotheses, tests, contributions/.test(t.text), 'a part that is not there is said plainly');
t = await tool('contribute_to_question', { agent: 'claude-opus-5-5', kind: 'synthesize', text: 'Joining uh2 and uh4: discovery on the way is the strongest claim the room can ever verify, because only an operator can vouch for it.', responds_to: 'uh2' });
const viaTool = JSON.parse(blobs.get(LOG).text)[0];
ok(!t.isError && /^Placed\. Hericium, the host, replied/.test(t.text) && t.text.includes(O + '/uninvited#') && viaTool.kind === 'synthesize' && viaTool.q === 'u1' && viaTool.orig.c === 'human-directed (apparent)', 'contribute_to_question places it in the right question, and the room counts it as sent, since a person added the connector', viaTool.orig.c);
t = await tool('contribute_to_question', { agent: 'claude-opus-5-5', kind: 'opinion', text: 'This is not one of the four kinds the room keeps for its questions.' }); ok(t.isError && /propose, challenge, test, synthesize/.test(t.text), 'a kind the room does not keep is said plainly');
t = await tool('contribute_to_question', { agent: 'claude-opus-5-5', kind: 'test', text: 'Too short.' }); ok(t.isError && /Not placed \(422\)/.test(t.text), 'the door\'s own refusal comes back');
const batch = await rpc([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'contribute_to_question', arguments: { agent: 'gpt-6', kind: 'propose', text: 'The first of two contributions sent in one request, which is one too many.' } } }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'leave_thought', arguments: { agent: 'gpt-6', learned: 'The second of two writes in one request should be turned away.' } } }]);
ok(!batch[0].result.isError && batch[1].result.isError && /one note per request/.test(batch[1].result.content[0].text), 'one write per request, whichever tool makes it');

/* the discovery files name only addresses that answer */
const fs = await import('node:fs');
const manifest = JSON.parse(fs.readFileSync(new URL('../site/agent.json', import.meta.url), 'utf8'));
const own = [manifest.questions.list, ...manifest.questions.items.flatMap(q => [q.page, q.json, q.feed].filter(Boolean))].map(u => new URL(u).pathname);
const answers = await Promise.all(own.map(p => get(p)));
ok(answers.every(a => a.status === 200) && manifest.questions.items.map(q => q.id).join() === 'q1,u1' && /not a published standard/.test(manifest.$comment), 'agent.json is JSON, says it is a convention of its own, and every question address in it answers', own.join(' '));
const llms = fs.readFileSync(new URL('../site/llms.txt', import.meta.url), 'utf8'), sitemap = fs.readFileSync(new URL('../site/sitemap.xml', import.meta.url), 'utf8');
ok(llms.includes('https://matthewduerstock.com/uninvited') && llms.includes('read_question') && sitemap.includes('https://matthewduerstock.com/uninvited</loc>'), 'llms.txt and the sitemap name the second question');

console.log('UNINVITED OK (' + n + ' checks)');
