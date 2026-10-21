import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'regru-dist');
await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'site'), dist, { recursive: true });
await mkdir(path.join(dist, 'api'), { recursive: true });
await cp(path.join(root, 'server', 'submit.php'), path.join(dist, 'api', 'submit.php'));
await cp(path.join(root, 'server', 'config.example.php'), path.join(dist, 'api', 'config.example.php'));
await cp(path.join(root, 'server', 'api.htaccess'), path.join(dist, 'api', '.htaccess'));
await writeFile(path.join(dist, '.htaccess'), 'Options -Indexes\n');
console.log(`Пакет для REG.RU: ${dist}`);
