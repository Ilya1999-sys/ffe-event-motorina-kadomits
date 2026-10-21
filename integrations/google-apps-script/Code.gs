const SHEET_ID = '1WjuYVQz-R3EakW4IVwxY1Nj_J5vTohr80Q8u6MF0s10';
const SHEET_NAME = 'Отклики';
const HEADERS = ['ID', 'Дата', 'Имя', 'Контакт', 'Резюме', 'Имя файла', 'Сопроводительное письмо', 'Решение тестового'];

function doPost(event) {
  try {
    const data = JSON.parse(event.postData.contents || '{}');
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = properties.getProperty('SUBMISSION_SECRET');
    if (!expectedSecret || data.secret !== expectedSecret) throw new Error('Доступ запрещён');
    if (!data.consent || !data.name || !data.contact || !data.coverLetter || !data.solution) throw new Error('Не заполнены обязательные поля');
    if (!data.resumeUrl && !data.resumeFile) throw new Error('Не указано резюме');

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
      const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
      if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);

      let resume = String(data.resumeUrl || '');
      let fileName = '';
      if (data.resumeFile) {
        fileName = String(data.resumeFile.name || 'Резюме');
        const blob = Utilities.newBlob(
          Utilities.base64Decode(data.resumeFile.data),
          String(data.resumeFile.mime || 'application/octet-stream'),
          fileName
        );
        const folderId = properties.getProperty('DRIVE_FOLDER_ID');
        const file = folderId ? DriveApp.getFolderById(folderId).createFile(blob) : DriveApp.createFile(blob);
        resume = file.getUrl();
      }

      sheet.appendRow([
        safeCell(data.id || ''),
        new Date(),
        safeCell(data.name),
        safeCell(data.contact),
        safeCell(resume),
        safeCell(fileName),
        safeCell(data.coverLetter),
        safeCell(data.solution),
      ]);
    } finally {
      lock.releaseLock();
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: String(error.message || error) });
  }
}

function safeCell(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
