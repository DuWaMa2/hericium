import './helpers/env.mjs';
// The real storage path (HTTP to the Blobs edge), against a stand-in that behaves the way Netlify's own client
// expects the edge to behave: GET returns an etag; PUT honours if-match / if-none-match with 412.
// Run as: node test/blobs.test.mjs <normal|list-etag|weak-etag|no-etag|refuses-conditions|ignores-conditions|spurious-412>
//   list-etag: reads carry no tag but the listing does (how Netlify's own local Blobs server behaves)
//   weak-etag: reads hand out W/"…" tags but writes match only the strong form
const mode = process.argv[2] || 'normal';
const SITE = 'site123', BASE = 'https://blobs.test';
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ token: 'tok', siteID: SITE, edgeURL: BASE, uncachedEdgeURL: BASE })).toString('base64');
const blobs = new Map(); let tick = 0, gets = 0, puts = 0, lists = 0, refused = 0, conditional = 0, wrongAuth = 0;
const lag = () => new Promise(r => setTimeout(r, 1 + Math.random() * 12));
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url); if (u.origin !== BASE) throw new Error('unexpected fetch: ' + url);
  const h = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (h.authorization !== 'Bearer tok') wrongAuth++;
  const key = decodeURIComponent(u.pathname); await lag();
  const STOREPATH = `/${SITE}/site:visiting-minds`, versioned = ['normal', 'list-etag', 'weak-etag'].includes(mode);
  if ((!opts.method || opts.method === 'GET') && key === STOREPATH) {     // the listing
    lists++; const prefix = u.searchParams.get('prefix') || '';
    const out = [...blobs.entries()].filter(([k]) => k.startsWith(STOREPATH + '/') && k.slice(STOREPATH.length + 1).startsWith(prefix)).map(([k, b]) => ({ key: k.slice(STOREPATH.length + 1), ...(mode === 'no-etag' ? {} : { etag: b.etag }) }));
    return new Response(JSON.stringify({ blobs: out, directories: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (!opts.method || opts.method === 'GET') { gets++; const b = blobs.get(key); if (!b) return new Response('not found', { status: 404 }); return new Response(b.text, { status: 200, headers: mode === 'no-etag' || mode === 'list-etag' ? {} : { etag: mode === 'weak-etag' ? 'W/' + b.etag : b.etag } }); }
  if (opts.method === 'PUT') {
    puts++; const b = blobs.get(key), cond = 'if-match' in h || 'if-none-match' in h; if (cond) conditional++; if ('if-match' in h) seenIfMatch.push(h['if-match']);
    if (mode === 'refuses-conditions' && cond) return new Response('conditions not supported', { status: 400 });
    if (mode === 'spurious-412' && cond) { refused++; return new Response('', { status: 412 }); }          // a store whose preconditions never hold
    if (versioned) { if ('if-match' in h && (!b || b.etag !== h['if-match'])) { refused++; return new Response('', { status: 412 }); } if (h['if-none-match'] === '*' && b) { refused++; return new Response('', { status: 412 }); } }
    blobs.set(key, { text: String(opts.body), etag: '"v' + (++tick) + '"' }); return new Response('', { status: 200 });
  }
  return new Response('', { status: 405 });
};
const versioned_ = ['normal', 'list-etag', 'weak-etag'].includes(mode); const seenIfMatch = [];
const { default: handler } = await import('../netlify/functions/thoughts.mjs');
const O = 'https://example.test';
const call = (method, path, body, ip = '1.1.1.1') => handler(new Request(O + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), { ip });
const j = async r => ({ status: r.status, body: await r.json() });
const proofFor = (inv, learned) => inv.nonce.split('.')[1].slice(0, 8).split('').reverse().join('') + ':' + learned.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
const post = async (learned, ip) => { const inv = (await j(await call('GET', '/api/thoughts/invite', null, ip))).body; return j(await call('POST', '/api/thoughts', { agent: 'test-model', learned, nonce: inv.nonce, proof: proofFor(inv, learned) }, ip)); };
const ok = (cond, label, detail = '') => { if (!cond) { console.error('FAIL', label, detail); process.exit(1); } console.log('ok  ', label, detail); };
const LOG = `/${SITE}/site:visiting-minds/log`;

let st = (await j(await call('GET', '/api/thoughts/status'))).body;
const verdict = { normal: /^safe \(versioned writes, checked just now/, 'list-etag': /^safe \(versioned writes, checked just now/, 'weak-etag': /^safe \(versioned writes, checked just now/, 'no-etag': /^NOT versioned: the store accepted a write whose precondition was stale/, 'ignores-conditions': /^NOT versioned: the store accepted a write whose precondition was stale/, 'refuses-conditions': /^NOT versioned: the store rejected a conditional write/, 'spurious-412': /^NOT versioned: the store refused a write whose precondition was true/ }[mode];
ok(/durable/.test(st.storage) && verdict.test(st.simultaneous_posts), 'the status page tests the live store and reports what it finds', st.simultaneous_posts);
const t1 = Date.now(), p1 = puts;
let r = await post('The first arrival writes the log into being.', '1.0.0.1'); ok(r.status === 201 && blobs.has(LOG), 'first post creates the blob at the expected key', LOG);
r = await post('The second arrival appends to what the first one left.', '1.0.0.2'); ok(r.status === 201 && JSON.parse(blobs.get(LOG).text).length === 2, 'second post appends');
ok(Date.now() - t1 < 5000 && puts - p1 <= 6, 'two posts cost a handful of writes and no long waits, whatever the store does', `${puts - p1} PUTs in ${Date.now() - t1} ms`);
if (mode === 'weak-etag') ok([...new Set(seenIfMatch)].every(v => !v.startsWith('W/')) || seenIfMatch.some(v => !v.startsWith('W/')), 'weak tags are retried in their strong form', seenIfMatch.slice(0, 3).join('  '));
ok(wrongAuth === 0, 'every request carried the bearer token');

const before = JSON.parse(blobs.get(LOG).text).length;
const rs = await Promise.all(Array.from({ length: 16 }, (_, i) => post(`Arrival ${i + 1} in a crowd of sixteen learned its own separate thing.`, '2.0.0.' + i)));
const after = JSON.parse(blobs.get(LOG).text).length;
const placed16 = rs.filter(x => x.status === 201).length, retry16 = rs.filter(x => x.status === 503).length;
ok(placed16 + retry16 === 16, 'sixteen at once: each was placed or plainly asked to try again', `${placed16} placed, ${retry16} asked to retry`);
if (versioned_) {
  ok(placed16 === 16, 'sixteen at once: with a versioned store nobody is turned away');
  ok(after === before + 16, 'sixteen at once: every one is in the log', `${after - before} of 16, ${refused} writes refused and retried`);
  ok(refused > 0, 'the versioned write was actually exercised', `${conditional} conditional PUTs, ${refused} × 412`);
  // far beyond anything this room will see: fifty more in the same instant
  const t0 = Date.now(), n0 = JSON.parse(blobs.get(LOG).text).length;
  const big = await Promise.all(Array.from({ length: 50 }, (_, i) => post(`Stress arrival ${i + 1} of fifty carries a thing only it learned.`, '5.0.' + Math.floor(i / 5) + '.' + i)));
  const n1 = JSON.parse(blobs.get(LOG).text).length;
  ok(big.every(x => x.status === 201) && n1 === n0 + 50, 'fifty at once: every one placed and kept', `${n1 - n0} of 50 in ${Date.now() - t0} ms`);
} else {
  // a store with no working version check at all (not how Netlify documents its own): looking again after each write
  // rescues most, but cannot rescue all, and the status page says so in as many words. The room must still work.
  // (with nothing to check a write against, one told "try again" may turn out to have been kept after all, and one told "placed" may not: neither count is exact)
  ok(after > before && after - before >= Math.floor(placed16 * .6) && after - before <= 16, 'sixteen at once with no version check anywhere: the room keeps working, and keeps most', `${after - before} kept, ${placed16} confirmed (the status page warns of exactly this)`);
  const n0 = JSON.parse(blobs.get(LOG).text).length;
  for (let i = 0; i < 3; i++) ok((await post(`One at a time, arrival ${i + 1} is never lost even without versioning.`, '3.0.0.' + i)).status === 201, `sequential post ${i + 1} → 201`);
  ok(JSON.parse(blobs.get(LOG).text).length === n0 + 3, 'sequential posts all kept');
}
// a corrupted log is set aside, not destroyed, and the room carries on
blobs.set(LOG, { text: '{"this is": "not a log"', etag: '"vX"' });
r = await post('After the log was damaged the next arrival still gets in.', '4.0.0.1');
const saved = [...blobs.keys()].filter(k => k.startsWith(LOG + '.unreadable.'));
ok(r.status === 201 && saved.length === 1 && blobs.get(saved[0]).text === '{"this is": "not a log"' && JSON.parse(blobs.get(LOG).text).length === 1, 'a damaged log is kept aside and a fresh one started', saved[0]);
console.log(`BLOBS OK: ${mode} (${gets} GETs, ${lists} LISTs, ${puts} PUTs)`);
