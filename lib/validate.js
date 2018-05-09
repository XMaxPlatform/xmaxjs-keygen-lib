'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var assert = require('assert');

var _require = require('xmaxjs-ecc'),
    PrivateKey = _require.PrivateKey,
    PublicKey = _require.PublicKey;

module.exports = {
  keyType: keyType,
  path: path,
  isPath: isPath,
  isMasterKey: isMasterKey
};

function isMasterKey(key) {
  return (/^PW/.test(key) && PrivateKey.validWif(key.substring(2))
  );
}

function keyType(key) {
  return isMasterKey(key) ? 'master' : PrivateKey.validWif(key) ? 'wif' : PrivateKey.isValid(key) ? 'privateKey' : PublicKey.isValid(key) ? 'pubkey' : null;
}

function isPath(txt) {
  try {
    path(txt);
    return true;
  } catch (e) {
    return false;
  }
}

/**
  Static validation of a keyPath.  Protect against common mistakes.
  @see [validate.test.js](./validate.test.js)

  @arg {keyPath} path

  @example path('owner')
  @example path('active')
  @example path('active/mypermission')
*/
function path(path) {
  assert.equal(typeof path === 'undefined' ? 'undefined' : _typeof(path), 'string', 'path');
  assert(path !== '', 'path should not be empty');
  assert(path.indexOf(' ') === -1, 'remove spaces');
  assert(path.indexOf('\\') === -1, 'use forward slash');
  assert(path[0] !== '/', 'remove leading slash');
  assert(path[path.length - 1] !== '/', 'remove ending slash');
  assert(!/[A-Z]/.test(path), 'path should not have uppercase letters');

  assert(path !== 'owner/active', 'owner is implied, juse use active');

  var el = Array.from(path.split('/'));

  var unique = new Set();
  el.forEach(function (e) {
    unique.add(e);
  });
  assert(unique.size === el.length, 'duplicate path element');

  assert(el[0] === 'owner' || el[0] === 'active', 'path should start with owner or active');

  assert(!el.includes('owner') || el.indexOf('owner') === 0, 'owner is always first');

  assert(!el.includes('active') || el.indexOf('active') === 0, 'active is always first');
}