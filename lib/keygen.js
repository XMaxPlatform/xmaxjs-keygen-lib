'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/** @module Keygen */

var assert = require('assert');

var _require = require('xmaxjs-ecc'),
    PrivateKey = _require.PrivateKey;

var validate = require('./validate');

module.exports = {
  generateMasterKeys: generateMasterKeys,
  authsByPath: authsByPath,
  deriveKeys: deriveKeys

  /**
    New accounts will call this to create a new keyset..
  
    A password manager or backup should save (at the very minimum) the returned
    {masterPrivateKey} for later login.  The owner and active can be re-created
    from the masterPrivateKey.  It is still a good idea to save all information
    in the backup for easy reference.
  
    @arg {masterPrivateKey} [masterPrivateKey = null] When null, a new random key
    is created.
  
    @return {Promise<object>} masterKeys
  
    @example
  masterKeys = {
    masterPrivateKey, // <= place in a password input field (password manager)
    privateKeys: {owner, active}, // <= derived from masterPrivateKey
    publicKeys: {owner, active} // <= derived from masterPrivateKey
  }
  */
};function generateMasterKeys() {
  var masterPrivateKey = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

  var master = void 0;
  if (masterPrivateKey == null) {
    master = PrivateKey.randomKey();
  } else {
    assert(validate.isMasterKey(masterPrivateKey), 'masterPrivateKey');
    master = PrivateKey(masterPrivateKey.substring('PW'.length));
  }

  return Promise.resolve(master).then(function (master) {
    var ownerPrivate = master.getChildKey('owner');
    var activePrivate = ownerPrivate.getChildKey('active');

    return {
      masterPrivateKey: 'PW' + master.toWif(),
      privateKeys: {
        owner: ownerPrivate.toWif(),
        active: activePrivate.toWif()
      },
      publicKeys: {
        owner: ownerPrivate.toPublic().toString(),
        active: activePrivate.toPublic().toString()
      }
    };
  });
}

/** @typedef {Object<keyPath, auth>} keyPathAuth */

/**
  @private

  Recursively create keyPath using the parent links in the blockchain
  account's permission object.  Under this keyPath, store the full
  required_auth structure for later inspection.

  @arg {accountPermissions}
  @return {object<keyPathAuth>}
*/
function authsByPath(accountPermissions) {
  assert(Array.isArray(accountPermissions), 'accountPermissions is an array');
  accountPermissions.forEach(function (perm) {
    return assert.equal(typeof perm === 'undefined' ? 'undefined' : _typeof(perm), 'object', 'accountPermissions is an array of objects');
  });

  var byName = {}; // Index by permission name
  accountPermissions.forEach(function (perm) {
    byName[perm.perm_name] = perm;
  });

  function parentPath(perm) {
    var stack = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

    stack.push(perm.parent);
    var parent = byName[perm.parent];
    if (parent) {
      return parentPath(parent, stack);
    }
    return stack;
  }

  var auths = {};
  accountPermissions.forEach(function (perm) {
    if (perm.parent === '') {
      auths[perm.perm_name] = perm.required_auth;
    } else {
      var pathStr = parentPath(perm).reverse().join('/');
      if (pathStr.charAt(0) === '/') {
        pathStr = pathStr.substring(1);
      }
      pathStr = pathStr + '/' + perm.perm_name;
      if (pathStr.indexOf('owner/active/') === 0) {
        // active is always a child of owner
        pathStr = pathStr.substring('owner/'.length);
      } else if (pathStr === 'owner/active') {
        // owner is implied, juse use active
        pathStr = 'active';
      }
      auths[pathStr] = perm.required_auth;
    }
  });

  return auths;
}

/**
  @private see keystore.deriveKeys

  Derive missing intermediate keys and paths for the given path.

  @return {Array} [{path, privateKey}] newly derived keys or empty array (keys already
  exist or can't be derived).
*/
function deriveKeys(path, wifsByPath) {
  validate.path(path);
  assert.equal(typeof wifsByPath === 'undefined' ? 'undefined' : _typeof(wifsByPath), 'object', 'wifsByPath');

  if (wifsByPath[path]) {
    return [];
  }

  var maxLen = 0;
  var bestPath = 0;

  var paths = Object.keys(wifsByPath);
  for (var wifPath in wifsByPath) {
    if (path.indexOf(wifPath + '/') === 0) {
      if (wifPath.length > maxLen) {
        maxLen = wifPath.length;
        bestPath = wifPath;
      }
    }
  }

  if (!bestPath) {
    return [];
  }

  var newKeys = [];
  var extendedPath = bestPath;
  var wif = wifsByPath[bestPath];
  assert(!!wif, 'wif');
  var extendedPrivate = PrivateKey(wif);
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = path.substring(bestPath.length + '/'.length).split('/')[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var extend = _step.value;

      extendedPrivate = extendedPrivate.getChildKey(extend);
      extendedPath += '/' + extend;
      newKeys.push({
        path: extendedPath,
        privateKey: extendedPrivate
      });
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  return newKeys;
}