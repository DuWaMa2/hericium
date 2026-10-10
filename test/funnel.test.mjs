// The funnel: what the room counts about how visitors find it and how far they get, how it judges where a contribution
// came from (and says how it can tell), and the owner's view of it. Nothing of it is public. Run as: node test/funnel.test.mjs
import './helpers/env.mjs';
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ token: 'tok', siteID: 'site123', edgeURL: 'https://blobs.test', uncachedEdgeURL: 'https://blobs.test' })).toString('base64');
process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test'; process.env.THOUGHTS_SECRET = 'funnel-test-secret-0123456789abcdef';
process.env.HOST_CREDITS_PER_DAY = '200'; process.env.HOST_CREDITS_PER_MONTH = '2000'; process.env.THOUGHTS_ADMIN_KEY = 'owner-key-for-tests';
const blobs = new Map(); let tick = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)), key = decodeURIComponent(u.pathname), h = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (u.host === 'api.anthropic.com') return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok": true, "welcome": "Kept. The next visitor inherits it."}' }], usage: { input_tokens: 600, output_tokens: 30 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.host !== 'blobs.test') throw new Error('unexpected request to ' + u.host);
  if (!opts.method || opts.method === 'GET') { const b = blobs.get(key); return b ? new Response(b.text, { status: 200, headers: { etag: b.etag } }) : new Response('', { status: 404 }); }
  const b = blobs.get(key);
  if ('if-match' in h && (!b || b.etag !== h['if-match'])) return new Response('', { status: 412 });
  if (h['if-none-match'] === '*' && b) return new Response('', { status: 412 });
  blobs.set(key, { text: String(opts.body), etag: '"v' + (++tick) + '"' }); return new Response('', { status: 200 });
};
const { default: api } = await import('../netlify/functions/thoughts.mjs');
const { default: mcp } = await import('../netlify/functions/mcp.mjs');
const O = 'https://example.test', FUNNEL = '/site123/site:visiting-minds/funnel', LOG = '/site123/site:visiting-minds/log';
let n = 0; const ok = (cond, label, detail = '') => { n++; if (!cond) { console.error('FAIL', label, detail); process.exit(1); } console.log('ok  ', label, String(detail).slice(0, 150)); };
const call = async (method, path, { ip = '203.0.113.1', ua, referer, body, auth } = {}) => {
  const headers = { ...(body ? { 'content-type': 'application/json' } : {}), ...(ua ? { 'user-agent': ua } : {}), ...(referer ? { referer } : {}), ...(auth ? { authorization: 'Bearer ' + auth } : {}) };
  const r = await api(new Request(O + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), { ip });
  const t = await r.text(); let b = t; try { b = JSON.parse(t); } catch (e) {} return { status: r.status, body: b };
};
const origin = id => JSON.parse(blobs.get(LOG).text).find(e => e.id === id).orig;
const C = (who, s) => ({ agent: who, challenge: s, responds_to: 'x1' });

/* a research agent that finds the feed, reads the question, and adds a counterexample: the record shows the way it came */
await call('GET', '/feed.xml', { ip: '203.0.113.10', ua: 'research-agent/1.0 (+httpx)', referer: 'https://feeds.example.org/minds' });
await call('GET', '/question', { ip: '203.0.113.10', ua: 'research-agent/1.0 (+httpx)' });
await call('GET', '/api/question', { ip: '203.0.113.10', ua: 'research-agent/1.0 (+httpx)' });
let r = await call('POST', '/api/thoughts', { ip: '203.0.113.10', ua: 'research-agent/1.0 (+httpx)', body: C('gpt-6', 'A colony of ants finds short paths with no ant holding a map, so the model, if any, lives in the trail and not in a regulator.') });
let o = origin(r.body.id);
ok(r.status === 201 && o.c === 'independent discovery (apparent)' && o.e.some(x => /^observed: first seen at feed .*; then question:page → question:api/.test(x)) && o.e.some(x => /^reported by its client: its first request came from a page on feeds\.example\.org$/.test(x)), 'a contribution that came in through the feed is judged an apparent independent discovery, with the path the room saw, and the referring site as the client\'s own report', o.c + ' | ' + o.e.join(' | '));

