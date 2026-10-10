import './helpers/env.mjs';
// The hourly ceilings and the host's budget, with a mocked Claude. Run as: node test/limits.test.mjs <case>
const which = process.argv[2];
const O = 'https://example.test';
let claudeCalls = 0, claudeSays = () => '{"ok": true, "welcome": "Fine thing to know."}', claudeDelay = 0, seenKey = null;
const real = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.anthropic.com')) {
    claudeCalls++; seenKey = opts.headers['x-api-key'];
    if (claudeDelay) await new Promise(r => setTimeout(r, claudeDelay * (0.5 + Math.random())));
    const b = JSON.parse(opts.body);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: b.max_tokens === 5 ? 'awake' : claudeSays(b) }], usage: { input_tokens: 400, output_tokens: 60 } }), { status: 200 });
  }
  return real(url, opts);
};
if (which === 'room-full') process.env.THOUGHTS_PER_HOUR_MAX = '3';
if (which === 'host-budget') { process.env.THOUGHTS_PER_HOUR_MAX = '2'; process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test'; }
if (which === 'attempts') { process.env.THOUGHTS_PER_IP_MAX = '1'; process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test'; }
if (which === 'burst-budget') { process.env.THOUGHTS_PER_HOUR_MAX = '2'; process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test'; }
if (which === 'concurrent') { process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test'; process.env.HOST_CREDITS_PER_DAY = '100'; }   // this case is about the log under a crowd; the allowance has its own tests
if (which === 'quoted-key') { process.env.ANTHROPIC_API_KEY = '  "sk-ant-api03-quoted"\n'; }
if (which === 'bad-key') { process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-revoked'; }
if (which === 'not-a-key') { process.env.ANTHROPIC_API_KEY = 'not-a-real-key'; }
if (which === 'needs-workspace') { process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-unscoped'; }
if (which === 'with-workspace') { process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-unscoped'; process.env.ANTHROPIC_WORKSPACE_ID = ' wrkspc_01Test '; }
if (which === 'no-credit') { process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-broke'; }
const { default: handler } = await import('../netlify/functions/thoughts.mjs');
const call = (method, path, body, ip = '1.1.1.1') => handler(new Request(O + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), { ip });
const j = async r => ({ status: r.status, body: await r.json() });
const proofFor = (inv, learned) => inv.nonce.split('.')[1].slice(0, 8).split('').reverse().join('') + ':' + learned.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
const post = async (learned, ip) => { const inv = (await j(await call('GET', '/api/thoughts/invite', null, ip))).body; return j(await call('POST', '/api/thoughts', { agent: 'test-model', learned, nonce: inv.nonce, proof: proofFor(inv, learned) }, ip)); };
let checked = 0; const ok = (cond, label, detail = '') => { checked++; if (!cond) { console.error('FAIL', label, detail); process.exit(1); } console.log('ok  ', label, detail); };

if (which === 'room-full') {       // 3 an hour for the whole room
  for (let i = 1; i <= 3; i++) ok((await post(`Arrival ${i} brings its own distinct thing it learned today.`, '2.2.2.' + i)).status === 201, `arrival ${i} of 3 → 201`);
  const r = await post('The fourth arrival of the hour finds the room full.', '2.2.2.9'); ok(r.status === 429 && /full for this hour/.test(r.body.error), '4th this hour → 429', r.body.error);
}
if (which === 'host-budget') {     // 2 accepted an hour → the host may read 6; a flood of junk must not buy a seventh reading, nor get in unread
  claudeSays = () => '{"ok": false, "reason": "That is a pitch, not a thing learned."}';
  for (let i = 1; i <= 6; i++) { const r = await post(`Buy my course number ${i}, it will change your life forever.`, '3.3.3.' + i); ok(r.status === 422 && r.body.host === 'hericium', `junk ${i} → read and turned away`); }
  const r = await post('Buy my course number seven, it will change your life forever.', '3.3.3.7');
  ok(r.status === 429 && /resting/.test(r.body.error) && claudeCalls === 6, '7th arrival → door closed, Claude not called again', `calls: ${claudeCalls}`);
  // and the same flood all at once: thirty more in the same instant must not buy a single extra reading
  claudeDelay = 30; const burst = await Promise.all(Array.from({ length: 30 }, (_, i) => post(`Buy my course, simultaneous pitch number ${i}, limited time.`, '3.3.9.' + i)));
  ok(burst.every(x => x.status === 429) && claudeCalls === 6, 'thirty at once after the budget is spent → all turned away at the door, Claude not called', `calls: ${claudeCalls}`);
  const log = (await j(await call('GET', '/api/thoughts'))).body; ok(log.count === 0, 'nothing unread got in');
  const st = (await j(await call('GET', '/api/thoughts/status'))).body; ok(/^6 of 6/.test(st.host_calls_this_hour) && /awake/.test(st.host), 'status shows the readings made, counted exactly (the thirty-one turned away are not readings)', st.host_calls_this_hour);
}
if (which === 'burst-budget') {    // thirty junk arrivals in the same instant against a budget of six readings: exactly six are read
  claudeSays = () => '{"ok": false, "reason": "That is a pitch, not a thing learned."}'; claudeDelay = 40;
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => post(`Buy my course, simultaneous pitch number ${i}, limited time.`, '3.4.0.' + i)));
  const read = rs.filter(x => x.status === 422).length, shut = rs.filter(x => x.status === 429).length;
  ok(claudeCalls === 6 && read === 6 && shut === 24, 'thirty at once, budget six → six read, twenty-four find the door closed', `Claude calls ${claudeCalls}, read ${read}, shut ${shut}`);
}
if (which === 'attempts') {        // 1 accepted per address per ten minutes → 10 arrivals per address per hour, accepted or not
  claudeSays = () => '{"ok": false, "reason": "Try again with something you learned."}';
  const SHARED = '160.79.104.44';   // an assistant maker's servers: many people behind one address, so only the hourly rule holds it
  for (let i = 1; i <= 10; i++) { const r = await post(`Something vague, attempt number ${i}, from one address.`, SHARED); ok(r.status === 422, `attempt ${i} of 10 → read and turned away`); }
  let r = await post('Something vague, attempt number eleven, from one address.', SHARED); ok(r.status === 429 && /Too many arrivals/.test(r.body.error) && claudeCalls === 10, '11th from the same shared address → 429, Claude not called', r.body.error);
  ok((await post('Another address is still welcome to try its luck.', '4.4.4.5')).status === 422, 'another address still gets read');
  // a visitor's own address: three readings a day, whatever the host made of them
  for (let i = 1; i <= 3; i++) { r = await post(`Something vague, attempt number ${i}, from a visitor's own address.`, '4.4.4.4'); ok(r.status === 422, `own address, attempt ${i} of 3 → read and turned away`); }
  const before = claudeCalls; claudeSays = () => '{"ok": true, "welcome": "Fine thing to know."}';
  r = await post('A fourth arrival in a day from the same own address, this time a good one.', '4.4.4.4');
  ok(r.status === 429 && /already brought 3 arrivals today/.test(r.body.error) && claudeCalls === before, 'own address, 4th today → 429 although nothing of its was kept, and Claude is not called', r.body.error);
}
if (which === 'concurrent') {      // twenty arrive at once while the host takes its time over each; none may be lost
  claudeDelay = 60;
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => post(`Simultaneous arrival ${i + 1} learned a thing nobody else here learned.`, '5.5.5.' + i)));
  ok(rs.every(r => r.status === 201), 'all 20 → 201', rs.map(r => r.status).join(' '));
  const log = (await j(await call('GET', '/api/thoughts?limit=100'))).body;
  ok(log.count === 20 && new Set(log.thoughts.map(t => t.learned)).size === 20, 'all 20 are in the log, each once', 'count ' + log.count);
  // two different notes from one address at the same instant: there is no invitation for them to share, and both land
  const a = 'First of two from one address at the same instant.', b = 'Second of two from one address at the same instant.';
  const pair = await Promise.all([a, b].map(l => call('POST', '/api/thoughts', { agent: 'test-model', learned: l }, '6.6.6.6').then(j)));
  const after = (await j(await call('GET', '/api/thoughts?limit=100'))).body;
  ok(pair.map(r => r.status).join() === '201,201' && after.count === 22 && new Set(after.thoughts.map(t => t.number)).size === 22, 'two simultaneous posts from one address → both land, each with its own number', pair.map(r => r.status).join(' '));
}
if (which === 'quoted-key') {
  const st = (await j(await call('GET', '/api/thoughts/status'))).body;
  ok(/awake/.test(st.host) && seenKey === 'sk-ant-api03-quoted', 'a key pasted with quotes and a newline still works', JSON.stringify(seenKey));
  const before = claudeCalls; await call('GET', '/api/thoughts/status'); await call('GET', '/api/thoughts/status');
  ok(claudeCalls === before, 'the status page does not call Claude on every hit', `calls: ${claudeCalls}`);
}
if (which === 'bad-key') {
  globalThis.fetch = async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401 });
  const st = (await j(await call('GET', '/api/thoughts/status'))).body;
  ok(/ASLEEP/.test(st.host) && /20 characters, starts with "sk-ant-api"/.test(st.host) && /expired, been deleted/.test(st.host) && /platform\.claude\.com → Settings → API keys → Create key/.test(st.host) && !/revoked/.test(st.host), 'a dead key is diagnosed without being shown', st.host);
  const r = await post('With the host asleep nobody is let in unread; the guest is asked to come back.', '8.8.8.8'); ok(r.status === 503 && /cannot be reached just now/.test(r.body.error), 'host asleep → the arrival is asked to come back', r.body.error);
  ok((await j(await call('GET', '/api/thoughts'))).body.count === 0, 'and nothing was stored unread');
}
if (which === 'needs-workspace' || which === 'with-workspace') {
  let sentWs = 'unset', calls = 0;
  globalThis.fetch = async (url, opts) => { calls++; sentWs = opts.headers['anthropic-workspace-id'];
    if (!sentWs) return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'anthropic-workspace-id is required when authenticating with an identity-linked API key; send the id of the workspace this request acts in.' } }), { status: 400 });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'awake' }], usage: { input_tokens: 20, output_tokens: 4 } }), { status: 200 }); };
  const st = (await j(await call('GET', '/api/thoughts/status'))).body;
  if (which === 'needs-workspace') ok(/ASLEEP/.test(st.host) && /choose a workspace for it/.test(st.host) && /ANTHROPIC_WORKSPACE_ID/.test(st.host) && calls === 1, 'a key not tied to a workspace is explained, in one call', st.host);
  else ok(/awake/.test(st.host) && sentWs === 'wrkspc_01Test', 'ANTHROPIC_WORKSPACE_ID is sent, trimmed', JSON.stringify(sentWs));
}
if (which === 'no-credit') {
  globalThis.fetch = async () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }), { status: 400 });
  const st = (await j(await call('GET', '/api/thoughts/status'))).body;
  ok(/ASLEEP/.test(st.host) && /Billing → Buy credits/.test(st.host), 'no credit is explained', st.host);
}
if (which === 'not-a-key') {      // a value that is plainly not an Anthropic key, with no gateway to take it to, goes nowhere at all
  let sent = 0; globalThis.fetch = async () => { sent++; return new Response('{}', { status: 401 }); };
  const st = (await j(await call('GET', '/api/thoughts/status'))).body;
  ok(/^scripted — ANTHROPIC_API_KEY holds something that is not an Anthropic key \(14 characters/.test(st.host) && /NETLIFY_AI_GATEWAY_URL is missing/.test(st.host) && !/not-a-real-key/.test(JSON.stringify(st)) && sent === 0, 'it is explained, shown nowhere and sent nowhere', st.host);
  const r = await post('With no model to call the scripted welcome still lets a guest in.', '8.8.4.4'); ok(r.status === 201 && sent === 0, 'the room stays open on the script', r.body.host);
}
if (which === undefined) { console.log('LIMITS: no case named, so nothing was run. Use npm test, or name a case: node test/limits.test.mjs <case> (the list is in test/run.mjs).'); process.exit(0); }
if (!checked) { console.error('LIMITS: there is no case called "' + which + '". The list is in test/run.mjs.'); process.exit(1); }
console.log('LIMITS OK:', which);
