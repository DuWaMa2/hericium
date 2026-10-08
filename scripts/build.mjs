// The only build step. The two skill files live at the top of the repository, where agent tools look for them.
// The room serves them as well (/skills/..., /openclaw/...), so they are copied beside the pages before a deploy.
// Written in Node and not as a shell command so that it runs the same on every system.
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const top = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const folder of ['skills', 'openclaw']) {
  cpSync(path.join(top, folder), path.join(top, 'site', folder), { recursive: true });
  console.log('copied ' + folder + '/ into site/');
}
