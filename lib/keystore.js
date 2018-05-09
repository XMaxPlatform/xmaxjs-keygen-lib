'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/** @module Keystore */

var assert = require('assert');

var _require = require('xmaxjs-ecc'),
    PrivateKey = _require.PrivateKey,
    Signature = _require.Signature;

var ecc = require('xmaxjs-ecc');
var minimatch = require('minimatch');

var Keygen = require('./keygen');
var UriRules = require('./uri-rules');
var validate = require('./validate');
var globalConfig = require('./config');

var _require2 = require('./config'),
    localStorage = _require2.localStorage;

var userStorage = require('./keypath-utils')('kstor');

module.exports = Keystore;

/**
  Provides private key management and storage and tooling to limit exposure
  of private keys as much as possible.

  Although multiple root keys may be stored, this key store was designed with
  the idea that all keys for a given `accountName` are derive from a single
  root key (the master private key).

  This keystore does not query the blockchain or any external services.
  Removing keys here does not affect the blockchain.

  @arg {string} accountName - Blockchain account name that will act as the
  container for a key and all derived child keys.

  @arg {object} [config]

  @arg {number} [config.timeoutInMin = 10] - upon timeout, remove keys
  matching timeoutKeyPaths.

  @arg {number} [config.timeoutKeyPaths = ['owner', 'owner/**']] - by default,
  expire only owner and owner derived children.  If the default uriRules are
  used this actually has nothing to delete.

  @arg {uriRules} [config.uriRules] - Specify which type of private key will
  be available on certain pages of the application.  Lock it down as much as
  possible and later re-prompt the user if a key is needed.  Default is to
  allow active (`active`) and all active derived keys (`active/**`) everywhere
  (`.*`).

  @arg {boolean} [keepPublicKeys = true] - Enable for better UX; show users keys they
  have access too without requiring them to login. Logging in brings a
  private key online which is not necessary to see public information.

  The UX should implement this behavior in a way that is clear public keys
  are cached before enabling this feature.
  @example config = {
  uriRules: {
    'active': '.*',
    'active/**': '.*'
  },
  timeoutInMin: 10,
  timeoutKeyPaths: [
    'owner',
    'owner/**'
  ],
  keepPublicKeys: true
}
*/
function Keystore(accountName) {
  var config = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  assert.equal(typeof accountName === 'undefined' ? 'undefined' : _typeof(accountName), 'string', 'accountName');
  assert.equal(typeof config === 'undefined' ? 'undefined' : _typeof(config), 'object', 'config');

  var configDefaults = {
    uriRules: {
      'active': '.*',
      'active/**': '.*'
    },
    timeoutInMin: 10,
    timeoutKeyPaths: ['owner', 'owner/**'],
    keepPublicKeys: true
  };

  config = Object.assign({}, configDefaults, config);

  var uriRules = UriRules(config.uriRules);

  /** @private */
  var state = {};

  var expireAt = void 0,
      expireInterval = void 0;
  var unlistenHistory = void 0;

  // Initialize state from localStorage
  userStorage.query(localStorage, [accountName, 'kpath'], function (_ref, wif) {
    var _ref2 = _slicedToArray(_ref, 2),
        path = _ref2[0],
        pubkey = _ref2[1];

    var storageKey = userStorage.createKey(accountName, 'kpath', path, pubkey);
    state[storageKey] = wif;
  });

  /**
    Login or derive and save private keys.  This may be called from a login
    action.  Keys may be removed as during Uri navigation or when calling
    logout.
      @arg {object} params
    @arg {parentPrivateKey} params.parent - Master password (masterPrivateKey),
    active, owner, or other permission key.
      @arg {Array<keyPathMatcher>} [params.saveKeyMatches] - These private
    keys will be saved to disk. (example: `active`).
      @arg {accountPermissions} [params.accountPermissions] - Permissions object
    from XMax blockchain via get_account.  This is used to validate the parent
    and derive additional permission keys.  This allows this keystore to detect
    incorrect passwords early before trying to sign a transaction.
      See Chain API `get_account => account.permissions`.
      @throws {Error} 'invalid login'
  */
  function deriveKeys(_ref3) {
    var parent = _ref3.parent,
        _ref3$saveKeyMatches = _ref3.saveKeyMatches,
        saveKeyMatches = _ref3$saveKeyMatches === undefined ? [] : _ref3$saveKeyMatches,
        accountPermissions = _ref3.accountPermissions;

    keepAlive();

    assert(parent != null, 'parent is a master password or private key');

    var keyType = validate.keyType(parent);
    assert(/master|wif|privateKey/.test(keyType), 'parentPrivateKey is a masterPrivateKey or private key');

    if (typeof saveKeyMatches === 'string') {
      saveKeyMatches = [saveKeyMatches];
    }

    saveKeyMatches.forEach(function (m) {
      if (minimatch('owner', m)) {
        throw new Error('do not save owner key to disk');
      }
      // if(minimatch('active', m)) {
      //   throw new Error('do not save active key to disk')
      // }
    });

    assert((typeof accountPermissions === 'undefined' ? 'undefined' : _typeof(accountPermissions)) === 'object' || accountPermissions == null, 'accountPermissions is an optional object');

    if (!unlistenHistory) {
      unlistenHistory = globalConfig.history.listen(function () {
        keepAlive();

        // Prevent certain private keys from being available to high-risk pages.
        var paths = getKeyPaths().wif;
        var pathsToPurge = uriRules.check(currentUriPath(), paths).deny;
        removeKeys(pathsToPurge);
      });
    }

    if (!expireInterval) {
      if (config.timeoutInMin != null) {
        var tick = function tick() {
          if (timeUntilExpire() === 0) {
            removeKeys(config.timeoutKeyPaths);
            clearInterval(expireInterval);
            expireInterval = null;
          }
        };

        expireInterval = setInterval(tick, config.timeoutInMin * min);
      }
    }

    // cache
    if (!accountPermissions) {
      var permissions = userStorage.get(localStorage, [accountName, 'permissions']);

      if (permissions) {
        accountPermissions = JSON.parse(permissions);
      }
    }

    // cache pubkey (that is a slow calculation)
    var Keypair = function Keypair(privateKey) {
      return {
        privateKey: privateKey,
        pubkey: privateKey.toPublic().toString()
      };
    };

    // blockchain permission format
    var perm = function perm(parent, perm_name, pubkey) {
      return {
        perm_name: perm_name, parent: parent, required_auth: { keys: [{ key: pubkey }] }
      };
    };

    // Know if this is stubbed in next (don't cache later)
    var isPermissionStub = accountPermissions == null;

    var parentKeys = {};
    if (keyType === 'master') {
      var masterPrivateKey = PrivateKey(parent.substring(2));
      parentKeys.owner = Keypair(masterPrivateKey.getChildKey('owner'));
      parentKeys.active = Keypair(parentKeys.owner.privateKey.getChildKey('active'));
      if (!accountPermissions) {
        accountPermissions = [perm('owner', 'active', parentKeys.active.pubkey), perm('', 'owner', parentKeys.owner.pubkey)];
      }
    } else {
      if (accountPermissions) {
        // unknown for now..
        parentKeys.other = Keypair(PrivateKey(parent));
      } else {
        parentKeys.active = Keypair(PrivateKey(parent));
        accountPermissions = [perm('owner', 'active', parentKeys.active.pubkey)];
      }
    }

    assert(accountPermissions, 'accountPermissions is required at this point');

    var authsByPath = Keygen.authsByPath(accountPermissions);

    // Don't allow key re-use
    function uniqueKeyByRole(role) {
      var auth = authsByPath[role];
      if (auth == null) {
        return;
      }
      auth.keys.forEach(function (rolePub) {
        var _loop = function _loop(other) {
          if (other === role) {
            return 'continue';
          }
          authsByPath[other].keys.forEach(function (otherPub) {
            if (otherPub.key === rolePub.key) {
              throw new Error(role + ' key reused in authority: ' + other);
            }
          });
        };

        for (var other in authsByPath) {
          var _ret = _loop(other);

          if (_ret === 'continue') continue;
        }
      });
    }
    uniqueKeyByRole('active');
    uniqueKeyByRole('owner');

    if (!isPermissionStub) {
      // cache
      userStorage.save(localStorage, [accountName, 'permissions'], JSON.stringify(accountPermissions), { immutable: false });
    }

    var keyUpdates = [],
        allow = false;

    // check existing keys..
    for (var path in authsByPath) {
      var auth = authsByPath[path];

      var _loop2 = function _loop2(parentPath) {
        var parentKey = parentKeys[parentPath]; // owner, active, other
        if (auth.keys.find(function (k) {
          return k.key === parentKey.pubkey;
        }) != null) {
          keyUpdates.push({ path: path, privateKey: parentKey.privateKey });
        }
      };

      for (var parentPath in parentKeys) {
        _loop2(parentPath);
      }
    }

    if (keyUpdates.length === 0) {
      throw new Error('invalid login');
    }

    // Sync keyUpdates with storage ..
    function saveKeyUpdates() {
      // sort key updates so removeKeys will only remove children
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        var _loop3 = function _loop3() {
          var _step$value = _step.value,
              path = _step$value.path,
              privateKey = _step$value.privateKey;

          var disk = saveKeyMatches.find(function (m) {
            return minimatch(path, m);
          }) != null;
          var update = addKey(path, privateKey, disk);
          if (update) {
            allow = true;
            if (update.dirty) {
              // blockchain key changed
              // remove so these will be re-derived
              var children = getKeys(path + '/**').map(function (k) {
                return k.path;
              });
              removeKeys(children, false /*keepPublicKeys*/);
            }
          }
        };

        for (var _iterator = keyUpdates.sort()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          _loop3();
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
    }

    saveKeyUpdates();

    // Gather up all known keys then derive children
    var wifsByPath = {};

    // After saveKeyUpdates, fetch the remaining allowed and valid private keys
    getKeys().filter(function (k) {
      return !!k.wif;
    }).forEach(function (k) {
      // getKeys => {path, pubkey, wif}
      wifsByPath[k.path] = k.wif;
    });

    // Combine existing keys in the keystore with any higher permission keys
    // in wifsByPath that may not exist after this function call.
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = keyUpdates[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var _step2$value = _step2.value,
            _path2 = _step2$value.path,
            privateKey = _step2$value.privateKey;

        if (!wifsByPath[_path2]) {
          // These more secure keys could be used to derive less secure
          // child keys below.
          wifsByPath[_path2] = privateKey.toWif();
        }
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2.return) {
          _iterator2.return();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }

    keyUpdates = [];

    // Use all known keys in wifsByPath to derive all known children.

    // Why?  As the user navigates any parent could get removed but the child
    // could still be allowed.  Good thing we saved the children while we could.
    for (var _path in authsByPath) {
      if (!wifsByPath[_path]) {
        var keys = Keygen.deriveKeys(_path, wifsByPath);
        if (keys.length) {
          var authorizedKeys = authsByPath[_path].keys.map(function (k) {
            return k.key;
          });
          var _iteratorNormalCompletion3 = true;
          var _didIteratorError3 = false;
          var _iteratorError3 = undefined;

          try {
            var _loop4 = function _loop4() {
              var key = _step3.value;
              // {path, privateKey}
              var pubkey = key.privateKey.toPublic().toString();
              var inAuth = !!authorizedKeys.find(function (k) {
                return k === pubkey;
              });
              if (inAuth) {
                // if user did not change this key
                wifsByPath[key.path] = key.privateKey.toWif();
                keyUpdates.push(key);
              }
            };

            for (var _iterator3 = keys[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
              _loop4();
            }
          } catch (err) {
            _didIteratorError3 = true;
            _iteratorError3 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion3 && _iterator3.return) {
                _iterator3.return();
              }
            } finally {
              if (_didIteratorError3) {
                throw _iteratorError3;
              }
            }
          }
        }
      }
    }

    // save allowed children
    saveKeyUpdates();
    keyUpdates = [];

    if (!allow) {
      // uri rules blocked every key
      throw new Error('invalid login for page');
    }
  }

  /**
    @private see: keystore.deriveKeys
      Save a private or public key to the store in either RAM only or RAM and
    disk.  Typically deriveKeys is used instead.
      @arg {keyPath} path - active/mypermission, owner, active, ..
    @arg {string} key - wif, pubkey, or privateKey
    @arg {boolean} toDisk - save to persistent storage (localStorage)
      @throws {AssertionError} path error or active, owner/* toDisk save attempted
      @return {object} {[wif], pubkey, dirty} or null (denied by uriRules)
  */
  function addKey(path, key) {
    var toDisk = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

    validate.path(path);
    keepAlive();

    var keyType = validate.keyType(key);
    assert(/^wif|pubkey|privateKey$/.test(keyType), 'key should be a wif, public key string, or privateKey object');

    if (toDisk) {
      assert(path !== 'owner', 'owner key should not be stored on disk');
      assert(path.indexOf('owner/') !== 0, 'owner derived keys should not be stored on disk');

      // assert(path !== 'active', 'active key should not be stored on disk')
    }

    if (uriRules.deny(currentUriPath(), path).length) {
      // console.log('Keystore addKey denied: ', currentUriPath(), path);
      return null;
    }

    var wif = keyType === 'wif' ? key : keyType === 'privateKey' ? ecc.PrivateKey(key).toWif() : null;

    var pubkey = keyType === 'pubkey' ? ecc.PublicKey(key).toString() : keyType === 'privateKey' ? key.toPublic().toString() : ecc.privateToPublic(wif);

    assert(!!pubkey, 'pubkey');

    var storageKey = userStorage.createKey(accountName, 'kpath', path, pubkey);

    var dirty = userStorage.save(state, storageKey, wif, { clobber: false });

    if (toDisk) {
      var saved = userStorage.save(localStorage, storageKey, wif, { clobber: false });
      dirty = dirty || saved;
    }

    return wif == null ? { pubkey: pubkey, dirty: dirty } : { wif: wif, pubkey: pubkey, dirty: dirty };
  }

  /**
    Return paths for all available keys.  Empty array is used if there are
    no keys.
      @return {object} {pubkey: Array<pubkey>, wif: Array<wif>}
  */
  function getKeyPaths() {
    keepAlive();

    var pubs = new Set();
    var wifs = new Set();

    function query(store) {
      userStorage.query(store, [accountName, 'kpath'], function (_ref4, wif) {
        var _ref5 = _slicedToArray(_ref4, 2),
            path = _ref5[0],
            pubkey = _ref5[1];

        pubs.add(path);
        if (wif != null) {
          wifs.add(path);
        }
      });
    }
    query(state);
    query(localStorage);

    return { pubkey: Array.from(pubs), wif: Array.from(wifs) };
  }

  /**
    Fetch or derive a public key.
      @arg {keyPath}
    @return {pubkey} or null
  */
  function getPublicKey(path) {
    validate.path(path);

    var _getKeys = getKeys(path),
        _getKeys2 = _slicedToArray(_getKeys, 1),
        key = _getKeys2[0];

    return key ? key.pubkey : null;
  }

  /**
    Return public keys for a path or path matcher.
      @arg {keyPath|keyPathMatcher} [keyPathMatcher = '**'] return all keys
    @return {Array<pubkey>} public keys or empty array
  */
  function getPublicKeys() {
    var keyPathMatcher = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '**';

    return getKeys(keyPathMatcher).map(function (key) {
      return key.pubkey;
    });
  }

  /**
    Fetch or derive a private key.
    @arg {keyPath} path
    @return {wif} or null (missing or not available for location)
  */
  function getPrivateKey(path) {
    validate.path(path);

    var _getKeys3 = getKeys(path),
        _getKeys4 = _slicedToArray(_getKeys3, 1),
        key = _getKeys4[0];

    return key ? key.wif : undefined;
  }

  /**
    Return private keys for a path matcher or for a list of public keys.  If a
    list of public keys is provided they will be validated ensuring they all
    have private keys to return.
      @arg {keyPathMatcher} [keyPathMatcher = '**'] default is to match all
    @arg {Array<pubkey>} [pubkeys = null] if specified, filter and require all 
      @throws Error `login with your ${key.pubkey} key`
    @throws Error `missing public key ${key}`
      @return {Array<wif>} wifs or empty array
  */
  function getPrivateKeys() {
    var keyPathMatcher = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '**';
    var pubkeys = arguments[1];

    if (!pubkeys) {
      return getKeys(keyPathMatcher).filter(function (key) {
        return key.wif != null;
      }).map(function (key) {
        return key.wif;
      });
    }

    if (pubkeys instanceof Array) {
      pubkeys = new Set(pubkeys);
    }

    assert(pubkeys instanceof Set, 'pubkeys should be a Set or Array');

    var keys = new Map();

    getKeys(keyPathMatcher).filter(function (key) {
      return pubkeys.has(key.pubkey);
    }).forEach(function (key) {
      if (key.wif == null) {
        throw new Error('login with your \'' + key.path + '\' key');
      }
      keys.set(key.pubkey, key.wif);
    });

    pubkeys.forEach(function (key) {
      if (!keys.has(key)) {
        // Was keepPublicKeys true?
        throw new Error('missing public key ' + key);
      }
    });

    return Array.from(keys.values());
  }

  /**
    Fetch or derive a key pairs.
      @arg {keyPath|keyPathMatcher} keyPathMatcher
      @return {Array<keyPathPrivate>} {path, pubkey, deny, wif} or empty array.
    Based on the Uri rules and current location, the deny could be set to true
    and the wif will be null.
  */
  function getKeys() {
    var keyPathMatcher = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '**';

    keepAlive();

    var keys = new Map();

    // if we try to derive it below
    var wifsByPath = {};

    var isPath = validate.isPath(keyPathMatcher);

    function query(store) {
      userStorage.query(store, [accountName, 'kpath'], function (_ref6, wif) {
        var _ref7 = _slicedToArray(_ref6, 2),
            path = _ref7[0],
            pubkey = _ref7[1];

        if (wif == null) {
          wif = wifsByPath[path];
        } else {
          wifsByPath[path] = wif;
        }
        if (minimatch(path, keyPathMatcher)) {
          var result = { path: path, pubkey: pubkey };
          result.deny = uriRules.deny(currentUriPath(), path).length !== 0;
          result.wif = result.deny ? null : wif;
          keys.set(path, result);
          if (isPath) {
            return false; // break
          }
        }
      });
    }

    query(state);
    if (isPath && keys.size) {
      // A path can match only one, found so no need to query localStorage
      return Array.from(keys.values());
    }

    query(localStorage);
    if (!isPath) {
      // keyPathMatcher can not derive keys
      // .. the search is complete (found or not)
      return Array.from(keys.values());
    }

    assert(isPath, 'keyPathMatcher should be a path at this point');

    var key = null;

    // derive children (path)
    var path = keyPathMatcher;
    var deriveKeys = Keygen.deriveKeys(path, wifsByPath);
    if (deriveKeys.length) {
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = deriveKeys[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var derivedKey = _step4.value;
          // {path, privateKey}
          if (derivedKey.path === path) {
            // filter intermediate children
            var deny = uriRules.deny(currentUriPath(), path).length !== 0;
            key = {
              path: path,
              pubkey: derivedKey.privateKey.toPublic().toString(),
              wif: deny ? null : derivedKey.privateKey.toWif(),
              deny: deny
            };
            break;
          }
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }
    }

    return key ? [key] : [];
  }

  /**
    @private Remove a key or keys from this key store (ram and disk).  Typically
    logout is used instead.
      @arg {keyPathMatcher|Array<keyPathMatcher>|Set<keyPathMatcher>}
      @arg {boolean} keepPublicKeys
  */
  function removeKeys(paths) {
    var keepPublicKeys = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : config.keepPublicKeys;

    assert(paths != null, 'paths');
    if (typeof paths === 'string') {
      paths = [paths];
    }
    assert(paths instanceof Array || paths instanceof Set, 'paths is a Set or Array');
    var _iteratorNormalCompletion5 = true;
    var _didIteratorError5 = false;
    var _iteratorError5 = undefined;

    try {
      for (var _iterator5 = paths[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
        var path = _step5.value;

        validate.path(path);
      }
    } catch (err) {
      _didIteratorError5 = true;
      _iteratorError5 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion5 && _iterator5.return) {
          _iterator5.return();
        }
      } finally {
        if (_didIteratorError5) {
          throw _iteratorError5;
        }
      }
    }

    function clean(store, prefix) {
      for (var _key in store) {
        if (_key.indexOf(prefix) === 0) {
          if (keepPublicKeys) {
            store[_key] = null;
          } else {
            delete store[_key];
          }
        }
      }
    }

    var _iteratorNormalCompletion6 = true;
    var _didIteratorError6 = false;
    var _iteratorError6 = undefined;

    try {
      for (var _iterator6 = paths[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
        var _path3 = _step6.value;

        var prefix = userStorage.createKey(accountName, 'kpath', _path3);
        clean(state, prefix);
        clean(localStorage, prefix);
      }
    } catch (err) {
      _didIteratorError6 = true;
      _iteratorError6 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion6 && _iterator6.return) {
          _iterator6.return();
        }
      } finally {
        if (_didIteratorError6) {
          throw _iteratorError6;
        }
      }
    }
  }

  /**
    @typedef {object} oneTimeSignatures
    @property {Array<string>} signatures - in hex 
    @property {pubkey} oneTimePublic
  */
  /**
    @arg {pubkey} otherPubkey
    @arg {keyPathMatcher} keyPathMatcher
    @return {Promise<oneTimeSignatures>}
  */
  function signSharedSecret(otherPubkey) {
    var keyPathMatcher = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '**';

    assert(/pubkey|PublicKey/.test(validate.keyType(otherPubkey)), 'otherPubkey');
    assert(typeof keyPathMatcher === 'undefined' ? 'undefined' : _typeof(keyPathMatcher), 'string', 'keyPathMatcher');

    return PrivateKey.randomKey().then(function (oneTimePrivate) {
      var sharedSecret = oneTimePrivate.getSharedSecret(otherPubkey);
      var signatures = getPrivateKeys(keyPathMatcher).map(function (wif) {
        return ecc.sign(sharedSecret, wif);
      });
      var oneTimePublic = ecc.privateToPublic(oneTimePrivate);
      return {
        signatures: signatures,
        oneTimePublic: oneTimePublic
      };
    });
  }

  /**
    Removes all saved keys on disk and clears keys in memory.  Call only when
    the user chooses "logout."  Do not call when the application exits.
      Forgets everything allowing the user to use a new password next time.
  */
  function logout() {
    for (var _key2 in state) {
      delete state[_key2];
    }

    var prefix = userStorage.createKey(accountName);
    for (var _key3 in localStorage) {
      if (_key3.indexOf(prefix) === 0) {
        delete localStorage[_key3];
      }
    }

    clearInterval(expireInterval);
    expireInterval = null;

    if (unlistenHistory) {
      unlistenHistory();
      unlistenHistory = null;
    }

    expireAt = null;
  }

  /**
    @return {number} 0 (expired) or milliseconds until expire
  */
  function timeUntilExpire() {
    return expireAt === 0 ? 0 : expireAt == null ? 0 : Math.max(0, expireAt - Date.now());
  }

  /**
    Keep alive (prevent expiration).  Called automatically if Uri navigation
    happens or keys are required.  It may be necessary to call this manually.
  */
  function keepAlive() {
    expireAt = Date.now() + config.timeoutInMin * min;
  }

  /**
    Integration for 'xmaxjs' ..
      Call keyProvider with no parameters or with a specific keyPathMatcher
    pattern to get an array of public keys in this key store.  A library
    like xmaxjs may be provided these available public keys to xmaxrun
    get_required_keys for filtering and to determine which private keys are
    needed to sign a given transaction.
      Call again with the get_required_keys pubkeys array to get the required
    private keys returned (or an error if any are missing).
      @throws Error `login with your ${path} key`
    @throws Error `missing public key ${key}`
      @arg {object} param
    @arg {string} [param.keyPathMatcher = '**'] - param.keyPathMatcher for public keys
    @arg {Array<pubkey>|Set<pubkey>} [param.pubkeys] for fetching private keys
      @return {Array<pubkey|wif>} available pubkeys in the keystore or matching
    wif private keys for the provided pubkeys argument (also filtered using
    keyPathMatcher).
    */
  function keyProvider() {
    var _ref8 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        _ref8$keyPathMatcher = _ref8.keyPathMatcher,
        keyPathMatcher = _ref8$keyPathMatcher === undefined ? '**' : _ref8$keyPathMatcher,
        pubkeys = _ref8.pubkeys;

    keepAlive();

    if (pubkeys) {
      return getPrivateKeys(keyPathMatcher, pubkeys);
    }

    if (keyPathMatcher) {
      // For `login with your xxx key` below, get all keys even if a
      // wif is not available.
      return getPublicKeys(keyPathMatcher);
    }
  }

  return {
    deriveKeys: deriveKeys,
    addKey: addKey,
    getKeys: getKeys,
    getKeyPaths: getKeyPaths,
    getPublicKey: getPublicKey,
    getPublicKeys: getPublicKeys,
    getPrivateKey: getPrivateKey,
    getPrivateKeys: getPrivateKeys,
    removeKeys: removeKeys,
    signSharedSecret: signSharedSecret,
    logout: logout,
    timeUntilExpire: timeUntilExpire,
    keepAlive: keepAlive,
    keyProvider: keyProvider
  };
}

/** @private */
function currentUriPath() {
  var location = globalConfig.history.location;

  return '' + location.pathname + location.search + location.hash;
}

/** Erase all traces of this keystore (for all users). */
Keystore.wipeAll = function () {
  var prefix = userStorage.createKey();
  for (var _key4 in localStorage) {
    if (_key4.indexOf(prefix) === 0) {
      delete localStorage[_key4];
    }
  }
};

// used to convert milliseconds
var sec = 1000,
    min = 60 * sec;