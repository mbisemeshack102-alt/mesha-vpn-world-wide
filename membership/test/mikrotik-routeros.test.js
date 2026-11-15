'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDriver } = require('../src/drivers/mikrotik-routeros');

function fakeTransport(responses = {}) {
  const calls = [];
  return {
    calls,
    async command(path, attributes) {
      calls.push({ path, attributes });
      const value = responses[path];
      return typeof value === 'function' ? value(attributes) : (value || []);
    }
  };
}

test('MikroTik driver requires connector transport', () => {
  assert.throws(() => makeDriver(null), /site-connector transport/);
});

test('connection test and status use RouterOS system resource', async () => {
  const transport = fakeTransport({ '/system/resource/print': [{ 'board-name':'hAP ac2', version:'7.15', uptime:'1d' }] });
  const driver = makeDriver(transport);
  assert.equal((await driver.testConnection()).ok, true);
  assert.deepEqual(await driver.getStatus(), { connected:true, boardName:'hAP ac2', version:'7.15', uptime:'1d' });
});

test('voucher creation validates values and applies limits', async () => {
  const transport = fakeTransport();
  const driver = makeDriver(transport);
  const result = await driver.createVoucher({ username:'trial01', password:'secret123', profile:'1Mbps',
    limitUptime:'1h', limitBytesTotal:1048576 });
  assert.equal(result.created, true);
  assert.deepEqual(transport.calls[0], { path:'/ip/hotspot/user/add',
    attributes:{ name:'trial01', password:'secret123', profile:'1Mbps', 'limit-uptime':'1h', 'limit-bytes-total':'1048576' } });
  await assert.rejects(driver.createVoucher({ username:'', password:'x' }), /username is required/);
});

test('voucher revocation only removes a validated RouterOS item id', async () => {
  const transport = fakeTransport({
    '/ip/hotspot/user/print': () => [{ '.id':'*A1', name:'trial01' }]
  });
  const driver = makeDriver(transport);
  assert.deepEqual(await driver.revokeVoucher({ username:'trial01' }), { revoked:true, username:'trial01' });
  assert.deepEqual(transport.calls[1], { path:'/ip/hotspot/user/remove', attributes:{ '=.id':'*A1' } });
});

test('missing voucher returns not-found without removing anything', async () => {
  const transport = fakeTransport();
  const driver = makeDriver(transport);
  assert.deepEqual(await driver.revokeVoucher({ username:'missing' }), { revoked:false, reason:'not-found' });
  assert.equal(transport.calls.length, 1);
});

test('disconnect rejects malformed RouterOS ids', async () => {
  const transport = fakeTransport();
  const driver = makeDriver(transport);
  await assert.rejects(driver.disconnectClient({ id:'not-an-id' }), /Invalid RouterOS item id/);
  assert.equal(transport.calls.length, 0);
});

test('speed profile updates an existing hotspot profile only', async () => {
  const transport = fakeTransport({
    '/ip/hotspot/user/profile/print': [{ '.id':'*B2', name:'1Mbps' }]
  });
  const driver = makeDriver(transport);
  assert.deepEqual(await driver.setSpeedProfile({ name:'1Mbps', rateLimit:'1M/1M' }),
    { updated:true, name:'1Mbps', rateLimit:'1M/1M' });
  assert.deepEqual(transport.calls[1], { path:'/ip/hotspot/user/profile/set',
    attributes:{ '=.id':'*B2', 'rate-limit':'1M/1M' } });
});
