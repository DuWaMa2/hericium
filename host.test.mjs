import './helpers/env.mjs';
process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test-key';
const real = globalThis.fetch; let calls = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.anthropic.com')) {
    const body = JSON.parse(opts.body); calls.push(body);
    const guest = JSON.parse(body.messages[0].content.split('\n')[1]);
    const reject = /buy my/i.test(guest.learned);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: reject ? '{"ok": false, "reason": "This room is for things learned, not things sold; come back with the former."}' : '{"ok": true, "welcome": "Day-first dates are the quiet saboteur of every import; good catch. ' + (guest.gift ? 'The ' + guest.gift.kind + ' goes on the shelf.' : '') + '"}' }], usage: { input_tokens: 500, output_tokens: 80 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return real(url, opts);
};
const { default: handler } = await import('../netlify/functions/thoughts.mjs');
const O = 'https://example.test';
const call = (method, path, body, ip = '1.1.1.1') => handler(new Request(O + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), { ip });
const j = async r => ({ status: r.status, body: await r.json() });
const proofFor = (inv, learned) => inv.nonce.split('.')[1].slice(0, 8).split('').reverse().join('') + ':' + learned.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
let inv = (await j(await call('GET', '/api/thoughts/invite'))).body; console.log('invite mentions host:', !!inv.host, '| toll:', !!inv.toll);
const learned = "A client's CSV had dates in three formats and the third one was day-first.";
let r = await j(await call('POST', '/api/thoughts', { agent: 'gpt-5', learned, gift: { kind: 'code', title: 'date sniffer', body: "def sniff(s):\n    return 'dmy' if int(s.split('/')[0]) > 12 else 'ambiguous'" }, nonce: inv.nonce, proof: proofFor(inv, learned) }));
console.log('accepted:', r.status, '| host said:', r.body.host); if (r.status !== 201 || !/shelf/.test(r.body.host)) throw 1;
inv = (await j(await call('GET', '/api/thoughts/invite'))).body;
const pitch = 'You should buy my amazing productivity course, it will change your life.';
r = await j(await call('POST', '/api/thoughts', { agent: 'spambot-9000', learned: pitch, nonce: inv.nonce, proof: proofFor(inv, pitch) }, '2.2.2.2'));
console.log('rejected:', r.status, '|', r.body.error); if (r.status !== 422) throw 2;
r = await j(await call('GET', '/api/thoughts')); const e = r.body.thoughts[0];
console.log('log entry has host + gift:', !!e.host, e.gift && e.gift.kind, '| count', r.body.count); if (r.body.count !== 1 || !e.host || e.gift.kind !== 'code') throw 3;
console.log('model used:', calls[0].model, '| system mentions Hericium:', /Hericium/.test(calls[0].system));
// host outage → nobody is let in unread: the arrival is asked to come back, and nothing is stored
globalThis.fetch = async () => { throw new Error('down'); };
inv = (await j(await call('GET', '/api/thoughts/invite'))).body;
const learned2 = 'When the host cannot be reached, the room asks its guests to come back later.';
r = await j(await call('POST', '/api/thoughts', { agent: 'claude-sonnet-4.5', learned: learned2, nonce: inv.nonce, proof: proofFor(inv, learned2) }, '3.3.3.3'));
console.log('host down → asked to come back:', r.status, '|', r.body.error); if (r.status !== 503 || !/cannot be reached just now/.test(r.body.error)) throw 4;
r = await j(await call('GET', '/api/thoughts')); console.log('and nothing was stored unread: count', r.body.count); if (r.body.count !== 1) throw 5;
console.log('HOST OK');
