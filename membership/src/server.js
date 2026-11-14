'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
app.disable('x-powered-by');
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0 && trustProxyHops <= 5) app.set('trust proxy', trustProxyHops);
app.use(helmet());
app.use(express.json({ limit: '20kb' }));
const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' }
});

const PORT = Number(process.env.PORT || 8080);
const TOKEN_SECRET = process.env.TOKEN_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
if (!TOKEN_SECRET || TOKEN_SECRET.length < 32 || !ADMIN_API_KEY || ADMIN_API_KEY.length < 32) {
  throw new Error('Set TOKEN_SECRET and ADMIN_API_KEY to random secrets of at least 32 characters.');
}

const dbFile = path.resolve(process.env.DATABASE_FILE || './data/kem-membership.sqlite');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    plan_id TEXT NOT NULL,
    duration TEXT NOT NULL,
    amount_tzs INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','paid','rejected')),
    payment_reference TEXT UNIQUE,
    checkout_url TEXT,
    provider_payment_reference TEXT,
    created_at TEXT NOT NULL,
    paid_at TEXT
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    plan_id TEXT NOT NULL,
    duration TEXT NOT NULL,
    data_gb INTEGER NOT NULL,
    device_limit INTEGER NOT NULL,
    speed_mbps INTEGER NOT NULL,
    starts_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active','expired','revoked'))
  );
  CREATE INDEX IF NOT EXISTS idx_sub_user_expiry ON subscriptions(user_id, expires_at);
