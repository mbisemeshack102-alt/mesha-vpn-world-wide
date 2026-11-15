'use strict';

const network = document.getElementById('network');
const api = document.getElementById('api');
const details = document.getElementById('details');
const button = document.getElementById('check');

function setStatus(element, message, kind) {
  element.textContent = message;
  element.className = 'status ' + kind;
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  setStatus(
    network,
    online ? 'Simu inaonyesha iko online' : 'Simu inaonyesha haina mtandao',
    online ? 'ok' : 'bad'
  );
}

async function runCheck() {
  button.disabled = true;
  updateNetworkStatus();
  setStatus(api, 'Inajaribu kufikia API...', 'wait');
  details.textContent = 'Subiri kidogo...';

  try {
    const response = await fetch('/health', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error('HTTP ' + response.status);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Jibu la /health si JSON. Hakikisha ukurasa umefunguliwa kutoka server ya KEM VPN.');
    }

    const data = await response.json();
    if (!data.ok) throw new Error('API haijarudisha hali ya OK');

    setStatus(api, 'API ya KEM VPN inapatikana', 'ok');
    details.textContent =
      'Huduma: ' + (data.service || 'KEM VPN') +
      '. Jaribio hili linathibitisha ufikivu wa API tu, si muunganisho wa WireGuard.';
  } catch (error) {
    setStatus(api, 'API haijafikiwa', 'bad');
    details.textContent =
      'Sababu: ' + error.message +
      '. Hakikisha backend imewashwa na ukurasa umefunguliwa kupitia HTTPS ya server hiyo hiyo.';
  } finally {
    button.disabled = false;
  }
}

button.addEventListener('click', runCheck);
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();
runCheck();