/**
 * SvetlanaDev — приёмник заявок с сайта в Google-таблицу.
 *
 * Привязан к таблице (Extensions → Apps Script).
 * Деплоится как Web App. Серверная функция сайта (api/contact.js)
 * шлёт сюда POST с JSON: { name, contact_info, business, ai_level, goals }.
 */

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Заявки') || ss.getActiveSheet();

    // Если лист пустой — добавляем строку заголовков
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Дата и время', 'Имя', 'Контакт', 'Бизнес', 'Опыт с ИИ', 'Цели']);
    }

    var tz = Session.getScriptTimeZone() || 'Europe/Minsk';
    var ts = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');

    sheet.appendRow([
      ts,
      data.name || '',
      data.contact_info || '',
      data.business || '',
      data.ai_level || '',
      data.goals || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Чтобы можно было открыть URL в браузере и убедиться, что приёмник жив.
function doGet() {
  return ContentService
    .createTextOutput('SvetlanaDev — приёмник заявок работает ✅')
    .setMimeType(ContentService.MimeType.TEXT);
}
