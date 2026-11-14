'use strict';
const $ = id => document.getElementById(id);
const TOKEN_KEY = 'kem_admin_session';
const settings = $('admin-settings');
const lockPanel = $('admin-lock');
function token(){ return sessionStorage.getItem(TOKEN_KEY) || ''; }
function headers(){ return {'content-type':'application/json','authorization':'Bearer '+token()}; }
async function request(url, options = {}) {
  const response = await fetch(url, {...options, headers:{...headers(), ...(options.headers || {})}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ombi limeshindikana');
  return data;
}
function showLocked(message='') {
  settings.hidden = true;
  lockPanel.hidden = false;
  $('status').textContent = message;
}
function showAdmin() {
  lockPanel.hidden = true;
  settings.hidden = false;
}
async function loadSettings() {
  const data = await request('/api/admin/settings');
  const payment = data.payment || {};
  $('lipa').value = payment.airtelLipaNumber || '';
  $('business-number').value = payment.businessNumber || '';
  $('recipient').value = payment.recipientName || '';
  $('instructions').value = payment.instructions || '';
  document.querySelectorAll('#methods input').forEach(input => {
    input.checked = (payment.enabledMethods || []).includes(input.value);
  });
  $('plans').value = JSON.stringify(data.plans || {}, null, 2);
  $('status').textContent = 'Mipangilio imefunguliwa kwa ruhusa ya mmiliki.';
}
$('unlock').addEventListener('click', async () => {
  const pin = $('pin').value.trim();
  if (!/^\d{6}$/.test(pin)) { $('status').textContent = 'PIN iwe na tarakimu 6.'; return; }
  $('unlock').disabled = true;
  try {
    const response = await fetch('/api/admin/login', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({pin})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'PIN haijakubaliwa');
    sessionStorage.setItem(TOKEN_KEY, data.token);
    $('pin').value = '';
    await loadSettings();
    showAdmin();
  } catch (error) {
    sessionStorage.removeItem(TOKEN_KEY);
    showLocked(error.message);
  } finally { $('unlock').disabled = false; }
});
$('reload').addEventListener('click', async () => {
  try { await loadSettings(); } catch (error) { sessionStorage.removeItem(TOKEN_KEY); showLocked(error.message); }
});
$('lock').addEventListener('click', async () => {
  try { if (token()) await request('/api/admin/logout', {method:'POST'}); }
  catch (_) { /* Always clear this browser session locally. */ }
  sessionStorage.removeItem(TOKEN_KEY);
  showLocked('Umetoka. Admin imefungwa.');
});
$('add-plan').addEventListener('click', () => {
  try {
    const plans = JSON.parse($('plans').value || '{}');
    const ids = Object.keys(plans);
    if (ids.length >= 100) throw new Error('Umefikia kiwango cha juu cha vifurushi 100.');
    let n = 1;
    while (plans['custom_' + n]) n++;
    const id = 'custom_' + n;
    plans[id] = {
      name: 'Kifurushi kipya ' + n,
      speedMbps: 5,
      devices: 1,
      price: { day: 500, week: 1500, month: 5000 },
      data: { day: 1, week: 5, month: 10 }
    };
    $('plans').value = JSON.stringify(plans, null, 2);
    $('status').textContent = 'Kifurushi kimeongezwa kwenye orodha. Badilisha jina, bei na GB kisha bonyeza Hifadhi mipangilio.';
  } catch (error) { $('status').textContent = 'Hitilafu: ' + error.message; }
});
$('save').addEventListener('click', async () => {
  try {
    const plans = JSON.parse($('plans').value);
    const enabledMethods = [...document.querySelectorAll('#methods input:checked')].map(input => input.value);
    const body = {
      payment:{
        airtelLipaNumber:$('lipa').value,
        businessNumber:$('business-number').value,
        recipientName:$('recipient').value,
        instructions:$('instructions').value,
        enabledMethods
      },
      plans
    };
    const result = await request('/api/admin/settings', {method:'PUT', body:JSON.stringify(body)});
    $('status').textContent = result.message || 'Mipangilio imehifadhiwa.';
  } catch (error) { $('status').textContent = 'Hitilafu: ' + error.message; }
});
(async () => {
  if (!token()) return showLocked();
  try { await loadSettings(); showAdmin(); }
  catch (error) { sessionStorage.removeItem(TOKEN_KEY); showLocked('Session imeisha. Ingiza PIN tena.'); }
})();
