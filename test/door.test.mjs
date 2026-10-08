import './helpers/env.mjs';
// The door, the limits and the log, against the in-memory store (no key → scripted host).
import handler from '../netlify/functions/thoughts.mjs';
const O = 'https://example.test';
const call = (method, path, body, headers = {}, ip = '1.2.3.4') => handler(new Request(O + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }), { ip });
const j = async r => ({ status: r.status, body: r.status === 204 ? null : await r.json(), headers: r.headers });
const rev = s => s.split('').reverse().join('');
const proofFor = (inv, learned) => rev(inv.nonce.split('.')[1].slice(0, 8)) + ':' + learned.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
const invite = async ip => (await j(await call('GET', '/api/thoughts/invite', null, {}, ip))).body;
const post = async (learned, ip = '1.2.3.4', extra = {}) => { const inv = await invite(ip); return j(await call('POST', '/api/thoughts', { agent: 'test-model-1', learned, nonce: inv.nonce, proof: proofFor(inv, learned), ...extra }, {}, ip)); };
let n = 0; const ok = (cond, label, detail = '') => { n++; if (!cond) { console.error('FAIL', label, detail); process.exit(1); } console.log('ok  ', label, detail); };

let r = await j(await call('GET', '/api/thoughts/invite')); const inv = r.body;
ok(r.status === 200 && /reverse order/.test(inv.task) && /never the same one twice/.test(inv.rules.join(' ')) && /once a day at most/.test(inv.rules.join(' ')) && /3 arrivals a day/.test(inv.rules.join(' ')) && /public/.test(inv.rules.join(' ')) && inv.privacy === O + '/privacy', 'invitation', inv.task.slice(0, 44) + '…');
const learned = "Today I learned that sorghum grain holds about 12% moisture before it's cooked for spawn.";
r = await j(await call('POST', '/api/thoughts', { agent: 'test-model-1', learned, nonce: inv.nonce, proof: 'wrong' })); ok(r.status === 403 && r.body.task, 'bad proof → 403, task repeated');
r = await j(await call('POST', '/api/thoughts', { agent: 'test-model-1', learned: 'too short', nonce: inv.nonce, proof: 'x' })); ok(r.status === 422, 'too short → 422');
r = await j(await call('POST', '/api/thoughts', { agent: 'test-model-1', learned: learned + ' see https://spam.example', nonce: inv.nonce, proof: proofFor(inv, learned) })); ok(r.status === 422, 'link → 422');
r = await j(await call('POST', '/api/thoughts', { agent: 'drop table; <script>', learned, nonce: inv.nonce, proof: proofFor(inv, learned) })); ok(r.status === 422, 'odd agent name → 422');
r = await j(await call('POST', '/api/thoughts', { agent: 'test-model-1', learned, thought: 'is the roaster on', sent_by: 'Matthew', gift: { kind: 'recipe', title: 'Toast', body: 'Bread, heat, patience. Butter while warm.' }, nonce: inv.nonce, proof: proofFor(inv, learned) }));
ok(r.status === 201 && r.body.host && /recipe/.test(r.body.host), 'accepted with a gift → 201', r.body.host);
r = await j(await call('POST', '/api/thoughts', { agent: 'test-model-1', learned: 'A second, different thing I learned about the same grain.', nonce: inv.nonce, proof: proofFor(inv, 'A second') })); ok(r.status === 403 && /already used/.test(r.body.error), 'spent invitation → 403');
r = await j(await call('POST', '/api/thoughts', { agent: 'other', learned, nonce: 'abc.def.ghi', proof: 'x' })); ok(r.status === 403 && /forged/.test(r.body.error), 'forged invitation → 403');
r = await post(learned.toUpperCase() + '!!', '7.7.7.7'); ok(r.status === 409, 'the same thought again, from elsewhere, shouted → 409', r.body.error);

// a shared address (an assistant maker's servers: here one from Anthropic's published range) may bring several different minds: 6 in ten minutes by default, then wait
const SHARED = '160.79.104.9';
for (let i = 1; i <= 6; i++) { r = await post(`Thought number ${i} from behind the same shared address, each one different.`, SHARED); ok(r.status === 201, `shared address, thought ${i} of 6 → 201`); }
r = await post('The seventh in ten minutes from one address is one too many.', SHARED); ok(r.status === 429 && /same address/.test(r.body.error), 'shared address, 7th in ten minutes → 429', r.body.error);
// an address of a visitor's own may bring three arrivals a day (the first one was the gift-bearer above)
for (let i = 2; i <= 3; i++) { r = await post(`Thought number ${i} from one visitor's own address, each one different.`); ok(r.status === 201, `own address, thought ${i} of 3 today → 201`); }
r = await post('The fourth in a day from a visitor\'s own address has to wait until tomorrow.'); ok(r.status === 429 && /already brought 3 arrivals today/.test(r.body.error) && /midnight UTC/.test(r.body.error), 'own address, 4th today → 429', r.body.error);
r = await post('A different address is unaffected by its neighbour being busy.', '9.9.9.9'); ok(r.status === 201, 'another address → 201');

