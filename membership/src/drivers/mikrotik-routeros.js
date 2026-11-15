'use strict';

// MikroTik RouterOS driver. Network access is supplied by the local site connector.
// transport.command(path, attributes) must execute one RouterOS API command and
// return an array of RouterOS attribute objects. Never expose this transport to browsers.

function requiredString(value, name, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(name + ' is required and must be at most ' + max + ' characters.');
  }
  return value.trim();
}
function safeRouterId(value) {
  const id = requiredString(value, 'RouterOS item id', 64);
  if (!/^\*[0-9A-Fa-f]+$/.test(id)) throw new TypeError('Invalid RouterOS item id.');
  return id;
}
function makeDriver(transport) {
  if (!transport || typeof transport.command !== 'function') {
    throw new TypeError('A trusted RouterOS site-connector transport is required.');
  }
  async function command(path, attributes = {}) {
    const result = await transport.command(path, attributes);
    return Array.isArray(result) ? result : [];
  }
  async function findOne(path, key, value) {
    const rows = await command(path, { ['?' + key]: value });
    return rows[0] || null;
  }
  return Object.freeze({
    async testConnection() {
      const rows = await command('/system/resource/print');
      return { ok: rows.length > 0, device: rows[0] || null };
    },
    async getStatus() {
      const rows = await command('/system/resource/print');
      const resource = rows[0] || {};
      return { connected: rows.length > 0, boardName: resource['board-name'] || null,
        version: resource.version || null, uptime: resource.uptime || null };
    },
    async listClients() {
      return command('/ip/hotspot/active/print');
    },
    async createVoucher(input = {}) {
      const name = requiredString(input.username, 'Voucher username', 64);
      const password = requiredString(input.password, 'Voucher password', 128);
      const profile = input.profile == null ? 'default' : requiredString(input.profile, 'Hotspot profile', 64);
      const attrs = { name, password, profile };
      if (input.limitUptime != null) attrs['limit-uptime'] = requiredString(input.limitUptime, 'Usage time limit', 32);
      if (input.limitBytesTotal != null) {
        const bytes = Number(input.limitBytesTotal);
        if (!Number.isSafeInteger(bytes) || bytes < 1) throw new TypeError('limitBytesTotal must be a positive safe integer.');
        attrs['limit-bytes-total'] = String(bytes);
      }
      await command('/ip/hotspot/user/add', attrs);
      return { created: true, username: name, profile };
    },
    async revokeVoucher(input = {}) {
      const username = requiredString(input.username, 'Voucher username', 64);
      const user = await findOne('/ip/hotspot/user/print', 'name', username);
      if (!user || !user['.id']) return { revoked: false, reason: 'not-found' };
      await command('/ip/hotspot/user/remove', { '=.id': safeRouterId(user['.id']) });
      return { revoked: true, username };
    },
    async disconnectClient(input = {}) {
      const id = safeRouterId(input.id);
      await command('/ip/hotspot/active/remove', { '=.id': id });
      return { disconnected: true, id };
    },
    async setSpeedProfile(input = {}) {
      const name = requiredString(input.name, 'Hotspot profile name', 64);
      const rateLimit = requiredString(input.rateLimit, 'RouterOS rate-limit', 64);
      const profile = await findOne('/ip/hotspot/user/profile/print', 'name', name);
      if (!profile || !profile['.id']) return { updated: false, reason: 'profile-not-found' };
      await command('/ip/hotspot/user/profile/set', { '=.id': safeRouterId(profile['.id']), 'rate-limit': rateLimit });
      return { updated: true, name, rateLimit };
    },
    async getUsage(input = {}) {
      const username = requiredString(input.username, 'Voucher username', 64);
      const rows = await command('/ip/hotspot/user/print', { '?name': username });
      const user = rows[0];
      if (!user) return null;
      return { username, bytesIn: Number(user['bytes-in'] || 0), bytesOut: Number(user['bytes-out'] || 0),
        uptime: user.uptime || null, limitBytesTotal: Number(user['limit-bytes-total'] || 0) };
    }
  });
}
function registerMikrotikDriver(transport) {
  const driver = makeDriver(transport);
  const registry = require('../router-adapters');
  registry.registerDriver('mikrotik-routeros', driver);
  return driver;
}

module.exports = { makeDriver, registerMikrotikDriver };
