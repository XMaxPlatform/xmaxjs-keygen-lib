'use strict';

/* eslint-env mocha */
var assert = require('assert');

var _require = require('./test-utils.js'),
    accountPermissions = _require.accountPermissions,
    checkKeySet = _require.checkKeySet;

var _require2 = require('xmaxjs-ecc-lib'),
    PrivateKey = _require2.PrivateKey;

var Keygen = require('./keygen');

describe('Keygen', function () {
  it('initialize', function () {
    return PrivateKey.initialize();
  });

  it('generateMasterKeys (create)', function () {
    return Keygen.generateMasterKeys().then(function (keys) {
      checkKeySet(keys);
    });
  });

  it('generateMasterKeys (re-construct)', function () {
    var master = 'PW5JMx76CTUTXxpAbwAqGMMVzSeJaP5UVTT5c2uobcpaMUdLAphSp';
    return Keygen.generateMasterKeys(master).then(function (keys) {
      assert.equal(keys.masterPrivateKey, master, 'masterPrivateKey');
      checkKeySet(keys);
    });
  });

  it('authsByPath', function () {
    var paths = Keygen.authsByPath(accountPermissions);
    assert.deepEqual(['active', 'active/mypermission', 'owner'], Object.keys(paths));
  });

  it('deriveKeys', function () {
    var master = 'PW5JMx76CTUTXxpAbwAqGMMVzSeJaP5UVTT5c2uobcpaMUdLAphSp';
    return Keygen.generateMasterKeys(master).then(function (keys) {
      var wifsByPath = {
        owner: keys.privateKeys.owner,
        active: keys.privateKeys.active
      };

      var derivedKeys = Keygen.deriveKeys('active/mypermission', wifsByPath);
      var active = PrivateKey(keys.privateKeys.active);
      var checkKey = active.getChildKey('mypermission').toWif();

      assert.equal(derivedKeys.length, 1, 'derived key count');
      assert.equal(derivedKeys[0].path, 'active/mypermission');
      assert.equal(derivedKeys[0].privateKey.toWif(), checkKey, 'wrong private key');
    });
  });
});