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

const PLANS = {
  bronze: { name: 'Bronze', speedMbps: 2, devices: 1, data: { day: 1, week: 2, month: 10 }, price: { day: 500, week: 1500, month: 5000 } },
  silver: { name: 'Silver', speedMbps: 5, devices: 2, data: { day: 2, week: 5, month: 25 }, price: { day: 1000, week: 3000, month: 10000 } },
  gold: { name: 'Gold', speedMbps: 10, devices: 3, data: { day: 4, week: 12, month: 60 }, price: { day: 2000, week: 6000, month: 20000 } },
  platinum: { name: 'Platinum', speedMbps: 15, devices: 5, data: { day: 8, week: 25, month: 120 }, price: { day: 3500, week: 10500, month: 35000 } }
};
const DURATIONS = { day: 1, week: 7, month: 30 };

const DEFAULT_PAYMENT_SETTINGS = {
  provider: 'manual_airtel',
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
function adminOnly(req, res, next) {
  const supplied = Buffer.from(String(req.headers['x-admin-key'] || ''));
  const expected = Buffer.from(ADMIN_API_KEY);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(403).json({ error: 'Admin access denied' });
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
app.get('/api/admin/settings', adminOnly, (_req, res) => {
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

app.get('/api/me', auth, (req, res) => {
  const subscription = currentSubscription(req.user.id);
  res.json({ user: req.user, subscription });
});

app.post('/api/orders', auth, (req, res) => {
  const planId = String(req.body.planId || '').toLowerCase();
  const duration = String(req.body.duration || '').toLowerCase();
  const plan = currentPlans()[planId];
  if (!plan || !DURATIONS[duration]) return res.status(400).json({ error: 'Choose a valid plan and duration: day, week, or month.' });
  const id = 'KEM-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  const amount = plan.price[duration];
  db.prepare(`INSERT INTO orders(id,user_id,plan_id,duration,amount_tzs,status,created_at)
    VALUES(?,?,?,?,?,'pending',?)`).run(id, req.user.id, planId, duration, amount, nowIso());
  res.status(201).json({
    order: { id, plan: plan.name, duration, amountTzs: amount, status: 'pending' },
    payment: { provider: 'manual_review', message: 'Payment is not automated yet. Do not send money until KEM VPN publishes its official payment instructions.' }
  });
});

app.get('/api/orders', auth, (req, res) => {
  const orders = db.prepare('SELECT id,plan_id,duration,amount_tzs,status,payment_reference,created_at,paid_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ orders });
});

// Temporary admin verification. Only activate an order after checking the payment
// in the official merchant dashboard. This is not a public payment webhook.
app.post('/api/admin/orders/:id/confirm', adminOnly, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'pending'").get(req.params.id);
  const reference = String(req.body.paymentReference || '').trim();
  if (!order) return res.status(404).json({ error: 'Pending order not found.' });
  if (!reference || reference.length > 100) return res.status(400).json({ error: 'A valid payment reference is required.' });
  const plan = currentPlans()[order.plan_id];
  const start = new Date();
  const expiry = addDuration(start, order.duration);
  const activate = db.transaction(() => {
    db.prepare("UPDATE orders SET status='paid', payment_reference=?, paid_at=? WHERE id=? AND status='pending'").run(reference, start.toISOString(), order.id);
    db.prepare(`INSERT INTO subscriptions(user_id,plan_id,duration,data_gb,device_limit,speed_mbps,starts_at,expires_at,status)
      VALUES(?,?,?,?,?,?,?,?, 'active')`).run(order.user_id, order.plan_id, order.duration, plan.data[order.duration], plan.devices, plan.speedMbps, start.toISOString(), expiry.toISOString());
  });
  try { activate(); } catch (e) {
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