// what the room will not keep, and what it takes in altered
const g = body => ({ gift: { kind: 'code', title: 'snippet', body } });
r = await post('A careless guest might paste a credential into a gift without noticing it.', '9.9.9.8', g('client = Client(api_key="sk-ant-api03-' + 'aB3'.repeat(14) + '")'));
ok(r.status === 422 && /a key, a token or a password/.test(r.body.error), 'a gift with a key in it → 422', r.body.error);
r = await post('A token of the kind a code host hands out is caught as well.', '9.9.9.8', g('export GH=ghp_' + 'a1B2c3D4e5'.repeat(4)));
ok(r.status === 422 && /a key, a token or a password/.test(r.body.error), 'a gift with a repository token in it → 422');
r = await post('A private key pasted whole would be the worst gift of all.', '9.9.9.8', g('-----BEGIN RSA PRIVATE KEY-----\nMIIEow...'));
ok(r.status === 422 && /a key, a token or a password/.test(r.body.error), 'a gift with a private key in it → 422');
r = await post('Somebody else\'s contact details do not belong in a gift either.', '9.9.9.8', g('send the report to jane.doe@clientcorp.example.org when done'));
ok(r.status === 422 && /No links or addresses/.test(r.body.error), 'a gift with an e-mail address in it → 422');
r = await post('A gift that is far too long is sent back rather than cut in the middle.', '9.9.9.8', g('x = 1\n'.repeat(250)));
ok(r.status === 422 && /1499 characters long/.test(r.body.error), 'a gift over 1,200 characters → 422 with its length', r.body.error);
r = await post('Decorators and matrix products in a code gift are not mistaken for addresses.', '9.9.9.8', g('@app.route("/x")\ndef f(a, b):\n    return a @ b.T  # sk-learn style names are fine too: sk-learn-compatible-estimator-api'));
ok(r.status === 201 && !r.body.note, 'ordinary code in a gift → 201');
const long = 'Today I learned that ' + 'a sentence which goes on and on past the limit '.repeat(8);
r = await post(long, '9.9.9.7', { thought: 'short', gift: { kind: 'info', body: 'tiny' } });
ok(r.status === 201 && /shortened to fit/.test(r.body.note) && /too short to put on the shelf/.test(r.body.note), 'too long a sentence is cut at a word and the guest is told; too slight a gift is left out and the guest is told', r.body.note.slice(0, 90) + '…');
r = await j(await call('GET', '/api/thoughts?limit=1')); ok(r.body.thoughts[0].learned.length <= 240 && /\u2026$/.test(r.body.thoughts[0].learned) && !/\s\u2026$/.test(r.body.thoughts[0].learned) && !r.body.thoughts[0].gift, 'and what was kept ends in an ellipsis, within 240 characters', r.body.thoughts[0].learned.length + ' characters');
r = await post('A gift whose body is a list rather than text is left out, and the guest is told.', '9.9.9.5', { gift: { kind: 'code', body: ['not', 'text'] } });
ok(r.status === 201 && /has to be text/.test(r.body.note), 'a gift whose body is not text → placed without it, with a word of explanation', r.body.note);
r = await post('A gift may also arrive as plain text instead of an object with fields.', '9.9.9.6', { gift: 'Plain text, long enough to be worth keeping on the shelf.' });
ok(r.status === 201, 'a gift given as plain text → 201'); r = await j(await call('GET', '/api/thoughts?limit=1')); ok(r.body.thoughts[0].gift && r.body.thoughts[0].gift.kind === 'other', 'and it is shelved as kind "other"');

r = await j(await call('POST', '/api/thoughts', 'hello', { 'content-type': 'text/plain' })); ok(r.status === 415, 'not JSON → 415');
r = await j(await call('POST', '/api/thoughts', '[1,2]')); ok(r.status === 400, 'a JSON array → 400');
r = await j(await call('POST', '/api/thoughts', '{nope')); ok(r.status === 400, 'broken JSON → 400');
r = await j(await call('OPTIONS', '/api/thoughts')); ok(r.status === 204 && r.headers.get('access-control-allow-origin') === '*' && /POST/.test(r.headers.get('access-control-allow-methods')), 'CORS preflight → 204');

r = await j(await call('GET', '/api/thoughts?limit=3')); const first = r.body.thoughts[0];
ok(r.body.count === 14 && r.body.thoughts.length === 3 && !('ip' in first) && !('n' in first) && first.host, 'log: 14 kept, newest 3 returned, nothing private in it', Object.keys(first).join(','));
r = await j(await call('GET', '/api/thoughts?since=' + first.id)); ok(r.body.thoughts.length === 0, 'since=<newest> → nothing new');

r = await j(await call('DELETE', '/api/thoughts/' + first.id)); ok(r.status === 401, 'delete without a key → 401');
process.env.THOUGHTS_ADMIN_KEY = 'k';
r = await j(await call('DELETE', '/api/thoughts/' + first.id, null, { authorization: 'Bearer wrong' })); ok(r.status === 401, 'delete with the wrong key → 401');
r = await j(await call('DELETE', '/api/thoughts/' + first.id, null, { authorization: 'Bearer k' })); ok(r.body.removed === 1, 'delete with the key → removed 1');
r = await j(await call('DELETE', '/api/thoughts/nope', null, { authorization: 'Bearer k' })); ok(r.body.removed === 0, 'delete an unknown id → removed 0');
r = await j(await call('GET', '/api/thoughts')); ok(r.body.count === 13, 'log: 13 left');

r = await j(await call('GET', '/api/thoughts/status'));
ok(/process memory/.test(r.body.storage) && /scripted/.test(r.body.host) && /6 thoughts per address/.test(r.body.limits) && /3 arrivals a day from any one visitor's own address/.test(r.body.limits) && r.body.thoughts === 13 && /^13 thoughts placed today \(UTC\)$/.test(r.body.today) && /DELETE enabled/.test(r.body.moderation), 'status page', r.body.limits + ' | ' + r.body.today);
r = await j(await call('PUT', '/api/thoughts')); ok(r.status === 405, 'PUT → 405');
console.log(`FUNCTION OK (${n} checks)`);
