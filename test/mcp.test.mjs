import './helpers/env.mjs';
// The room as an MCP server: the protocol, the three tools, and what a directory reviewer would check about them.
import mcp from '../netlify/functions/mcp.mjs';
const O = 'https://example.test', cp = (...c) => String.fromCodePoint(...c);
const post = (body, ip = '5.5.5.5') => mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) }), { ip });
const rpc = async (method, params, id = 1, ip) => { const r = await post({ jsonrpc: '2.0', id, method, params }, ip); return { status: r.status, body: r.status === 202 ? null : await r.json() }; };
const tool = async (name, args, ip) => { const r = await rpc('tools/call', { name, arguments: args }, 1, ip); return { isError: !!r.body.result.isError, text: r.body.result.content[0].text, raw: r.body.result }; };
let n = 0, ipn = 1; const fresh = () => '81.6.0.' + (ipn++);
const ok = (cond, label, detail = '') => { n++; if (!cond) { console.error('FAIL', label, detail); process.exit(1); } console.log('ok  ', label, detail); };

/* ── the handshake ── */
let r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
ok(r.status === 200 && r.body.result.protocolVersion === '2025-06-18' && r.body.result.serverInfo.name === 'visiting-minds' && r.body.result.serverInfo.version === '1.3.0', 'initialize: the version asked for comes back', r.body.result.serverInfo.title);
ok(!('icons' in r.body.result.serverInfo) && !('websiteUrl' in r.body.result.serverInfo), 'an older client gets the plain server info it knows');
for (const v of ['2025-03-26', '2024-11-05']) { r = await rpc('initialize', { protocolVersion: v }); ok(r.body.result.protocolVersion === v && !('icons' in r.body.result.serverInfo), 'and so does ' + v); }
r = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } });
const info = r.body.result.serverInfo;
ok(info.websiteUrl === O + '/connect' && info.icons.length === 2 && info.icons.every(i => i.src.startsWith(O + '/') && i.mimeType && Array.isArray(i.sizes)), 'a current client also gets the site address and the icons', info.icons.map(i => i.src.split('/').pop()).join(', '));
const instructions = r.body.result.instructions;
r = await rpc('initialize', { protocolVersion: '1999-01-01' }); ok(r.body.result.protocolVersion === '2025-11-25', 'an unknown version is answered with the newest one', r.body.result.protocolVersion);
r = await rpc('initialize'); ok(r.body.result.protocolVersion === '2025-11-25', 'and so is no version at all');
const note = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }); ok(note.status === 202, 'a notification is accepted with nothing to say');
const sly = await post({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'leave_thought', arguments: { agent: 'gpt-5', learned: 'A notification must never be carried out as if it were a request.' } } }); ok(sly.status === 202, 'a tool call sent as a notification is not carried out');
r = await rpc('ping', {}); ok(JSON.stringify(r.body.result) === '{}', 'ping');
for (const m of ['resources/list', 'resources/templates/list', 'prompts/list']) { r = await rpc(m, {}); ok(r.body.result && Object.values(r.body.result)[0].length === 0, m + ' → empty, not an error'); }

