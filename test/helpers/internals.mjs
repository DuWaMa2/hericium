// A copy of the room's function with its inner helpers exported, so the tests can try them one at a time.
// The file that is deployed exports only its handler and its config, and nothing in netlify/functions is touched:
// the copy is written to the system's temporary folder and removed when the test ends.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const source = new URL('../../netlify/functions/thoughts.mjs', import.meta.url);
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hericium-test-'));
const copy = path.join(folder, 'thoughts.internals.mjs');
const names = ['textOf', 'line', 'lines', 'clean', 'fit', 'parseGift', 'hasLink', 'hasSecret', 'unkind', 'wordForms', 'taskFor', 'ipNumber', 'inRange', 'isShared', 'validRange', 'stale', 'forget', 'openMeter', 'reserveFor', 'HOST_SYSTEM', 'parseLog', 'pointerIn', 'addressIn', 'siteNames', 'NO_LINKS', 'pauseAfter', 'norm', 'shown', 'gate', 'kindOf', 'stamp', 'fromShelf'];

fs.writeFileSync(copy, fs.readFileSync(source, 'utf8') + '\nexport { ' + names.join(', ') + ' };\n');
export const X = await import(pathToFileURL(copy).href);
process.on('exit', () => { try { fs.rmSync(folder, { recursive: true, force: true }); } catch (e) {} });
