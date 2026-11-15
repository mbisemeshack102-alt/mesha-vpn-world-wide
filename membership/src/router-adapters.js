'use strict';

// Vendor-neutral router integration registry. A listed adapter is not a live driver.
const { validateDriver, getSupportedOperations } = require('./router-driver-contract');

const BUILTIN_ADAPTERS = Object.freeze([
 { id:'mikrotik-routeros', label:'MikroTik RouterOS', connection:'site-connector', methods:['routeros-api'], capabilities:['hotspot-users','vouchers','speed-profiles','active-sessions','disconnect','usage-counters'], status:'planned', note:'Requires a tested RouterOS driver and restricted API account.' },
 { id:'openwrt', label:'OpenWrt', connection:'site-connector', methods:['ubus-rpc','hostapd','radius'], capabilities:['clients','access-control','speed-profiles','usage-counters'], status:'planned', note:'Depends on installed packages and exact OpenWrt release.' },
 { id:'radius', label:'RADIUS-compatible router or access point', connection:'radius-server', methods:['radius'], capabilities:['authentication','accounting','session-limits','time-limits','data-limits'], status:'planned', note:'Hardware must support external RADIUS authentication and accounting.' },
 { id:'unifi', label:'Ubiquiti UniFi', connection:'vendor-controller', methods:['controller-api','radius'], capabilities:['guest-access','vouchers','clients','session-control'], status:'planned', note:'Requires a compatible UniFi Network controller and tested API version.' },
 { id:'omada', label:'TP-Link Omada', connection:'vendor-controller', methods:['controller-api','radius'], capabilities:['guest-access','vouchers','clients','session-control'], status:'planned', note:'Requires a compatible Omada controller and tested API version.' },
 { id:'generic-captive-portal', label:'Other router with captive portal', connection:'external-portal', methods:['captive-portal','radius'], capabilities:['login-redirect','voucher-redemption'], status:'planned', note:'Requires a documented portal integration or RADIUS support.' },
 { id:'manual', label:'Basic router (manual mode)', connection:'manual', methods:['manual'], capabilities:['package-display','payment-records','voucher-list'], status:'available', note:'Records sales and vouchers; cannot automatically enforce access or speed.' }
]);
const drivers = new Map();
function listAdapters() {
  return BUILTIN_ADAPTERS.map(adapter => {
    const driver = drivers.get(adapter.id);
    return { ...adapter, methods:[...adapter.methods], capabilities:[...adapter.capabilities],
      driverLoaded:Boolean(driver), supportedOperations:getSupportedOperations(driver) };
  });
}
function getAdapter(id) {
  const adapter = BUILTIN_ADAPTERS.find(item => item.id === id);
  return adapter ? { ...adapter, methods:[...adapter.methods], capabilities:[...adapter.capabilities] } : null;
}
function registerDriver(id, driver) {
  if (!getAdapter(id)) throw new Error('Unknown router adapter: ' + id);
  validateDriver(driver);
  if (drivers.has(id)) throw new Error('Router driver already registered: ' + id);
  drivers.set(id, driver);
}
function getDriver(id) { return drivers.get(id) || null; }
function getIntegrationStatus(id) {
  const adapter = getAdapter(id);
  if (!adapter) return null;
  const driver = getDriver(id);
  return { ...adapter, driverLoaded:Boolean(driver), supportedOperations:getSupportedOperations(driver),
    ready:Boolean(driver) && adapter.status === 'available' };
}
module.exports = { listAdapters, getAdapter, registerDriver, getDriver, getIntegrationStatus };
