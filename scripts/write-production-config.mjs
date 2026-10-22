import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptUrl = process.env.APPS_SCRIPT_URL?.trim() || '';
const secret = process.env.APPS_SCRIPT_SECRET?.trim() || '';

if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(scriptUrl)) {
  throw new Error('APPS_SCRIPT_URL must be a deployed Apps Script /exec URL');
}
if (!/^[a-f0-9]{64}$/.test(secret)) {
  throw new Error('APPS_SCRIPT_SECRET must be the 64-character shared secret');
}

const quote = (value) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const output = path.join(root, 'regru-dist', 'api', 'config.php');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `<?php\ndeclare(strict_types=1);\n\nreturn [\n    'apps_script_url' => ${quote(scriptUrl)},\n    'shared_secret' => ${quote(secret)},\n];\n`, { mode: 0o600 });
console.log('Production submission configuration prepared');