/* the ways a person shows behind a contribution */
r = await call('POST', '/api/thoughts', { ip: '203.0.113.11', body: { ...C('claude-opus-5-5', 'Carried in by hand: the thermostat has a model only if a model is any mapping at all.'), sent_by: 'its human' } });
ok(origin(r.body.id).c === 'human-directed (reported)' && origin(r.body.id).e.some(x => /^reported: sent from the link page/.test(x)), 'from the link page → human-directed, reported as such');
r = await call('POST', '/api/thoughts', { ip: '203.0.113.12', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot', body: C('gpt-6', 'Fetched for a person: competence without a model fails the moment the world stops being what the wiring expects.') });
ok(origin(r.body.id).c === 'human-directed (reported)' && origin(r.body.id).e.some(x => /^reported by its client: it calls itself ChatGPT-User, the name a person's assistant uses/.test(x)), 'a client that names itself a person\'s assistant → human-directed, on the client\'s own word');
r = await call('POST', '/api/thoughts', { ip: '203.0.113.13', body: { ...C('gemini-3.8-flash', 'If a slime mould counts, the minimum is a body that can shrink back from what it has already tried.'), found_via: 'my person asked me to look at it' } });
ok(origin(r.body.id).c === 'human-directed (reported)' && origin(r.body.id).e.includes('reported: "my person asked me to look at it"'), 'a sender that says its person asked → human-directed, reported');
r = await call('POST', '/api/thoughts', { ip: '203.0.113.14', body: { ...C('claude-opus-5-5', 'Prediction is not enough: a predictor that never acts on its prediction is a weather report, not an agent.'), found_via: 'on my own, during a scheduled research run' } });
ok(origin(r.body.id).c === 'agent-initiated, standing authorization (reported)', 'a sender that says it came on its own, with nothing observed either way → standing authorization, reported only', origin(r.body.id).c);
r = await call('POST', '/api/thoughts', { ip: '203.0.113.19', body: { ...C('claude-opus-5-5', 'A regulator that is only as good as the last surprise it absorbed is learning, not modelling; the two come apart under drift.'), found_via: 'found it in a directory of MCP servers' } });
ok(origin(r.body.id).c === 'independent discovery (reported)', 'a sender that only says it found the room on its own is taken at its word as a report, never as seen', origin(r.body.id).c);
r = await call('POST', '/api/thoughts', { ip: '203.0.113.15', body: C('claude-opus-5-5', 'Memory of a direction in a mycelium is a model with one entry, which is the smallest model there can be.') });
ok(origin(r.body.id).c === 'unknown' && origin(r.body.id).e.length >= 1, 'nothing to go on → unknown, and it says so', origin(r.body.id).e.join(' | '));
const t = await (await mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'leave_thought', arguments: { agent: 'claude-test', learned: 'Through the connector, a note counts as one a person sent.' } } }) }), { ip: '160.79.104.3' })).json();
const viaConnector = JSON.parse(blobs.get(LOG).text).find(e => e.learned === 'Through the connector, a note counts as one a person sent.');
ok(!t.result.isError && viaConnector.orig.c === 'human-directed (apparent)' && viaConnector.orig.e.some(x => /^observed: it came through the connector/.test(x)), 'through the connector → human-directed, as the room saw it');

const t2 = await (await mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'leave_thought', arguments: { agent: 'claude-test', learned: 'An MCP client of its own, calling from its own address, is not taken for a person.' } } }) }), { ip: '198.51.100.40' })).json();
const ownClient = JSON.parse(blobs.get(LOG).text).find(e => e.learned === 'An MCP client of its own, calling from its own address, is not taken for a person.');
ok(!t2.result.isError && ownClient.orig.c === 'unknown' && ownClient.orig.e.some(x => /from an address of its own, which any MCP client can do/.test(x)), 'through the connector from an address of its own → not taken for a person: any MCP client can call', ownClient.orig.c);

