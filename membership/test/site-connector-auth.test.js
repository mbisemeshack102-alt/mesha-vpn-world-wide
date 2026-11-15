'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const connectorAuth = require('../src/site-connector-auth');

function database() {
  const db = new Database(':memory:');
  connectorAuth.installSchema(db);
  return db;
}

test('enrollment tokens are one-time and create a connector credential', () => {
  const db = database();
  const enrollment = connectorAuth.createEnrollment(db, { label:'Shop router', now:1000 });
  assert.equal(enrollment.token.length >= 40, true);
  const enrolled = connectorAuth.consumeEnrollment(db, enrollment.token, { now:2000 });
  assert.ok(enrolled.connectorId);
  assert.ok(enrolled.token);
  assert.equal(enrolled.label, 'Shop router');
  assert.equal(connectorAuth.consumeEnrollment(db, enrollment.token, { now:3000 }), null);
  db.close();
});

test('expired and malformed enrollment tokens are rejected', () => {
  const db = database();
  const enrollment = connectorAuth.createEnrollment(db, { now:1000 });
  assert.equal(connectorAuth.consumeEnrollment(db, enrollment.token, { now:enrollment.expiresAt }), null);
  assert.equal(connectorAuth.consumeEnrollment(db, 'bad'), null);
  db.close();
});

test('connector token authenticates, updates heartbeat, and can be revoked', () => {
  const db = database();
  const enrollment = connectorAuth.createEnrollment(db, { now:1000 });
  const connector = connectorAuth.consumeEnrollment(db, enrollment.token, { now:2000 });
  assert.deepEqual(connectorAuth.authenticateConnector(db, connector.token, { now:3000 }),
    { id:connector.connectorId, label:'Wi-Fi site' });
  assert.equal(connectorAuth.listConnectors(db)[0].lastSeenAt, 3000);
  assert.equal(connectorAuth.revokeConnector(db, connector.connectorId, { now:4000 }), true);
  assert.equal(connectorAuth.authenticateConnector(db, connector.token, { now:5000 }), null);
  db.close();
});

test('enrollment lifetime is bounded', () => {
  const db = database();
  assert.throws(() => connectorAuth.createEnrollment(db, { ttlMs:31*60*1000 }), /between 1 and 30 minutes/);
  db.close();
});