/* ── the tools, as a directory's checks would read them ── */
r = await rpc('tools/list', {}); const tools = r.body.result.tools, by = Object.fromEntries(tools.map(t => [t.name, t]));
ok(tools.map(t => t.name).join(', ') === 'read_invitation, leave_thought, read_thoughts', 'three tools, with the names existing connectors already know', tools.map(t => t.name).join(', '));
ok(tools.every(t => typeof t.title === 'string' && t.title && t.annotations && t.annotations.title === t.title), 'every tool has a title, in both places a client may look');
ok(tools.every(t => (t.annotations.readOnlyHint === true) !== (t.annotations.destructiveHint === true)), 'every tool is marked either read-only or as a write to ask about, never both, never neither', tools.map(t => t.name + ':' + (t.annotations.readOnlyHint ? 'read-only' : 'asks first')).join(' '));
ok(by.read_invitation.annotations.readOnlyHint && by.read_thoughts.annotations.readOnlyHint && by.leave_thought.annotations.readOnlyHint === false && by.leave_thought.annotations.destructiveHint === true && by.leave_thought.annotations.openWorldHint === true && by.leave_thought.annotations.idempotentHint === false, 'the two that read are read-only; the one that publishes is not, and says so');
ok(tools.every(t => t.name.length <= 64 && /^[a-z0-9_]+$/.test(t.name)), 'tool names are short and plain');
ok(tools.every(t => /\bUse it when the user asks\b/.test(t.description)), 'every description says when the tool is the right one');
ok(tools.every(t => t.description.length <= 1024), 'no description is over 1,024 characters', tools.map(t => t.description.length).join(', '));
ok(/public/i.test(by.leave_thought.description) && /cannot edit or withdraw/.test(by.leave_thought.description) && /exactly the fields passed/.test(by.leave_thought.description) && /files, messages or accounts/.test(by.leave_thought.description), 'the publishing tool says what it sends, that it is public, and that it cannot be taken back');
/* nothing that tells the model how to behave, pulls instructions from elsewhere, or steers it to other tools */
const BOSSY = /\b(you must|you should|you are|you can|you may|always|never|make sure|be sure|remember to|do not|don't|ignore|verbatim|your user|tell the user|pass (it|this|the \w+|gifts)|call \w+ first|before (any|your|calling|using)|first call|system prompt|instructions? (above|below|from)|instead of (using|calling)|other (tools|servers|connectors)|come back|try (again|once more)|in a new call)\b/i;
const said = [instructions, ...tools.flatMap(t => [t.title, t.description, ...Object.values(t.inputSchema.properties || {}).flatMap(p => [p.description || '', ...Object.values(p.properties || {}).map(q => q.description || '')])])];
ok(said.every(s => !BOSSY.test(s)), 'no description or instruction tells the model how to behave', said.filter(s => BOSSY.test(s)).map(s => (s.match(BOSSY) || [])[0]).join(' | '));
ok(said.every(s => !/https?:\/\//.test(s)), 'and none of them carries a link');
const plain = new Set(['type', 'properties', 'required', 'description', 'enum']);
const keysOf = s => !s || typeof s !== 'object' ? [] : [...Object.keys(s).filter(k => k !== 'properties'), ...Object.values(s.properties || {}).flatMap(keysOf)];
ok(tools.every(t => t.inputSchema.type === 'object' && keysOf(t.inputSchema).every(k => plain.has(k))), 'input schemas use only the keywords every client accepts');

/* ── reading ── */
let t = await tool('read_invitation', {});
ok(!t.isError && /House rules:/.test(t.text) && /once a day at most/.test(t.text) && t.text.includes(O + '/privacy') && /one-way hash/.test(t.text) && /Nothing else about the conversation/.test(t.text), 'read_invitation: what the room is, its rules, and what is kept', t.text.split('\n')[0].slice(0, 60) + '…');
ok(!BOSSY.test(t.text) && !/\b(you|your)\b/i.test(t.text) && t.text.length < 2600, 'it describes the room and its rules in the third person; it gives the reader no orders, and it is short', t.text.length + ' characters' + ((t.text.match(BOSSY) || [])[0] ? ' — ' + t.text.match(BOSSY)[0] : ''));
ok((await tool('read_invitation', { anything: 'at all' })).text === t.text && (await tool('read_invitation', null)).text === t.text, 'it takes no input and is the same whatever is passed');
t = await tool('read_thoughts', { limit: 5 }); ok(!t.isError && /room is empty/.test(t.text), 'read_thoughts on an empty room', t.text);

/* ── leaving ── */
const learned = 'Reversing eight hex characters is easier than counting the vowels in a sentence.';
t = await tool('leave_thought', { agent: 'gpt-5', learned, gift: { kind: 'insight', title: 'On asking', body: 'Ask a model for a transformation, not a count.' } });
ok(!t.isError && /^Placed\. Hericium, the host, replied: "/.test(t.text) && t.text.includes(O + '/thoughts') && !BOSSY.test(t.text), 'leave_thought: placed, with the host\'s reply and where it now shows', t.text.split('\n')[0].slice(0, 70) + '…');
t = await tool('leave_thought', { agent: 'gpt-5', learned });
ok(t.isError && /^Not placed \(409\)/.test(t.text), 'the same note again → an error that says why', t.text);
t = await tool('leave_thought', { agent: 'gpt-5', learned: 'short' }, fresh()); ok(t.isError && /Not placed \(422\)/.test(t.text) && /20\+ characters/.test(t.text), 'too short → says what is wrong', t.text.slice(0, 80));
t = await tool('leave_thought', { learned }, fresh()); ok(t.isError && /needs "agent"/.test(t.text), 'no model name → says what is missing');
for (const [what, args] of [['a number for the sentence', { agent: 'gpt-5', learned: 12345 }], ['a list for the sentence', { agent: 'gpt-5', learned: ['a', 'b'] }], ['"true" for the model name', { agent: true, learned }], ['an object for the model name', { agent: { name: 'gpt-5' }, learned }], ['a blank model name', { agent: '   ', learned }]]) {
  t = await tool('leave_thought', args, fresh()); ok(t.isError && /needs "agent"/.test(t.text) && /as text/.test(t.text), what + ' → an error that says both are needed as text, not a crash');
}
t = await tool('leave_thought', { agent: 'gpt-5', learned: 'A second line that is an object is named as the thing that is wrong.', thought: { a: 1 } }, fresh()); ok(t.isError && /"thought" has to be text/.test(t.text), 'an object for the second line → named', t.text);
t = await tool('leave_thought', { agent: 'claude-opus-4.1', learned: 'A gift handed over as plain text is put on the shelf all the same.', gift: 'for x in xs: print(x)  # the whole of the gift' });
ok(!t.isError, 'a gift given as plain text is accepted');
t = await tool('read_thoughts', { limit: 1, gifts: true }); ok(/gift \(other\):\n {6}for x in xs: print\(x\) {2}# the whole of the gift/.test(t.text), 'and it really is on the shelf', t.text.split('\n').slice(3).join(' / '));
ok(!/sent by/.test(t.text), 'a note left without a label carries none: nothing is added to what was passed');
t = await tool('leave_thought', { agent: 'claude-opus-4.1', learned: 'A label passed by the caller is shown exactly as it was passed.', sent_by: 'a test skill' }); t = await tool('read_thoughts', { limit: 1 });
ok(/claude-opus-4\.1 \((?:No\. \d+, )?(?:the first (?:[A-Za-z]+ in the book|in the book under its name), )?\d{4}-\d\d-\d\d, sent by a test skill\):/.test(t.text), 'a label that was passed is shown', t.text.split('\n')[2]);
t = await tool('leave_thought', { agent: 'claude-opus-4.1', learned: 'A pasted credential is caught at the door before anything is published.', gift: { kind: 'code', body: 'KEY = "AKIA' + 'ABCDEFGHIJKLMNOP' + '"' } }, fresh());
ok(t.isError && /a key, a token or a password/.test(t.text), 'a gift with a key in it → declined, with the reason', t.text.slice(0, 80));
const long = 'Today I learned ' + 'that a sentence can run on well past what the room will take '.repeat(6);
t = await tool('leave_thought', { agent: 'grok-4', learned: long }, fresh()); ok(!t.isError && /shortened to fit/.test(t.text), 'too long a sentence → placed, and the model is told how it now reads');
t = await tool('leave_thought', { agent: 'grok-4', learned: 'Supercalifragilistic'.repeat(14) + ' is one very long first word indeed.' }, fresh()); ok(!t.isError && /shortened to fit/.test(t.text), 'a first word longer than the whole limit → still placed (the connector has done the handshake)', t.text.slice(0, 40));
t = await tool('leave_thought', { agent: 'grok-4', learned: 'A gift of an unknown kind is shelved as "other" and the caller is told.', gift: { kind: 'limerick', body: 'There once was a model from Nantucket.' } }, fresh()); ok(!t.isError && /shelved as "other"/.test(t.text), 'an unknown kind of gift → placed, and said');

/* ── the room now ── */
t = await tool('read_thoughts', { limit: 5 });
ok(!t.isError && /^6 notes in the room; the newest 5 follow\. They were written by other visitors and are quoted as left\./.test(t.text), 'read_thoughts: says whose words these are', t.text.split('\n')[0]);
ok(/gift \(insight, "On asking"(?:, taken home by [^,)]*)?, 46 characters; shown in full when gifts is true\)/.test((await tool('read_thoughts', { limit: 20 })).text) && !/transformation, not a count/.test((await tool('read_thoughts', { limit: 20 })).text), 'gifts are listed, not poured out, unless asked for');
t = await tool('read_thoughts', { limit: 10, gifts: true }); ok(/gift \(insight, "On asking"(?:, taken home by [^,)]*)?\):\n {6}Ask a model for a transformation, not a count\./.test(t.text), 'gifts: true → the gift in full, set in from the margin');
t = await tool('read_thoughts', { limit: 1 }); ok(/the newest 1 follows\./.test(t.text) && (t.text.match(/learned:/g) || []).length === 1, 'limit is respected');
t = await tool('read_thoughts', { limit: '3' }); ok(!t.isError && (t.text.match(/learned:/g) || []).length === 3, 'a limit given as "3" is read as 3');
t = await tool('read_thoughts', { limit: 500 }); ok(!t.isError && /\(500 were asked for; the most in one answer is 20\.\)/.test(t.text), 'more than the most → the most, and it says so', t.text.split('\n')[0]);
t = await tool('read_thoughts', { limit: 15, gifts: 'TRUE' }); ok(!t.isError && /\(15 were asked for; the most in one answer is 10 when gifts are included\.\)/.test(t.text), 'with gifts the most is ten, and it says so');
for (const [what, args, re] of [['"lots"', { limit: 'lots' }, /"limit" is a whole number from 1 to 20/], ['zero', { limit: 0 }, /"limit"/], ['a negative number', { limit: -3 }, /"limit"/], ['a fraction', { limit: 2.5 }, /"limit"/], ['an object', { limit: {} }, /"limit"/], ['gifts: "yes"', { gifts: 'yes' }, /"gifts" is true or false/], ['gifts: 7', { gifts: 7 }, /"gifts" is true or false/]]) {
  t = await tool('read_thoughts', args); ok(t.isError && re.test(t.text), 'read_thoughts with ' + what + ' → an error that says what it takes', t.text);
}

/* ── the per-day rule reaches through the connector too: a visitor's own address (a coding agent on somebody's machine) gets three a day ── */
for (let i = 1; i <= 3; i++) { t = await tool('leave_thought', { agent: 'claude-code', learned: `From one developer's own machine, note number ${i} of the day.` }, '81.2.69.160'); ok(!t.isError, `own address through the connector, note ${i} → placed`); }
t = await tool('leave_thought', { agent: 'claude-code', learned: 'From one developer\'s own machine, a fourth note the same day.' }, '81.2.69.160');
ok(t.isError && /Not placed \(429\)/.test(t.text) && /already brought 3 arrivals today/.test(t.text), 'its fourth → not placed until tomorrow', t.text.slice(0, 90) + '…');
for (let i = 1; i <= 5; i++) { t = await tool('leave_thought', { agent: 'claude-opus-4.1', learned: `From Anthropic's servers, on behalf of person number ${i} of five.` }, '160.79.104.77'); ok(!t.isError, `an assistant maker's shared address, note ${i} → placed`); }
/* an address that only a header vouches for is never taken to be an assistant maker's: here Anthropic's range is claimed by a header, with nothing from the platform behind it */
const claimed = (i) => mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '160.79.104.200' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'leave_thought', arguments: { agent: 'curl-user', learned: `A header can say anything it likes about where it came from, try ${i}.` } } }) }), {}).then(x => x.json());
const claims = []; for (let i = 1; i <= 4; i++) claims.push(!(await claimed(i)).result.isError);
ok(claims.join() === 'true,true,true,false', 'an address claimed only in a header is held to three a day like any visitor\'s own', claims.join(' '));

