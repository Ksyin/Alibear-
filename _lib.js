const admin = require('firebase-admin');

function database() {
  initAdmin();
  return admin.database();
}

function initAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing.');

    let credential;
    try {
      credential = JSON.parse(raw);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.');
    }

    admin.initializeApp({
      credential: admin.credential.cert(credential),
      databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://alibearautomation-b95ab-default-rtdb.firebaseio.com'
    });
  }
}

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 128_000) throw new Error('Request is too large.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('A valid JSON request body is required.');
  }
}

function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = process.env.PUBLIC_SITE_URL;
  if (allowed && new URL(origin).origin === new URL(allowed).origin) return;
  // Same host as the deployment (custom domain, *.vercel.app or preview URL).
  if (req.headers.host && new URL(origin).host === req.headers.host) return;
  throw new Error('Cross-origin requests are not allowed.');
}

async function user(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new Error('Sign in to continue.');
  initAdmin();
  try {
    return await admin.auth().verifyIdToken(header.slice(7));
  } catch (error) {
    console.error('verifyIdToken failed:', error.code || error.message);
    if (error.code === 'auth/id-token-expired') throw new Error('Your session has expired. Please sign in again.');
    throw new Error('Could not verify your sign-in. Check that FIREBASE_SERVICE_ACCOUNT_JSON in Vercel belongs to the same Firebase project (alibearautomation-b95ab).');
  }
}

async function adminUser(req) {
  const identity = await user(req);
  if (identity.admin !== true) throw new Error('Store administrator access is required.');
  return identity;
}

function paystackSecret() {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('Paystack is not configured. Add PAYSTACK_SECRET_KEY in Vercel environment settings.');
  return secret;
}

async function paystackRequest(path, payload) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecret()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000)
  });
  const result = await response.json();
  if (!response.ok || result.status !== true) {
    throw new Error(result.message || 'Paystack could not complete this request.');
  }
  return result.data;
}

async function verifyPaystack(reference) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecret()}` },
    signal: AbortSignal.timeout(20_000)
  });
  const result = await response.json();
  if (!response.ok || result.status !== true) {
    throw new Error(result.message || 'Paystack could not verify this payment.');
  }
  return result.data;
}

function phoneNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^(?:254|0)?(?:7|1)\d{8}$/.test(digits)) {
    return digits.startsWith('254') ? digits : `254${digits.replace(/^0/, '')}`;
  }
  throw new Error('Enter a valid Kenyan phone number.');
}

function sha256(value) {
  return require('node:crypto').createHash('sha256').update(String(value)).digest('hex');
}

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

async function sendReceipt(order) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return { sent: false, reason: 'Email is disabled until a verified sender is configured.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) || /@gmail\.com$/i.test(from)) {
    return { sent: false, reason: 'Configure a verified custom-domain sender address in RESEND_FROM.' };
  }
  const rows = order.items.map(item => `<tr><td>${html(item.name)} × ${item.quantity}</td><td>KSh ${html(item.priceText)}</td></tr>`).join('');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Alibear Automation Orders <${from}>`,
      to: [order.email],
      subject: `Alibear Automation order ${order.id} — payment received`,
      html: `<h1>Thank you for your order.</h1><p>Hi ${html(order.customerName)}, your Paystack payment has been confirmed.</p><p>Order <strong>${html(order.id)}</strong></p><table>${rows}</table><p><strong>Total paid: KSh ${html(order.total)}</strong></p><p>Your order is connected to your customer account.</p>`
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'The receipt email service rejected the message.');
  return { sent: true, id: result.id };
}

module.exports = {
  admin,
  body,
  database,
  html,
  json,
  paystackRequest,
  phoneNumber,
  requireSameOrigin,
  sendReceipt,
  sha256,
  user,
  adminUser,
  verifyPaystack
};