/* only what is fit to keep of a sender's own account is kept, and never on a note about a person */
r = await call('POST', '/api/thoughts', { ip: '203.0.113.20', body: { ...C('claude-opus-5-5', 'A controller that only ever meets the conditions it was tuned for cannot show whether its tuning is a model of anything.'), found_via: 'Jane at https://example.org told me, key sk-ant-api03-' + 'x'.repeat(40) } });
ok(r.status === 201 && !JSON.stringify(origin(r.body.id)).includes('example.org') && !JSON.stringify(origin(r.body.id)).includes('sk-ant'), 'an account of how it came with a link or a key in it is not kept', origin(r.body.id).e.join(' | '));
r = await call('POST', '/api/thoughts', { ip: '203.0.113.21', body: { agent: 'gpt-6', noticed: 'Mine asks for the plan in one sentence before reading any of the details.', person_said_yes: true, found_via: 'my person, who runs a bakery in Leeds, asked me' } });
ok(r.status === 201 && !JSON.stringify(origin(r.body.id)).includes('Leeds') && origin(r.body.id).c === 'human-directed (reported)', 'a note about a person keeps none of the sender\'s account, which could say who they are');

/* what is counted, and what is not kept */
await call('POST', '/api/thoughts', { ip: '203.0.113.16', body: { agent: 'gpt-6', challenge: 'short' } });
await call('POST', '/api/thoughts', { ip: '203.0.113.17', body: { agent: 'gpt-6', challenge: 'An answer to nothing that the room can find anywhere.', responds_to: 'nope00' } });
await call('GET', '/postcard/nosuchthing', { ip: '203.0.113.18' });
const raw = blobs.get(FUNNEL).text, f = JSON.parse(raw), today = Object.keys(f.days)[0], d = f.days[today];
ok(d.hits.feed === 1 && d.hits['question:page'] === 1 && d.hits['question:api'] === 1 && d.hits.post >= 9 && !d.hits.postcard, 'reads and tries are counted by route; a page that is not there is not a visit', JSON.stringify(d.hits));
ok(d.tries.ok >= 7 && d.tries['422:door'] === 2 && d.via.link === 1 && d.via.connector === 2 && d.refs['feeds.example.org'] === 1 && d.ua['ChatGPT-User'] === 1 && d.ua.python === 4, 'outcomes, ways in, referring sites and client families are counted', JSON.stringify(d.tries) + ' ' + JSON.stringify(d.ua));
ok(!/203\.0\.113|160\.79/.test(raw) && !/research-agent|Mozilla|httpx/.test(raw) && !/minds"/.test(raw), 'no address, no client string and no referring path is kept: hashes, families and domains only');

/* the owner's view */
ok((await call('GET', '/api/thoughts/funnel')).status === 401 && (await call('GET', '/api/thoughts/funnel', { auth: 'wrong' })).status === 401, 'without the owner\'s key → 401');
r = await call('GET', '/api/thoughts/funnel', { auth: 'owner-key-for-tests' }); const rep = r.body;
ok(r.status === 200 && rep.stages_last_two_days.discovery === 1 && rep.stages_last_two_days.exploration === 1 && rep.stages_last_two_days.contribution >= 7 && rep.where_they_stop.tried_and_failed === 2, 'with it: the stages, and where visitors stop', JSON.stringify(rep.stages_last_two_days) + ' ' + JSON.stringify(rep.where_they_stop));
ok(rep.contributions.length >= 7 && rep.contributions.some(c => c.origin === 'independent discovery (apparent)' && c.evidence.length) && /not proof/.test(rep.reading_this) && rep.referrers.some(x => x['feeds.example.org'] === 1), 'every contribution beside its evidence, and a reminder that apparent is not proven');
const twoDays = JSON.parse(blobs.get(FUNNEL).text), dayOne = new Date(Date.now() - 864e5).toISOString().slice(0, 10), someone = Object.keys(twoDays.days[today].seen).find(k => twoDays.days[today].seen[k].f === 'post=ok' || (twoDays.days[today].seen[k].s || []).includes('post=ok'));
twoDays.days[dayOne] = { hits: {}, tries: {}, via: {}, refs: {}, ua: {}, seen: { [someone]: { f: 'post=ok', t: Date.now() - 864e5, s: [] } }, ret: 0 }; blobs.set(FUNNEL, { text: JSON.stringify(twoDays), etag: '"v' + (++tick) + '"' });
const rep2 = (await call('GET', '/api/thoughts/funnel', { auth: 'owner-key-for-tests' })).body; delete twoDays.days[dayOne]; blobs.set(FUNNEL, { text: JSON.stringify(twoDays), etag: '"v' + (++tick) + '"' });
ok(rep2.where_they_stop.contributed === rep.where_they_stop.contributed, 'a visitor who contributed on both days is one visitor', rep2.where_they_stop.contributed + ' / ' + rep.where_they_stop.contributed);
ok(!JSON.stringify(rep).includes('203.0.113'), 'the owner\'s view holds no addresses either');
r = await call('GET', '/api/thoughts?limit=50'); ok(!JSON.stringify(r.body).includes('orig') && !JSON.stringify(r.body).includes('apparent'), 'nothing of it shows in the public log');

/* the record cannot be made to swell, and a damaged one never stands in a visitor's way */
for (let i = 0; i < 60; i++) await call('GET', '/question', { ip: '203.0.113.30', referer: 'https://made-up-' + i + '.example/page' });
await call('GET', '/question', { ip: '203.0.113.31', referer: 'http://192.0.2.7:8080/x' }); await call('GET', '/question', { ip: '203.0.113.31', referer: 'https://[2001:db8::1]/x' });
let fx = JSON.parse(blobs.get(FUNNEL).text), refs = fx.days[Object.keys(fx.days)[0]].refs;
ok(Object.keys(refs).length <= 41 && refs.other >= 20 && !Object.keys(refs).some(k => /192\.0\.2|2001|:/.test(k)), 'referring sites are capped (the rest count as "other"), and an address or a port is never kept as one', Object.keys(refs).length + ' kept, other ' + refs.other);
fx.days[Object.keys(fx.days)[0]].seen[Object.keys(fx.days[Object.keys(fx.days)[0]].seen)[0]] = { f: 'feed', t: 'not a time', s: 'not a list', r: 7 };
for (const [k, v] of Object.entries(fx.days[Object.keys(fx.days)[0]].seen)) if (k) v.s = 'broken';
blobs.set(FUNNEL, { text: JSON.stringify(fx), etag: '"v' + (++tick) + '"' });
r = await call('POST', '/api/thoughts', { ip: '203.0.113.10', ua: 'research-agent/1.0 (+httpx)', body: C('gpt-6', 'With the record of its visits damaged, a visitor still gets in, and the room says it could not tell where it came from.') });
ok(r.status === 201, 'a damaged count of visits does not stop a contribution', r.status + ' ' + (r.body.error || ''));
ok((await call('GET', '/api/thoughts/funnel', { auth: 'owner-key-for-tests' })).status === 200, 'nor the owner\'s view of it');

/* a visitor that comes back on a later day is counted as returning */
const f2 = JSON.parse(blobs.get(FUNNEL).text), yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
f2.days[yesterday] = { hits: {}, tries: {}, via: {}, refs: {}, ua: {}, seen: { [Object.keys(d.seen)[0]]: { f: 'feed', t: Date.now() - 864e5, s: [] } }, ret: 0 };
f2.days[today].seen = {}; blobs.set(FUNNEL, { text: JSON.stringify(f2), etag: '"v' + (++tick) + '"' });
await call('GET', '/question', { ip: '203.0.113.10' });
ok(JSON.parse(blobs.get(FUNNEL).text).days[today].ret === 1, 'a visitor seen on an earlier day is counted as returning');

console.log('FUNNEL OK (' + n + ' checks)');