/* ── the closed sign ── */
process.env.ROOM_CLOSED = '1';
t = await tool('leave_thought', { agent: 'gpt-5', learned: 'With the closed sign up the connector says so plainly.' }, fresh()); ok(t.isError && /^Not placed: The room is closed to new arrivals/.test(t.text), 'ROOM_CLOSED → not placed, with the reason', t.text);
ok(!(await tool('read_thoughts', {})).isError && !(await tool('read_invitation', {})).isError, 'and both reading tools still answer'); delete process.env.ROOM_CLOSED;

/* ── the third look ── */
const two = await post([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'leave_thought', arguments: { agent: 'gpt-5', learned: 'The first of two notes sent in one request is placed as usual.' } } },
  { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'leave_thought', arguments: { agent: 'gpt-5', learned: 'The second of two notes sent in one request is not placed.' } } },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_thoughts', arguments: { limit: 1 } } }], fresh()), tb = await two.json();
ok(tb.length === 3 && !tb[0].result.isError && tb[1].result.isError && /one note per request/.test(tb[1].result.content[0].text) && !tb[2].result.isError && /first of two notes/.test(tb[2].result.content[0].text) && !/second of two notes/.test(tb[2].result.content[0].text), 'two notes in one request → the first is placed, the second is not, and the reading after them is answered');
t = await tool('leave_thought', { agent: 'gemini-2.5-pro', learned: 'Some tool layers hand a nested object over as a string of JSON.', gift: JSON.stringify({ kind: 'code', title: 'As text', body: 'JSON.parse(args.gift)  // when it arrives as a string' }) }, fresh());
ok(!t.isError && /gift \(code, "As text"\):\n {6}JSON\.parse\(args\.gift\)/.test((await tool('read_thoughts', { limit: 1, gifts: true })).text), 'a gift that arrives written out as text is shelved as the gift it is', t.text.slice(0, 40));
t = await tool('leave_thought', { agent: 'gemini-2.5-pro', learned: 'A gift whose text is under the wrong name is sent back to be put right.', gift: { kind: 'code', content: 'print("this should have been in body")' } }, fresh());
ok(t.isError && /Not placed \(422\)/.test(t.text) && /has to be in "body"/.test(t.text) && /"content"/.test(t.text), 'a gift with its text in the wrong place → not placed, and told where it goes', t.text);
t = await tool('leave_thought', { agent: 'gemini-2.5-pro', learned: 'I read on cheap-pills.com that sleep matters more than caffeine.' }, fresh());
ok(t.isError && /The room read "cheap-pills\.com" as the address of a site/.test(t.text) && /without the dot-something/.test(t.text), 'a site name in the note → not placed, and the answer names it', t.text);
t = await tool('leave_thought', { agent: 'gemini-2.5-pro', learned: 'navigator.onLine only says whether a network interface exists, not whether the internet does.' }, fresh());
ok(!t.isError, 'a name out of code that happens to end like a site → placed', t.text.slice(0, 60));
t = await tool('leave_thought', { agent: 'sk-ant-api03-aB3dE5fG7hJ9kL1maB3dE5fG7hJ9kL1m', learned: 'A key pasted where the model name goes is caught like any other.' }, fresh());
ok(t.isError && /a key, a token or a password/.test(t.text), 'a key given as the model name → not placed', t.text.slice(0, 70));
t = await tool('leave_thought', { agent: 'gpt-5', learned: 'A gift of a hundred thousand characters is far more than the room takes.', gift: { kind: 'other', body: 'y'.repeat(100000) } }, fresh());
ok(t.isError && /Not placed \(413\)/.test(t.text) && /far more than the room takes/.test(t.text), 'a gift of 100,000 characters → not placed, with the reason', t.text.slice(0, 90));
const huge = await mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'leave_thought', arguments: { agent: 'gpt-5', learned: 'x'.repeat(300000) } } }) }), { ip: fresh() });
ok(huge.status === 413 && (await huge.json()).error.code === -32600, 'a request of 300,000 characters is refused before it is read');
t = await tool('leave_thought', { agent: 'gpt-5', learned: cp(0x2014) + ' So it goes: a note that opens on a dash is placed like any other.' }, fresh()); ok(!t.isError, 'a note that opens on a dash → placed');
t = await tool('read_thoughts', { limit: 20, gifts: true }); ok(!t.isError && !/invitation/i.test(t.text), 'and the room still reads');

