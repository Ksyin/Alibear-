const admin = require('firebase-admin');

let fileConfig = {};
try {
  fileConfig = require('./config.js');
} catch {
  fileConfig = {};
}

// Setting lookup: Vercel env var first, then config.js in the repo.
function cfg(name) {
  return String(process.env[name] || fileConfig[name] || '').trim();
}

// Public address of the site: configured value, otherwise detected from the request.
function siteUrl(req) {
  const configured = cfg('PUBLIC_SITE_URL');
  if (configured) return configured;
  const host = req && (req.headers['x-forwarded-host'] || req.headers.host);
  if (!host) throw new Error('Could not detect the site address.');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${String(host).split(',')[0]}`;
}

// ---------------------------------------------------------------------------
// Realtime Database access.
// Preferred: a real service-account key (firebase-service-account.json or env vars).
// Fallback: the legacy database secret (FIREBASE_DATABASE_SECRET) over the REST API.
// ---------------------------------------------------------------------------
const DEFAULT_PROJECT_ID = 'alibear-2b06a';
const DEFAULT_DATABASE_URL = 'https://alibear-2b06a-default-rtdb.firebaseio.com';

function databaseUrl() {
  return (cfg('FIREBASE_DATABASE_URL') || DEFAULT_DATABASE_URL).replace(/\/$/, '');
}

function restDatabase(secret) {
  const endpoint = (path, params = {}) => {
    const clean = String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const url = new URL(`${databaseUrl()}/${clean}.json`);
    url.searchParams.set('auth', secret);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  };
  const snapshot = value => ({
    exists: () => value !== null && value !== undefined,
    val: () => (value === undefined ? null : value)
  });
  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
    if (response.status === 412) return { conflict: true };
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) throw new Error((data && data.error) || `Realtime Database request failed (${response.status}).`);
    return { data, etag: response.headers.get('etag') };
  };
  const put = (path, value, headers) => request(endpoint(path), {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value)
  });

  function ref(path) {
    const self = {
      async get() { return snapshot((await request(endpoint(path))).data); },
      async set(value) { await put(path, value); },
      async update(values) {
        await request(endpoint(path), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
        });
      },
      limitToFirst(count) {
        return {
          async get() {
            const result = await request(endpoint(path, { orderBy: '"$key"', limitToFirst: String(count) }));
            return snapshot(result.data);
          }
        };
      },
      // Optimistic-concurrency transaction using ETags (same contract as the Admin SDK).
      async transaction(update) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const read = await request(endpoint(path), { headers: { 'X-Firebase-ETag': 'true' } });
          const current = read.data === undefined ? null : read.data;
          const next = update(current);
          if (next === undefined) return { committed: false, snapshot: snapshot(current) };
          const write = await put(path, next, { 'if-match': read.etag });
          if (!write.conflict) return { committed: true, snapshot: snapshot(next) };
        }
        throw new Error('The database was busy. Please try again.');
      }
    };
    return self;
  }
  return { ref };
}

// Service-account key committed to the (private) repo as firebase-service-account.json.
function bundledServiceAccount() {
  try {
    return require('./firebase-service-account.json');
  } catch {
    return null;
  }
}

function serviceAccountCredential() {
  const raw = cfg('FIREBASE_SERVICE_ACCOUNT_JSON');
  let credential = null;
  if (raw) {
    try {
      credential = JSON.parse(raw);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.');
    }
  } else if (cfg('FIREBASE_CLIENT_EMAIL') && cfg('FIREBASE_PRIVATE_KEY')) {
    credential = {
      projectId: cfg('FIREBASE_PROJECT_ID') || DEFAULT_PROJECT_ID,
      clientEmail: cfg('FIREBASE_CLIENT_EMAIL'),
      privateKey: cfg('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')
    };
  } else {
    credential = bundledServiceAccount();
  }
  const key = credential && (credential.private_key || credential.privateKey);
  // Placeholder / missing keys are treated as "no service account".
  if (!key || !String(key).includes('BEGIN PRIVATE KEY')) return null;
  return credential;
}

let mode = null; // 'service-account' | 'secret'

function initAdmin() {
  if (mode) return mode;
  const credential = serviceAccountCredential();
  if (credential) {
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(credential), databaseURL: databaseUrl() });
    }
    mode = 'service-account';
  } else if (cfg('FIREBASE_DATABASE_SECRET')) {
    // No credential needed to verify ID tokens: only the project id (public Google certs).
    if (!admin.apps.length) admin.initializeApp({ projectId: cfg('FIREBASE_PROJECT_ID') || DEFAULT_PROJECT_ID });
    mode = 'secret';
  } else {
    throw new Error('Firebase is not configured: set FIREBASE_DATABASE_SECRET in config.js, or paste the service-account key for alibear-2b06a into firebase-service-account.json.');
  }
  return mode;
}

let restInstance = null;
function database() {
  if (initAdmin() === 'secret') {
    restInstance = restInstance || restDatabase(cfg('FIREBASE_DATABASE_SECRET'));
    return restInstance;
  }
  return admin.database();
}

// Administrators: the owner (meta/owner/uid) and everyone listed under meta/admins/<uid>, the same lists the registration site uses.
async function isAdminUid(uid) {
  if (!uid) return false;
  const owner = (await database().ref('meta/owner/uid').get()).val();
  if (owner && owner === uid) return true;
  return (await database().ref(`meta/admins/${uid}`).get()).exists();
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
  const allowed = cfg('PUBLIC_SITE_URL');
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
    throw new Error('Could not verify your sign-in. Check that the site is using the Firebase project alibear-2b06a.');
  }
}

async function adminUser(req) {
  const identity = await user(req);
  if (!(await isAdminUid(identity.uid))) throw new Error('Store administrator access is required.');
  return identity;
}

function paystackSecret() {
  const secret = cfg('PAYSTACK_SECRET_KEY');
  if (!secret) throw new Error('Paystack is not configured. Set PAYSTACK_SECRET_KEY in config.js.');
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
  const key = cfg('RESEND_API_KEY');
  const from = cfg('RESEND_FROM');
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
  cfg,
  siteUrl,
  admin,
  body,
  database,
  isAdminUid,
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
