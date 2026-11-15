'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../src/router-driver-contract');
const registry = require('../src/router-adapters');

test('driver contract requires connection test and status methods', () => {
  assert.throws(() => contract.validateDriver({}), /testConnection, getStatus/);
  assert.deepEqual(contract.validateDriver({
    async testConnection() { return { ok: true }; },
    async getStatus() { return { connected: true }; }
  }).supportedOperations, []);
});

test('optional operations are reported only when implemented', () => {
  const driver = {
    async testConnection() {},
    async getStatus() {},
    async listClients() {},
    async disconnectClient() {}
  };
  assert.deepEqual(contract.getSupportedOperations(driver), ['listClients', 'disconnectClient']);
});

test('driver calls reject unknown or unavailable operations', async () => {
  const driver = { async testConnection() {}, async getStatus() {} };
  await assert.rejects(contract.callDriver(driver, 'deleteRouter'), /Unsupported router operation/);
  await assert.rejects(contract.callDriver(driver, 'createVoucher'), /does not implement/);
});

test('registry exposes planned adapters without pretending a driver is installed', () => {
  const mikrotik = registry.getIntegrationStatus('mikrotik-routeros');
  assert.equal(mikrotik.driverLoaded, false);
  assert.equal(mikrotik.ready, false);
  assert.equal(registry.getAdapter('not-a-router'), null);
});

test('registry rejects incomplete drivers and accepts a valid contract once', () => {
  assert.throws(() => registry.registerDriver('mikrotik-routeros', {}), /missing required method/);
  const id = 'manual';
  const driver = {
    async testConnection() { return { ok: true }; },
    async getStatus() { return { connected: false }; },
    async listClients() { return []; }
  };
  registry.registerDriver(id, driver);
  assert.equal(registry.getDriver(id), driver);
  assert.deepEqual(registry.getIntegrationStatus(id).supportedOperations, ['listClients']);
  assert.throws(() => registry.registerDriver(id, driver), /already registered/);
});