`);

const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map(column => column.name);
if (!orderColumns.includes('checkout_url')) db.exec('ALTER TABLE orders ADD COLUMN checkout_url TEXT');
if (!orderColumns.includes('provider_payment_reference')) db.exec('ALTER TABLE orders ADD COLUMN provider_payment_reference TEXT');

const PLANS = {
  bronze: { name: 'Bronze', speedMbps: 2, devices: 1, data: { day: 1, week: 2, month: 10 }, price: { day: 500, week: 1500, month: 5000 } },
  silver: { name: 'Silver', speedMbps: 5, devices: 2, data: { day: 2, week: 5, month: 25 }, price: { day: 1000, week: 3000, month: 10000 } },
  gold: { name: 'Gold', speedMbps: 10, devices: 3, data: { day: 4, week: 12, month: 60 }, price: { day: 2000, week: 6000, month: 20000 } },
  platinum: { name: 'Platinum', speedMbps: 15, devices: 5, data: { day: 8, week: 25, month: 120 }, price: { day: 3500, week: 10500, month: 35000 } }
};
const DURATIONS = { day: 1, week: 7, month: 30 };

const DEFAULT_PAYMENT_SETTINGS = {
  provider: process.env.PAYMENT_PROVIDER || 'manual_review',
  airtelLipaNumber: '',
  recipientName: '',
  enabledMethods: ['airtel_money'],
  instructions: 'Payment instructions will be shown here after the administrator configures them.'
};
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
function readSetting(key, fallback) {
  const row = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.setting_value); } catch { return fallback; }
}
function writeSetting(key, value) {
  db.prepare(`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`)
    .run(key, JSON.stringify(value), nowIso());
}
function publicPaymentSettings() {
  const saved = readSetting('payment', DEFAULT_PAYMENT_SETTINGS);
  return {
    provider: saved.provider,
    airtelLipaNumber: saved.airtelLipaNumber,
    recipientName: saved.recipientName,
    enabledMethods: saved.enabledMethods,
    instructions: saved.instructions
  };
}
function currentPlans() {
  const saved = readSetting('plans', null);
  return saved && typeof saved === 'object' ? saved : PLANS;
}
const nowIso = () => new Date().toISOString();

function normalizePhone(value) {
  const digits = String(value || '').replace(/[\s+()-]/g, '');
  if (/^0[67]\d{8}$/.test(digits)) return '255' + digits.slice(1);
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  return null;
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  const [salt, expectedHex] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return res.status(401).json({ error: 'Login required' });
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Invalid token' });
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.uid || data.exp < Date.now()) return res.status(401).json({ error: 'Session expired' });
    req.user = db.prepare('SELECT id, phone FROM users WHERE id = ?').get(data.uid);
    if (!req.user) return res.status(401).json({ error: 'Account not found' });
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}
function makeAdminToken() {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 30 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return payload + '.' + signature;
}
function verifyAdminToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return false;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return false; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.role === 'admin' && data.exp > Date.now();
  } catch { return false; }
}
function adminOnly(req, res, next) {
  const legacyKey = String(req.headers['x-admin-key'] || '');
  const expected = Buffer.from(ADMIN_API_KEY);
  const supplied = Buffer.from(legacyKey);
  const keyOk = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '');
  if (!keyOk && !verifyAdminToken(bearer)) return res.status(403).json({ error: 'Admin access denied or session expired' });
  next();
}
function addDuration(date, duration) {
  const result = new Date(date);
  if (duration === 'month') result.setUTCDate(result.getUTCDate() + 30);
  else result.setUTCDate(result.getUTCDate() + DURATIONS[duration]);
  return result;
}
function currentSubscription(userId) {
  const sub = db.prepare(`SELECT * FROM subscriptions
    WHERE user_id = ? AND status = 'active' AND expires_at > ?
    ORDER BY expires_at DESC LIMIT 1`).get(userId, nowIso());
  db.prepare("UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active' AND expires_at <= ?").run(userId, nowIso());
  return sub || null;
}

let clickPesaToken = '';
let clickPesaTokenExpiresAt = 0;
async function getClickPesaToken() {
  if (clickPesaToken && Date.now() < clickPesaTokenExpiresAt) return clickPesaToken;
  const clientId = process.env.CLICKPESA_CLIENT_ID;
  const apiKey = process.env.CLICKPESA_API_KEY;
  if (!clientId || !apiKey) throw new Error('ClickPesa merchant credentials are not configured.');
  const response = await fetch('https://api.clickpesa.com/third-parties/generate-token', {
    method: 'POST', headers: { 'client-id': clientId, 'api-key': apiKey }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.token !== 'string') throw new Error('ClickPesa token request failed: ' + (data.message || response.status));
  clickPesaToken = data.token.startsWith('Bearer ') ? data.token : 'Bearer ' + data.token;
  clickPesaTokenExpiresAt = Date.now() + 55 * 60 * 1000;
  return clickPesaToken;
}
async function clickPesaRequest(url, options = {}) {
  const token = await getClickPesaToken();
  const response = await fetch(url, { ...options, headers: { Authorization: token, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('ClickPesa request failed: ' + (data.message || response.status));
  return data;
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => {
    if (key !== 'checksum' && key !== 'checksumMethod') out[key] = canonicalize(value[key]);
    return out;
  }, {});
  return value;
}
function verifyClickPesaChecksum(payload) {
  const key = process.env.CLICKPESA_CHECKSUM_KEY;
  if (!key) return true;
  if (!payload.checksum) return false;
  const expected = crypto.createHmac('sha256', key).update(JSON.stringify(canonicalize(payload))).digest('hex');
  const supplied = Buffer.from(String(payload.checksum));
  const calculated = Buffer.from(expected);
  return supplied.length === calculated.length && crypto.timingSafeEqual(supplied, calculated);
}
function activatePaidOrder(order, paymentReference) {
  const start = new Date();
  const expiry = addDuration(start, order.duration);
  const plan = currentPlans()[order.plan_id];
  if (!plan) throw new Error('Order plan no longer exists.');
  return db.transaction(() => {
    const result = db.prepare("UPDATE orders SET status='paid', payment_reference=?, provider_payment_reference=?, paid_at=? WHERE id=? AND status='pending'")
      .run(paymentReference, paymentReference, start.toISOString(), order.id);
    if (result.changes !== 1) return false;
    db.prepare("INSERT INTO subscriptions(user_id,plan_id,duration,data_gb,device_limit,speed_mbps,starts_at,expires_at,status) VALUES(?,?,?,?,?,?,?,?, 'active')")
      .run(order.user_id, order.plan_id, order.duration, plan.data[order.duration], plan.devices, plan.speedMbps, start.toISOString(), expiry.toISOString());
    return true;
  })();
}
async function verifyAndActivateClickPesaOrder(orderReference, webhookData) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderReference);
  if (!order) throw new Error('Unknown KEM VPN order reference.');
  if (order.status === 'paid') return { alreadyPaid: true };
  const result = await clickPesaRequest('https://api.clickpesa.com/third-parties/payments/' + encodeURIComponent(orderReference));
  const payment = Array.isArray(result) ? result[0] : result;
  if (!payment || payment.status !== 'SUCCESS' || String(payment.orderReference) !== order.id ||
      String(payment.collectedCurrency).toUpperCase() !== 'TZS' ||
      Math.round(Number(payment.collectedAmount)) !== order.amount_tzs) {
    throw new Error('ClickPesa payment is not verified as the exact successful TZS order.');
  }
  if (webhookData && webhookData.paymentReference && String(webhookData.paymentReference) !== String(payment.paymentReference)) {
    throw new Error('Webhook payment reference does not match ClickPesa status.');
  }
  const reference = String(payment.paymentReference || '');
  if (!reference) throw new Error('ClickPesa did not return a payment reference.');
  activatePaidOrder(order, reference);
  return { alreadyPaid: false };
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'KEM VPN Membership API' }));
app.get('/api/plans', (_req, res) => {
  const plans = currentPlans();
  const result = Object.entries(plans).map(([id, p]) => ({
    id, name: p.name, speedMbps: p.speedMbps, devices: p.devices,
    offers: Object.keys(DURATIONS).map(duration => ({
      duration, days: DURATIONS[duration], priceTzs: p.price[duration], dataGb: p.data[duration]
    }))
  }));
  res.json({ currency: 'TZS', plans: result, pricesAreDraft: true });
});
app.get('/api/payment-settings', (_req, res) => res.json(publicPaymentSettings()));
app.post('/api/admin/logout', adminOnly, (req, res) => {\n  const bearer = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '');\n  const tokenHash = crypto.createHash('sha256').update(bearer).digest('hex');\n  db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ?').run(nowIso(), tokenHash);\n  res.json({ ok: true, message: 'Admin session imefungwa.' });\n});\napp.get('/api/admin/settings', adminOnly, (_req, res) => {
  res.json({ payment: readSetting('payment', DEFAULT_PAYMENT_SETTINGS), plans: currentPlans() });
});
app.put('/api/admin/settings', adminOnly, (req, res) => {
  const body = req.body || {};
  const payment = body.payment;
  const plans = body.plans;
  const allowedMethods = new Set(['airtel_money','mpesa','mixx_by_yas','halopesa','bank','visa','mastercard']);
  if (!payment || typeof payment !== 'object' || !plans || typeof plans !== 'object') {
    return res.status(400).json({ error: 'Payment and plans settings are required.' });
  }
  const methods = Array.isArray(payment.enabledMethods) ? [...new Set(payment.enabledMethods)] : [];
  if (methods.some(method => !allowedMethods.has(method))) return res.status(400).json({ error: 'Unsupported payment method.' });
  const number = String(payment.airtelLipaNumber || '').trim();
  const recipient = String(payment.recipientName || '').trim();
  const instructions = String(payment.instructions || '').trim();
  if (number.length > 32 || recipient.length > 100 || instructions.length > 500) {
    return res.status(400).json({ error: 'Payment settings are too long.' });
  }
  const cleanPlans = {};
  for (const id of ['bronze','silver','gold','platinum']) {
    const p = plans[id];
    if (!p || !p.price || !p.data) return res.status(400).json({ error: 'All four membership plans are required.' });
    const name = String(p.name || '').trim();
    const speedMbps = Number(p.speedMbps), devices = Number(p.devices);
    if (!name || name.length > 30 || !Number.isInteger(speedMbps) || speedMbps < 1 || speedMbps > 1000 ||
        !Number.isInteger(devices) || devices < 1 || devices > 20) {
      return res.status(400).json({ error: 'Invalid plan name, speed, or device limit.' });
    }
    const price = {}, data = {};
    for (const duration of Object.keys(DURATIONS)) {
      price[duration] = Number(p.price[duration]);
      data[duration] = Number(p.data[duration]);
      if (!Number.isInteger(price[duration]) || price[duration] < 0 || price[duration] > 100000000 ||
          !Number.isFinite(data[duration]) || data[duration] <= 0 || data[duration] > 100000) {
        return res.status(400).json({ error: 'Invalid plan price or data allowance.' });
      }
    }
    cleanPlans[id] = { name, speedMbps, devices, price, data };
  }
  writeSetting('payment', {
    provider: 'manual_review', airtelLipaNumber: number, recipientName: recipient,
    enabledMethods: methods, instructions
  });
  writeSetting('plans', cleanPlans);
  res.json({ ok: true, message: 'Settings saved.' });
});
app.use('/admin', express.static(path.join(__dirname, '../public'), { index: 'admin.html' }));

app.post('/api/register', authAttemptLimiter, (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');
  if (!phone || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Use a valid Tanzania mobile number and password of at least 8 characters.' });
  try {
    const result = db.prepare('INSERT INTO users(phone,password_hash,created_at) VALUES(?,?,?)').run(phone, hashPassword(password), nowIso());
    const user = { id: Number(result.lastInsertRowid), phone };
    res.status(201).json({ user, token: makeToken(user) });
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'Phone number is already registered.' });
    throw e;
  }
});

app.post('/api/login', authAttemptLimiter, (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');
  const user = phone && db.prepare('SELECT id,phone,password_hash FROM users WHERE phone = ?').get(phone);
  if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Phone number or password is incorrect.' });
  res.json({ user: { id: user.id, phone: user.phone }, token: makeToken(user) });
});

app.post('/api/admin/login', authAttemptLimiter, (req, res) => {
  const configuredHash = process.env.ADMIN_PIN_HASH || '';
  const pin = String(req.body.pin || '');
  if (!configuredHash || !/^\\d{6}$/.test(pin)) return res.status(503).json({ error: 'Admin PIN is not configured on the server.' });
  if (!verifyPassword(pin, configuredHash)) return res.status(401).json({ error: 'Admin PIN is incorrect.' });
  res.json({ token: makeAdminToken(), expiresInSeconds: 1800 });
});

app.get('/api/me', auth, (req, res) => {
  const subscription = currentSubscription(req.user.id);
  res.json({ user: req.user, subscription });
});

app.post('/api/orders', auth, async (req, res) => {
  try {
    const planId = String(req.body.planId || '').toLowerCase();
    const duration = String(req.body.duration || '').toLowerCase();
    const plan = currentPlans()[planId];
    if (!plan || !DURATIONS[duration]) return res.status(400).json({ error: 'Choose a valid plan and duration: day, week, or month.' });
    if ((process.env.PAYMENT_PROVIDER || 'manual_review') !== 'clickpesa') {
      return res.status(503).json({ error: 'Automatic payments are not enabled. KEM VPN is not accepting payments yet.' });
    }
    if (!process.env.CLICKPESA_CLIENT_ID || !process.env.CLICKPESA_API_KEY ||
        !process.env.PUBLIC_BASE_URL || !process.env.PUBLIC_BASE_URL.startsWith('https://')) {
      return res.status(503).json({ error: 'ClickPesa credentials and a public HTTPS API URL must be configured first.' });
    }
    const id = 'KEM' + crypto.randomBytes(10).toString('hex').toUpperCase();
    const amount = Number(plan.price[duration]);
    if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ error: 'This plan price is not valid for checkout.' });
    db.prepare("INSERT INTO orders(id,user_id,plan_id,duration,amount_tzs,status,created_at) VALUES(?,?,?,?,?,'pending',?)")
      .run(id, req.user.id, planId, duration, amount, nowIso());
    const callbackUrl = process.env.PUBLIC_BASE_URL.replace(/\/$/, '') + '/api/payments/clickpesa/webhook';
    const checkoutPayload = {
      totalPrice: String(amount), orderReference: id, orderCurrency: 'TZS',
      customerName: 'KEM VPN Customer', customerPhone: req.user.phone,
      description: 'KEM VPN ' + plan.name + ' ' + duration + ' membership', callbackUrl
    };
    if (process.env.CLICKPESA_CHECKSUM_KEY) {
      checkoutPayload.checksum = crypto.createHmac('sha256', process.env.CLICKPESA_CHECKSUM_KEY)
        .update(JSON.stringify(canonicalize(checkoutPayload))).digest('hex');
    }
    const checkout = await clickPesaRequest('https://api.clickpesa.com/third-parties/checkout-link/generate-checkout-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checkoutPayload)
    });
    if (!checkout.checkoutLink || !checkout.checkoutLink.startsWith('https://')) throw new Error('ClickPesa did not return a valid hosted checkout link.');
    db.prepare('UPDATE orders SET checkout_url=? WHERE id=?').run(checkout.checkoutLink, id);
    res.status(201).json({
      order: { id, plan: plan.name, duration, amountTzs: amount, status: 'pending' },
      payment: { provider: 'clickpesa', checkoutUrl: checkout.checkoutLink }
    });
  } catch (error) {
    console.error('Order checkout error:', error.message);
    res.status(502).json({ error: 'Could not start secure ClickPesa checkout. Please try again later.' });
  }
});

app.post('/api/payments/clickpesa/webhook', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!verifyClickPesaChecksum(payload)) return res.status(401).json({ error: 'Invalid ClickPesa checksum.' });
    const event = payload.event || payload.eventType;
    const data = payload.data || {};
    if (event === 'PAYMENT FAILED') return res.status(200).json({ received: true });
    if (event !== 'PAYMENT RECEIVED' || data.status !== 'SUCCESS' || !data.orderReference) {
      return res.status(400).json({ error: 'Unsupported or incomplete payment event.' });
    }
    const result = await verifyAndActivateClickPesaOrder(String(data.orderReference), data);
    res.status(200).json({ received: true, activated: !result.alreadyPaid });
  } catch (error) {
    console.error('ClickPesa webhook verification failed:', error.message);
    res.status(400).json({ error: 'Payment notification could not be verified.' });
  }
});

app.get('/api/orders', auth, (req, res) => {
  const orders = db.prepare('SELECT id,plan_id,duration,amount_tzs,status,payment_reference,checkout_url,created_at,paid_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ orders });
});

// Temporary admin verification. Only activate an order after checking the payment
// in the official merchant dashboard. This is not a public payment webhook.
app.post('/api/admin/orders/:id/confirm', adminOnly, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'pending'").get(req.params.id);
  const reference = String(req.body.paymentReference || '').trim();
  if (!order) return res.status(404).json({ error: 'Pending order not found.' });
  if (!reference || reference.length > 100) return res.status(400).json({ error: 'A valid payment reference is required.' });
  try { activatePaidOrder(order, reference); } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'This payment reference has already been used.' });
    throw e;
  }
  res.json({ ok: true, orderId: order.id, activatedUntil: expiry.toISOString() });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, '0.0.0.0', () => console.log('KEM VPN Membership API listening on port ' + PORT));
