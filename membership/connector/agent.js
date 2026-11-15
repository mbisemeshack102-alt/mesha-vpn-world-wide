'use strict';

// Minimal outbound-only Site Connector bootstrap agent.
// Router transport and command execution are intentionally not enabled yet.
const fs = require('node:fs');
const path = require('node:path');

const apiBase = String(process.env.WIFI_MANAGER_API_URL || '').replace(/\/$/, '');
const tokenFile = path.resolve(process.env.WIFI_MANAGER_TOKEN_FILE || './data/connector-token.json');
const enrollmentToken = process.env.WIFI_MANAGER_ENROLLMENT_TOKEN || '';
const allowLocalHttp = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiBase);

if (!apiBase || (!apiBase.startsWith('https://') && !allowLocalHttp)) {
  throw new Error('WIFI_MANAGER_API_URL must use HTTPS (HTTP is allowed only for localhost testing).');
}

async function request(route, { token, body } = {}) {
  const response = await fetch(apiBase + route, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Management API request failed: ' + response.status);
  return data;
}

function readSavedToken() {
  try {
    const saved = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    return typeof saved.token === 'string' && saved.token.length >= 40 ? saved.token : '';
  } catch {
    return '';
  }
}
function saveToken(token, connectorId) {
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(tokenFile, JSON.stringify({ token, connectorId, savedAt: new Date().toISOString() }) + '\n',
    { mode: 0o600, flag: 'w' });
  try { fs.chmodSync(tokenFile, 0o600); } catch {}
}
async function getToken() {
  const saved = readSavedToken();
  if (saved) return saved;
  if (!enrollmentToken) throw new Error('No saved connector token. Set WIFI_MANAGER_ENROLLMENT_TOKEN for first enrollment.');
  const enrolled = await request('/api/site-connectors/enroll', { body: { enrollmentToken } });
  saveToken(enrolled.token, enrolled.connectorId);
  return enrolled.token;
}
async function main() {
  const token = await getToken();
  console.log('Site Connector enrolled. Starting outbound heartbeat; router control is not enabled yet.');
  let delay = 5000;
  while (true) {
    try {
      const result = await request('/api/site-connectors/heartbeat', { token });
      console.log('Heartbeat OK:', result.connectorId, result.serverTime);
      delay = 30000;
    } catch (error) {
      console.error('Heartbeat failed:', error.message);
      delay = Math.min(Math.max(delay * 2, 5000), 120000);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
main().catch(error => {
  console.error('Site Connector stopped:', error.message);
  process.exitCode = 1;
});
