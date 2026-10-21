import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const site = path.join(root, 'site');
const localSubmissions = path.join(root, '.local-submissions');
const port = Number(process.env.PORT || 4173);
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function text(data, name, max) {
  const value = String(data.get(name) || '').trim();
  if (!value || Buffer.byteLength(value) > max) throw new Error('Проверьте заполнение всех полей.');
  return value;
}

async function submit(request, response) {
  if (Number(request.headers['content-length'] || 0) > 12 * 1024 * 1024) {
    json(response, 413, { ok: false, error: 'Файл резюме должен быть не больше 10 МБ.' });
    return;
  }
  try {
    const webRequest = new Request(`http://localhost:${port}/api/submit.php`, {
      method: 'POST', headers: request.headers, body: Readable.toWeb(request), duplex: 'half',
    });
    const data = await webRequest.formData();
    if (data.get('consent') !== '1') throw new Error('Подтвердите согласие на обработку данных.');
    const name = text(data, 'name', 480);
    const contact = text(data, 'contact', 800);
    const coverLetter = text(data, 'cover_letter', 40000);
    const solution = text(data, 'solution', 40000);
    const file = data.get('resume_file');
    const hasFile = file instanceof File && file.size > 0;
    const resumeUrl = hasFile ? '' : text(data, 'resume_url', 2000);
    if (!hasFile && !/^https?:\/\//i.test(resumeUrl)) throw new Error('Укажите ссылку на резюме или прикрепите файл.');
    if (hasFile && file.size > 10 * 1024 * 1024) throw new Error('Файл резюме должен быть не больше 10 МБ.');
    if (hasFile && !/\.(pdf|doc|docx|odt|rtf|txt)$/i.test(file.name)) throw new Error('Прикрепите резюме в формате PDF, DOC, DOCX, ODT, RTF или TXT.');

    const id = randomUUID();
    const payload = {
      secret: process.env.APPS_SCRIPT_SECRET || '', id, name, contact,
      resumeUrl, resumeFile: hasFile ? {
        name: file.name, mime: file.type || 'application/octet-stream',
        data: Buffer.from(await file.arrayBuffer()).toString('base64'),
      } : null,
      coverLetter, solution, consent: true,
    };

    if (process.env.APPS_SCRIPT_URL && process.env.APPS_SCRIPT_SECRET) {
      const upstream = await fetch(process.env.APPS_SCRIPT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
      });
      const result = await upstream.json();
      if (!upstream.ok || !result.ok) throw new Error('Не удалось сохранить отклик в Google Таблице.');
      json(response, 200, { ok: true, storage: 'google_sheet' });
      return;
    }

    await mkdir(localSubmissions, { recursive: true });
    if (hasFile) {
      const extension = path.extname(file.name).toLowerCase();
      await writeFile(path.join(localSubmissions, `${id}${extension}`), Buffer.from(await file.arrayBuffer()));
    }
    await writeFile(path.join(localSubmissions, `${id}.json`), JSON.stringify({
      id, name, contact, resumeUrl, resumeFileName: hasFile ? file.name : '',
      coverLetter, solution, submittedAt: new Date().toISOString(),
    }, null, 2));
    json(response, 200, { ok: true, storage: 'local' });
  } catch (error) {
    json(response, 422, { ok: false, error: error.message || 'Не удалось отправить отклик.' });
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://localhost:${port}`);
  if (url.pathname === '/api/submit.php') {
    if (request.method !== 'POST') return json(response, 405, { ok: false, error: 'Метод не поддерживается.' });
    return submit(request, response);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { ok: false });
  let filePath;
  try {
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    filePath = path.resolve(site, `.${requested}`);
  } catch {
    return json(response, 400, { ok: false });
  }
  if (filePath !== site && !filePath.startsWith(site + path.sep)) return json(response, 403, { ok: false });
  try {
    const bytes = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    json(response, 404, { ok: false, error: 'Не найдено.' });
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Лендинг: http://127.0.0.1:${port}/`);
  console.log(process.env.APPS_SCRIPT_URL ? 'Google Таблица подключена через Apps Script.' : 'Отклики сохраняются в .local-submissions для проверки.');
});
