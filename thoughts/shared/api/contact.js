module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, contact_info, business, ai_level, goals } = req.body || {};

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set');
    return res.status(200).json({ ok: true });
  }

  const lines = [
    '🔔 <b>Новая заявка с сайта!</b>',
    '',
    `👤 <b>Имя:</b> ${escHtml(name)}`,
    `📬 <b>Telegram:</b> ${escHtml(contact_info)}`,
  ];
  if (business) lines.push(`🏢 <b>Бизнес:</b> ${escHtml(business)}`);
  if (ai_level) lines.push(`🤖 <b>Опыт с ИИ:</b> ${escHtml(ai_level)}`);
  if (goals)    lines.push(`🎯 <b>Цели:</b> ${escHtml(goals)}`);

  const text = lines.join('\n');

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!resp.ok) console.error('Telegram API error:', await resp.json());
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }

  return res.status(200).json({ ok: true });
};

function escHtml(str) {
  if (!str) return '—';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
