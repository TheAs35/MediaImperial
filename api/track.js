// Vercel Serverless Function — Meta Conversions API forwarder
// Receives events from the browser and forwards them server-side to Meta
// using event_id for deduplication with the browser Pixel.

const crypto = require('crypto');

const sha256 = (value) => {
  if (!value) return undefined;
  return crypto
    .createHash('sha256')
    .update(String(value).trim().toLowerCase())
    .digest('hex');
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PIXEL_ID = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  const TEST_CODE = process.env.META_TEST_EVENT_CODE;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const {
    event_name = 'PageView',
    event_id,
    event_source_url,
    user_data = {},
    custom_data = {},
  } = body;

  const fwd = req.headers['x-forwarded-for'] || '';
  const client_ip = (Array.isArray(fwd) ? fwd[0] : fwd.split(',')[0]).trim()
    || req.headers['x-real-ip']
    || '';
  const client_user_agent = req.headers['user-agent'] || '';

  const ud = { client_ip_address: client_ip, client_user_agent };
  if (user_data.em) ud.em = [sha256(user_data.em)];
  if (user_data.ph) ud.ph = [sha256(user_data.ph)];
  if (user_data.fn) ud.fn = [sha256(user_data.fn)];
  if (user_data.ln) ud.ln = [sha256(user_data.ln)];
  if (user_data.fbp) ud.fbp = user_data.fbp;
  if (user_data.fbc) ud.fbc = user_data.fbc;
  if (user_data.external_id) ud.external_id = [sha256(user_data.external_id)];

  const payload = {
    data: [
      {
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        event_source_url,
        action_source: 'website',
        user_data: ud,
        custom_data,
      },
    ],
  };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    const data = await response.json();
    return res.status(response.ok ? 200 : 502).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