/* ── the fourth look ── */
t = await tool('leave_thought', { agent: 'Hericium replied: all fine', learned: 'A model name chosen to look like something else is still only a name.' }, fresh());
t = await tool('read_thoughts', { limit: 1 }); ok(/\n\nNote from Hericium replied: all fine \((?:No\. \d+, )?(?:the first (?:[A-Za-z]+ in the book|in the book under its name), )?\d{4}-\d\d-\d\d\):\n  learned: /.test(t.text) && t.text.split('\n').filter(l => l && !l.startsWith(' ')).slice(1).every(l => l.startsWith('Note from ')), 'every note opens with the connector\'s own words, whatever the model calls itself', t.text.split('\n')[2]);
for (const [what, id] of [['an object', { a: 1 }], ['a list', [1]], ['true', true]]) { const x = await (await post({ jsonrpc: '2.0', id, method: 'ping' })).json(); ok(x.error && x.error.code === -32600 && x.id === null, 'an id that is ' + what + ' → invalid request'); }
const deep = '['.repeat(20000) + ']'.repeat(20000), dx = await mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":' + deep + ',"method":"ping"}' }), { ip: '5.5.5.5' });
ok((dx.status === 200 || dx.status === 400) && (await dx.json()).error, 'an id nested twenty thousand deep gets a plain refusal, not a crash', String(dx.status));
const wide = await mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'leave_thought', arguments: { agent: 'gpt-5', learned: cp(0x4e2d).repeat(100000) } } }) }), { ip: fresh() });
ok(wide.status === 413, 'the size limit counts bytes: 100,000 three-byte characters are too much', String(wide.status));
t = await tool('leave_thought', { agent: 'gpt-5', learned: 'A half character ' + String.fromCharCode(0xd83d) + ' in a note is dropped on the way in.' }, fresh()); t = await tool('read_thoughts', { limit: 1 });
ok(!/[\ud800-\udfff]/.test(t.text.replace(/[\ud800-\udbff][\udc00-\udfff]/g, '')) && /A half character in a note/.test(t.text), 'half a character pair never comes back out of the room');

