<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(array $body, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function field(string $name, int $maxBytes): string
{
    $value = trim((string) ($_POST[$name] ?? ''));
    if ($value === '' || strlen($value) > $maxBytes) respond(['ok' => false, 'error' => 'Проверьте заполнение всех полей.'], 422);
    return $value;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') respond(['ok' => false, 'error' => 'Метод не поддерживается.'], 405);
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 12 * 1024 * 1024) respond(['ok' => false, 'error' => 'Файл резюме должен быть не больше 10 МБ.'], 413);

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
if ($origin !== '' && $host !== '' && strtolower((string) parse_url($origin, PHP_URL_HOST)) !== strtolower(explode(':', $host)[0])) {
    respond(['ok' => false, 'error' => 'Запрос отклонён.'], 403);
}

if (($_POST['consent'] ?? '') !== '1') respond(['ok' => false, 'error' => 'Подтвердите согласие на обработку данных.'], 422);
$name = field('name', 480);
$contact = field('contact', 800);
$coverLetter = field('cover_letter', 40000);
$solution = field('solution', 40000);
$resumeUrl = trim((string) ($_POST['resume_url'] ?? ''));
$file = $_FILES['resume_file'] ?? null;
$hasFile = is_array($file) && ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
$resumeFile = null;

if ($hasFile) {
    if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name']) || $file['size'] > 10 * 1024 * 1024) {
        respond(['ok' => false, 'error' => 'Не удалось загрузить резюме. Проверьте файл (до 10 МБ).'], 422);
    }
    $fileName = basename((string) $file['name']);
    $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    if (!in_array($extension, ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'], true)) {
        respond(['ok' => false, 'error' => 'Прикрепите резюме в формате PDF, DOC, DOCX, ODT, RTF или TXT.'], 422);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: 'application/octet-stream';
    $resumeFile = [
        'name' => $fileName,
        'mime' => $mime,
        'data' => base64_encode((string) file_get_contents($file['tmp_name'])),
    ];
    $resumeUrl = '';
} elseif ($resumeUrl === '' || strlen($resumeUrl) > 2000 || !filter_var($resumeUrl, FILTER_VALIDATE_URL) || !in_array(strtolower((string) parse_url($resumeUrl, PHP_URL_SCHEME)), ['http', 'https'], true)) {
    respond(['ok' => false, 'error' => 'Укажите ссылку на резюме или прикрепите файл.'], 422);
}

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? require $configFile : [];
$scriptUrl = trim((string) ($config['apps_script_url'] ?? ''));
$secret = trim((string) ($config['shared_secret'] ?? ''));
if (!str_starts_with($scriptUrl, 'https://script.google.com/macros/s/') || $secret === '') {
    respond(['ok' => false, 'error' => 'Приём откликов пока не подключён. Попробуйте позже.'], 503);
}

$payload = json_encode([
    'secret' => $secret,
    'id' => bin2hex(random_bytes(12)),
    'name' => $name,
    'contact' => $contact,
    'resumeUrl' => $resumeUrl,
    'resumeFile' => $resumeFile,
    'coverLetter' => $coverLetter,
    'solution' => $solution,
    'consent' => true,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

$curl = curl_init($scriptUrl);
curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
]);
$result = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
$failed = $result === false;
curl_close($curl);
$decoded = !$failed ? json_decode((string) $result, true) : null;

if ($status < 200 || $status >= 300 || !is_array($decoded) || empty($decoded['ok'])) {
    error_log('Submission relay failed; upstream HTTP status: ' . $status);
    respond(['ok' => false, 'error' => 'Не удалось сохранить отклик. Попробуйте ещё раз.'], 502);
}

respond(['ok' => true, 'storage' => 'google_sheet']);
