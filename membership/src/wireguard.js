'use strict';
const { execFileSync, spawnSync } = require('node:child_process');
const QRCode = require('qrcode');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is not configured');
  return value;
}
function validateConfig() {
  const iface = required('WIREGUARD_INTERFACE');
  const endpoint = required('WIREGUARD_ENDPOINT');
  const serverPublicKey = required('WIREGUARD_SERVER_PUBLIC_KEY');
  const cidr = required('WIREGUARD_CLIENT_CIDR');
  if (!/^[a-zA-Z0-9_=.-]{1,15}$/.test(iface)) throw new Error('Invalid WireGuard interface name');
  if (!/^(\[[0-9a-f:]+\]|[a-zA-Z0-9.-]+):[0-9]{1,5}$/.test(endpoint)) throw new Error('WIREGUARD_ENDPOINT must be host:port');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(serverPublicKey)) throw new Error('Invalid WireGuard server public key');
  const match = cidr.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!match || Number(match[2]) !== 24) throw new Error('WIREGUARD_CLIENT_CIDR must be an IPv4 /24 network');
  const octets = match[1].split('.').map(Number);
  if (octets.some(n => n > 255) || octets[0] === 0 || octets[0] >= 224) throw new Error('Invalid client subnet');
  const base = octets[0] * 16777216 + octets[1] * 65536 + octets[2] * 256 + octets[3];
  const keepalive = Number(process.env.WIREGUARD_KEEPALIVE || 25);
  if (!Number.isInteger(keepalive) || keepalive < 0 || keepalive > 120) throw new Error('WIREGUARD_KEEPALIVE must be 0–120');
  return { iface, endpoint, serverPublicKey, network: base & 0xffffff00,
    dns: process.env.WIREGUARD_CLIENT_DNS || '1.1.1.1, 1.0.0.1',
    allowedIps: process.env.WIREGUARD_CLIENT_ALLOWED_IPS || '0.0.0.0/0',
    keepalive: String(keepalive) };
}
function ipv4(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
function nextAddress(db, network) {
  const used = new Set(db.prepare('SELECT client_address FROM wireguard_peers').all().map(row => row.client_address));
  for (let host = 2; host <= 254; host++) {
    const address = ipv4(network + host);
    if (!used.has(address)) return address;
  }
  throw new Error('WireGuard client address pool is full');
}
function runWg(args) {
  return execFileSync('wg', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 }).trim();
}
function provisionPeer(db, userId, orderId, seal) {
  const existing = db.prepare('SELECT * FROM wireguard_peers WHERE order_id=? AND revoked_at IS NULL').get(orderId);
  if (existing) return existing;
  const cfg = validateConfig();
  const sub = db.prepare(`SELECT s.id,s.expires_at,s.status FROM subscriptions s
    JOIN orders o ON o.user_id=s.user_id AND o.paid_at=s.starts_at
    WHERE o.id=? AND s.user_id=? ORDER BY s.id DESC LIMIT 1`).get(orderId, userId);
  if (!sub || sub.status !== 'active' || sub.expires_at <= new Date().toISOString()) {
    throw new Error('Active subscription not found for WireGuard provisioning');
  }
  const privateKey = runWg(['genkey']);
  const pub = spawnSync('wg', ['pubkey'], { input: privateKey + '\n', encoding: 'utf8', timeout: 10000 });
  if (pub.status !== 0 || !pub.stdout.trim()) throw new Error('Could not derive WireGuard public key');
  const publicKey = pub.stdout.trim();
  const address = nextAddress(db, cfg.network);
  runWg(['set', cfg.iface, 'peer', publicKey, 'allowed-ips', address + '/32', 'persistent-keepalive', cfg.keepalive]);
  const createdAt = new Date().toISOString();
  try {
    const result = db.prepare(`INSERT INTO wireguard_peers
      (user_id,subscription_id,order_id,public_key,private_key_ciphertext,client_address,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(userId, sub.id, orderId, publicKey, seal(privateKey), address, createdAt);
    return { id: Number(result.lastInsertRowid), user_id: userId, subscription_id: sub.id,
      order_id: orderId, public_key: publicKey, client_address: address, created_at: createdAt, revoked_at: null };
  } catch (error) {
    try { runWg(['set', cfg.iface, 'peer', publicKey, 'remove']); } catch {}
    throw error;
  }
}
function removePeer(db, peer) {
  if (peer.revoked_at) return false;
  const cfg = validateConfig();
  runWg(['set', cfg.iface, 'peer', peer.public_key, 'remove']);
  db.prepare('UPDATE wireguard_peers SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
    .run(new Date().toISOString(), peer.id);
  return true;
}
async function clientConfig(db, userId, unseal) {
  const sub = db.prepare(`SELECT id FROM subscriptions WHERE user_id=? AND status='active' AND expires_at>?
    ORDER BY expires_at DESC LIMIT 1`).get(userId, new Date().toISOString());
  if (!sub) return null;
  const peer = db.prepare(`SELECT * FROM wireguard_peers WHERE user_id=? AND subscription_id=? AND revoked_at IS NULL`)
    .get(userId, sub.id);
  if (!peer) return null;
  const cfg = validateConfig();
  const text = ['[Interface]', 'PrivateKey = ' + unseal(peer.private_key_ciphertext),
    'Address = ' + peer.client_address + '/32', 'DNS = ' + cfg.dns, '', '[Peer]',
    'PublicKey = ' + cfg.serverPublicKey, 'Endpoint = ' + cfg.endpoint,
    'AllowedIPs = ' + cfg.allowedIps, 'PersistentKeepalive = ' + cfg.keepalive, ''].join('\n');
  return { config: text, qrDataUrl: await QRCode.toDataURL(text, { width: 360, margin: 1 }), address: peer.client_address };
}
module.exports = { validateConfig, provisionPeer, removePeer, clientConfig };
