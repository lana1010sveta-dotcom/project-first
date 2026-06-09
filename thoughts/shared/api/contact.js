module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, contact_info, business, ai_level, goals } = req.body || {};

  await Promise.allSettled([
    sendTelegram({ name, contact_info, business, ai_level, goals }),
    sendToSheets({ name, contact_info, business, ai_level, goals }),
  ]);

  return res.status(200).json({ ok: true });
};

async function sendTelegram({ name, contact_info, business, ai_level, goals }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const lines = [
    '🔔 <b>Новая заявка с сайта!</b>',
    '',
    `👤 <b>Имя:</b> ${esc(name)}`,
    `📬 <b>Telegram:</b> ${esc(contact_info)}`,
  ];
  if (business) lines.push(`🏢 <b>Бизнес:</b> ${esc(business)}`);
  if (ai_level) lines.push(`🤖 <b>Опыт с ИИ:</b> ${esc(ai_level)}`);
  if (goals)    lines.push(`🎯 <b>Цели:</b> ${esc(goals)}`);

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }),
  });
}

async function sendToSheets({ name, contact_info, business, ai_level, goals }) {
  const url = process.env.GOOGLE_SHEET_URL;
  if (!url) return;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, contact_info, business, ai_level, goals }),
  });
}

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
