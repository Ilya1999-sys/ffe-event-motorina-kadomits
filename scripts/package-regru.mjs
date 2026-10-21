import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'regru-dist');
await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'site'), dist, { recursive: true });
const revision = (contents) => createHash('sha256').update(contents).digest('hex').slice(0, 12);
const cssRevision = revision(await readFile(path.join(dist, 'styles.css')));
const jsRevision = revision(await readFile(path.join(dist, 'app.js')));
const indexPath = path.join(dist, 'index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes('href="./styles.css"') || !index.includes('src="./app.js"')) {
  throw new Error('Не найдены ссылки на CSS или JS в index.html');
}
await writeFile(indexPath, index.replace('href="./styles.css"', `href="./styles.css?v=${cssRevision}"`).replace('src="./app.js"', `src="./app.js?v=${jsRevision}"`));
await mkdir(path.join(dist, 'api'), { recursive: true });
await cp(path.join(root, 'server', 'submit.php'), path.join(dist, 'api', 'submit.php'));
await cp(path.join(root, 'server', 'config.example.php'), path.join(dist, 'api', 'config.example.php'));
await cp(path.join(root, 'server', 'api.htaccess'), path.join(dist, 'api', '.htaccess'));
console.log(`Пакет для REG.RU: ${dist}`);