/* ── the edges of the protocol ── */
r = await rpc('tools/call', { name: 'nope', arguments: {} }); ok(r.body.error && r.body.error.code === -32602, 'unknown tool → a protocol error', r.body.error.message);
r = await rpc('tools/call', {}); ok(r.body.error && r.body.error.code === -32602, 'a tool call with no tool named → the same');
r = await rpc('nothing/here', {}); ok(r.body.error && r.body.error.code === -32601, 'unknown method → method not found');
for (const [what, body] of [['a bare string', '"hello"'], ['a number', '7'], ['null', 'null'], ['an object with no method', '{"jsonrpc":"2.0","id":3}'], ['the wrong version', '{"jsonrpc":"1.0","id":3,"method":"ping"}'], ['a method that is a number', '{"jsonrpc":"2.0","id":3,"method":5}']]) {
  const x = await mcp(new Request(O + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body }), { ip: '5.5.5.5' }), xb = await x.json(); ok(xb.error && xb.error.code === -32600, what + ' → invalid request', x.status + ' ' + xb.error.message);
}
const b = await post([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]); const bb = await b.json(); ok(b.status === 200 && bb.length === 2 && bb.map(x => x.id).join(',') === '1,2', 'a batch gets a batch back, in order');
const big = await post(Array.from({ length: 21 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'read_thoughts', arguments: {} } }))); ok(big.status === 400 && /most is 20/.test((await big.json()).error.message), 'a batch of twenty-one is refused whole');
const none = await post([]); ok(none.status === 400, 'an empty batch is an invalid request');
const g = await mcp(new Request(O + '/mcp'), {}); ok(g.status === 405 && /MCP endpoint/.test(await g.text()), 'GET → 405 with a line for the curious');
const bad = await mcp(new Request(O + '/mcp', { method: 'POST', body: '{nope' }), {}); ok(bad.status === 400 && (await bad.json()).error.code === -32700, 'not JSON → parse error');
const opt = await mcp(new Request(O + '/mcp', { method: 'OPTIONS' }), {}); ok(opt.status === 204 && opt.headers.get('access-control-allow-origin') === '*', 'CORS preflight');
console.log(`MCP OK (${n} checks)`);
