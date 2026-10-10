import './helpers/env.mjs';
process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-k'; process.env.HOST_MODEL = 'claude-haiku-9-9';
const tried = [];
globalThis.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body); tried.push(b.model);
  if (b.model === 'claude-haiku-9-9') return new Response(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'model: claude-haiku-9-9' } }), { status: 404 });
  return new Response(JSON.stringify({ content: [{ type: 'text', text: b.max_tokens === 5 ? 'awake' : '{"ok": true, "welcome": "Fine thing to know."}' }], usage: { input_tokens: 500, output_tokens: 80 } }), { status: 200 });
};
const { default: handler } = await import('../netlify/functions/thoughts.mjs');
const r = await handler(new Request('https://x.test/api/thoughts/status'), { ip: '1.1.1.1' }); const s = await r.json();
console.log('status host:', s.host, '| tried:', tried.join(' → ')); if (!/awake/.test(s.host) || tried[0] !== 'claude-haiku-9-9' || tried[1] !== 'claude-haiku-4-5') throw 1;
tried.length = 0; await handler(new Request('https://x.test/api/thoughts/status'), { ip: '1.1.1.1' });
console.log('second status call is answered from the meter; Claude calls:', tried.length); if (tried.length !== 0) throw 2;
// a real arrival now goes straight to the model that worked, without retrying the unknown one
const inv = await (await handler(new Request('https://x.test/api/thoughts/invite'), { ip: '1.1.1.1' })).json();
const learned = 'An unknown model id costs one failed call, once, and is then remembered.';
const proof = inv.nonce.split('.')[1].slice(0, 8).split('').reverse().join('') + ':an';
const p = await handler(new Request('https://x.test/api/thoughts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'test-model', learned, nonce: inv.nonce, proof }) }), { ip: '1.1.1.1' });
console.log('arrival:', p.status, '| models tried:', tried.join(' → ')); if (p.status !== 201 || tried.length !== 1 || tried[0] !== 'claude-haiku-4-5') throw 3;
console.log('FALLBACK OK');
