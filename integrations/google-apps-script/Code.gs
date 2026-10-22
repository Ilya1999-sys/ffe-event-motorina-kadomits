const SHEET_ID = '1WjuYVQz-R3EakW4IVwxY1Nj_J5vTohr80Q8u6MF0s10';
const SHEET_NAME = 'Отклики';
const DEFAULT_DRIVE_FOLDER_ID = '1Uw_sTRm4ZtMEedN6mCegK2S11MCePRmk';
const HEADERS = ['ID', 'Дата и время', 'Имя', 'Контакт', 'Резюме', 'Имя файла', 'Сопроводительное письмо', 'Решение тестового', 'Статус', 'Оценка', 'Заметки'];

function setupSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    const empty = spreadsheet.getSheets().find(tab => tab.getLastRow() === 0 && tab.getName() === 'Лист1');
    sheet = empty || spreadsheet.insertSheet(SHEET_NAME);
    if (empty) sheet.setName(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  sheet.setFrozenRows(1);
  sheet.setTabColor('#004f89');
  sheet.setColumnWidths(1, 1, 205);
  sheet.setColumnWidths(2, 1, 155);
  sheet.setColumnWidths(3, 1, 180);
  sheet.setColumnWidths(4, 1, 220);
  sheet.setColumnWidths(5, 1, 270);
  sheet.setColumnWidths(6, 1, 180);
  sheet.setColumnWidths(7, 2, 430);
  sheet.setColumnWidths(9, 1, 140);
  sheet.setColumnWidths(10, 1, 90);
  sheet.setColumnWidths(11, 1, 300);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#004f89').setFontColor('#fff7da').setFontWeight('bold');
  sheet.getRange('B2:B').setNumberFormat('dd.mm.yyyy hh:mm');
  sheet.getRange('G2:H').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sheet.getRange('A2:K').setVerticalAlignment('top');
  const statuses = ['Новый', 'На разборе', 'Финалист', 'Победитель', 'Готово'];
  const validation = SpreadsheetApp.newDataValidation().requireValueInList(statuses, true).setAllowInvalid(false).build();
  sheet.getRange('I2:I').setDataValidation(validation);
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).createFilter();
  return sheet;
}

function authorizeDrive() {
  const folder = DriveApp.getFolderById(DEFAULT_DRIVE_FOLDER_ID);
  const file = folder.createFile('ffe-authorization-check.txt', 'Проверка доступа к папке резюме');
  file.setTrashed(true);
}

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
      const sheet = setupSheet();
      if (sheet.createTextFinder(String(data.id || '')).matchEntireCell(true).findNext()) {
        return jsonResponse({ ok: true, duplicate: true });
      }

      let resume = String(data.resumeUrl || '');
      let fileName = '';
      if (data.resumeFile) {
        fileName = String(data.resumeFile.name || 'Резюме');
        const blob = Utilities.newBlob(
          Utilities.base64Decode(data.resumeFile.data),
          String(data.resumeFile.mime || 'application/octet-stream'),
          fileName
        );
        const folderId = properties.getProperty('DRIVE_FOLDER_ID') || DEFAULT_DRIVE_FOLDER_ID;
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
        'Новый',
        '',
        '',
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
