'use strict';

// Shared contract for vendor-specific router drivers.
// This module validates interfaces only; it does not connect to or control hardware.
const REQUIRED_METHODS = Object.freeze(['testConnection', 'getStatus']);
const OPTIONAL_METHODS = Object.freeze([
  'listClients',
  'createVoucher',
  'revokeVoucher',
  'disconnectClient',
  'setSpeedProfile',
  'getUsage'
]);

function validateDriver(driver) {
  if (!driver || typeof driver !== 'object') {
    throw new TypeError('Router driver object required.');
  }
  const missing = REQUIRED_METHODS.filter(name => typeof driver[name] !== 'function');
  if (missing.length) {
    throw new TypeError('Router driver is missing required method(s): ' + missing.join(', '));
  }
  return {
    valid: true,
    requiredMethods: [...REQUIRED_METHODS],
    supportedOperations: OPTIONAL_METHODS.filter(name => typeof driver[name] === 'function')
  };
}

function getSupportedOperations(driver) {
  return OPTIONAL_METHODS.filter(name => driver && typeof driver[name] === 'function');
}

async function callDriver(driver, operation, input = {}) {
  if (!OPTIONAL_METHODS.includes(operation) && !REQUIRED_METHODS.includes(operation)) {
    throw new Error('Unsupported router operation: ' + operation);
  }
  if (!driver || typeof driver[operation] !== 'function') {
    throw new Error('Router driver does not implement: ' + operation);
  }
  return driver[operation](input);
}

module.exports = { REQUIRED_METHODS, OPTIONAL_METHODS, validateDriver, getSupportedOperations, callDriver };
