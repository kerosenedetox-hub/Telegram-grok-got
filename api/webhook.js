// Vercel serverless webhook handler for Telegram + Grok
// Place this file at path: api/webhook.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Optional: verify secret token header if you set TELEGRAM_SECRET
  const TELEGRAM_SECRET = process.env.TELEGRAM_SECRET || '';
  const header = req.headers['x-telegram-bot-api-secret-token'];
  if (TELEGRAM_SECRET && header !== TELEGRAM_SECRET) {
    console.warn('Webhook called with invalid secret token');
    res.status(401).send('Unauthorized');
    return;
  }

  const update = req.body ?? {};
  // Quick ignore if not a chat message
  if (!update.message || !update.message.chat) {
    res.status(200).send('Ignored');
    return;
  }

  // Telegram chat and text
  const chatId = update.message.chat.id;
  const text = String(update.message.text || '').trim();

  // Validate required envs
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const GROK_API_KEY = process.env.GROK_API_KEY;
  if (!TELEGRAM_BOT_TOKEN || !GROK_API_KEY) {
    console.error('Missing TELEGRAM_BOT_TOKEN or GROK_API_KEY environment variable');
    res.status(500).send('Server misconfigured');
    return;
  }

  // Helper to send message back to Telegram
  const sendTelegram = async (chat_id, replyText) => {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text: replyText })
      });
    } catch (err) {
      console.error('Failed sending to Telegram:', err);
    }
  };

  try {
    // Call Grok AI - adapt endpoint/payload if your Grok API is different
    const grokResp = await fetch('https://api.grok.ai/v1/respond', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: text })
    });

    let reply = 'Sorry, I could not process that.';
    if (grokResp.ok) {
      const grokJson = await grokResp.json().catch(() => null);
      // Adjust based on actual Grok response structure
      reply = (grokJson && (grokJson.text || grokJson.response || grokJson.result)) 
        ? (grokJson.text || grokJson.response || grokJson.result) 
        : reply;
    } else {
      console.error('Grok API returned status', grokResp.status);
    }

    // Send final reply
    await sendTelegram(chatId, reply);

    // Return 200 to Telegram
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Processing error:', err);
    // Return 200 so Telegram does not aggressively retry (we handled the error)
    res.status(200).send('Error handled');
  }
}
