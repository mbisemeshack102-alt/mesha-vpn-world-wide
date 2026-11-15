'use strict';

const crypto = require('node:crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function installSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_connector_enrollments (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS site_connectors (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER,
      revoked_at INTEGER
    );
  `);
}
function createEnrollment(db, { label = 'Wi-Fi site', ttlMs = 10 * 60 * 1000, now = Date.now() } = {}) {
  const safeLabel = String(label).trim().slice(0, 80) || 'Wi-Fi site';
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 30 * 60 * 1000) {
    throw new RangeError('Enrollment lifetime must be between 1 and 30 minutes.');
  }
  const token = randomToken();
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO site_connector_enrollments(id,token_hash,label,expires_at,created_at) VALUES(?,?,?,?,?)')
    .run(id, hashToken(token), safeLabel, now + ttlMs, now);
  return { id, token, label: safeLabel, expiresAt: now + ttlMs };
}
function consumeEnrollment(db, token, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) return null;
  const tokenHash = hashToken(token);
  return db.transaction(() => {
    const enrollment = db.prepare(`SELECT id,label,expires_at,used_at FROM site_connector_enrollments
      WHERE token_hash=?`).get(tokenHash);
    if (!enrollment || enrollment.used_at !== null || enrollment.expires_at <= now) return null;
    const connectorId = crypto.randomUUID();
    const connectorToken = randomToken();
    db.prepare('INSERT INTO site_connectors(id,token_hash,label,created_at,last_seen_at) VALUES(?,?,?,?,?)')
      .run(connectorId, hashToken(connectorToken), enrollment.label, now, now);
    const updated = db.prepare('UPDATE site_connector_enrollments SET used_at=? WHERE id=? AND used_at IS NULL')
      .run(now, enrollment.id);
    if (updated.changes !== 1) throw new Error('Enrollment token was already consumed.');
    return { connectorId, token: connectorToken, label: enrollment.label };
  })();
}
function authenticateConnector(db, token, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) return null;
  const row = db.prepare('SELECT id,label FROM site_connectors WHERE token_hash=? AND revoked_at IS NULL')
    .get(hashToken(token));
  if (!row) return null;
  db.prepare('UPDATE site_connectors SET last_seen_at=? WHERE id=? AND revoked_at IS NULL').run(now, row.id);
  return { id: row.id, label: row.label };
}
function listConnectors(db) {
  return db.prepare('SELECT id,label,created_at AS createdAt,last_seen_at AS lastSeenAt,revoked_at AS revokedAt FROM site_connectors ORDER BY created_at DESC').all();
}
function revokeConnector(db, id, { now = Date.now() } = {}) {
  return db.prepare('UPDATE site_connectors SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(now, id).changes === 1;
}
module.exports = { installSchema, createEnrollment, consumeEnrollment, authenticateConnector, listConnectors, revokeConnector };
