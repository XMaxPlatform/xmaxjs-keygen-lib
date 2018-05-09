'use strict';

/* eslint-env mocha */
var assert = require('assert');

var _require = require('./test-utils.js'),
    accountPermissions = _require.accountPermissions,
    checkKeySet = _require.checkKeySet;

var _require2 = require('xmaxjs-ecc'),
    PrivateKey = _require2.PrivateKey,
    Signature = _require2.Signature;

var ecc = require('xmaxjs-ecc');
var config = require('./config');

var Keystore = require('./keystore.js');

var pathname = void 0;
var historyListener = void 0;

config.history = {
  get location() {
    return { pathname: pathname, search: '', hash: '' };
  },
  get listen() {
    return function (callback) {
      historyListener = callback;
    };
  }
};

var keystore = void 0;

function reset() {
  if (keystore) {
    keystore.logout();
  }
  Keystore.wipeAll();
}

describe('Keystore', function () {
  before(function () {
    return PrivateKey.initialize();
  });
  var master = 'PW5JMx76CTUTXxpAbwAqGMMVzSeJaP5UVTT5c2uobcpaMUdLAphSp';
  var master2 = 'PW5JKvXxVvnFgyHZSmGASQfnmya3QrgdQ46ydQn7CzVB6RNT3nCnu';

  beforeEach(function () {
    pathname = '/';
    reset();
  });

  afterEach(function () {
    reset();
  });

  it('create', function () {
    Keystore('uid');
  });

  it('initialize from disk', async function () {
    keystore = Keystore('myaccount');

    var privateKey = await PrivateKey.randomKey();
    var wif = privateKey.toWif();
    var pubkey = privateKey.toPublic().toString();

    keystore.addKey('active/mypermission', wif, true /*disk*/);

    keystore = Keystore('myaccount');
    assert.deepEqual(keystore.getKeyPaths(), {
      pubkey: ['active/mypermission'],
      wif: ['active/mypermission']
    });
  });

  it('saveKeyMatches', function () {
    keystore = Keystore('myaccount');

    keystore.deriveKeys({
      parent: master,
      accountPermissions: accountPermissions,
      saveKeyMatches: 'active{,/**}'
    });

    keystore = Keystore('myaccount');
    assert.deepEqual(keystore.getKeyPaths(), {
      pubkey: ['active', 'active/mypermission'],
      wif: ['active', 'active/mypermission']
    });
  });

  describe('login', function () {
    it('active key (without blockchain permission)', async function () {
      keystore = Keystore('uid');
      var privateKey = await PrivateKey.randomKey();
      var wif = privateKey.toWif();

      keystore.deriveKeys({ parent: wif });

      var keyPaths = ['active'];

      assert.deepEqual(keystore.getKeyPaths(), { pubkey: keyPaths, wif: keyPaths });
    });

    it('master key (without blockchain permission)', function () {
      keystore = Keystore('uid');

      keystore.deriveKeys({ parent: master });

      var keyPaths = ['active'];

      assert.deepEqual(keystore.getKeyPaths(), { pubkey: keyPaths, wif: keyPaths });
    });

    it('login changed', function () {
      keystore = Keystore('uid');
      keystore.deriveKeys({ parent: master });
      keystore.deriveKeys({ parent: master2 });
    });

    it('saved login changed', function () {
      keystore = Keystore('uid');
      keystore.deriveKeys({ parent: master, saveKeyMatches: 'active' });
      keystore.deriveKeys({ parent: master2 });
    });
  });

  describe('invalid login', function () {
    it('account permissions', function () {
      keystore = Keystore('uid');
      assert.throws(function () {
        keystore.deriveKeys({ parent: master2, accountPermissions: accountPermissions });
      }, /invalid login/);
    });

    it('account permissions early', function () {
      keystore = Keystore('uid');
      keystore.deriveKeys({ parent: master, accountPermissions: accountPermissions });
      assert.throws(function () {
        keystore.deriveKeys({ parent: master2 });
      }, /invalid login/);
    });

    it('account permissions later', function () {
      keystore = Keystore('uid');
      keystore.deriveKeys({ parent: master });
      assert.throws(function () {
        keystore.deriveKeys({ parent: master2, accountPermissions: accountPermissions });
      }, /invalid login/);
    });
  });

  var _arr = ['active', 'owner'];

  var _loop = function _loop() {
    var role = _arr[_i];
    it('block ' + role + ' key re-use', function () {
      keystore = Keystore('uid');
      var perm = JSON.parse(JSON.stringify(accountPermissions));

      var rolePos = role === 'active' ? 0 : role === 'owner' ? 2 : -1;
      var wif = perm[rolePos].required_auth.keys[0].key;

      perm[(rolePos + 1) % perm.length].required_auth.keys[0].key = wif;

      assert.throws(function () {
        keystore.deriveKeys({ parent: master, accountPermissions: perm });
      }, / key reused in authority/);
      // }, new RegExp(`${role} key reused in authority`))
    });
  };

  for (var _i = 0; _i < _arr.length; _i++) {
    _loop();
  }

  it('derive all active permisison keys', function () {
    keystore = Keystore('uid');
    keystore.deriveKeys({ parent: master, accountPermissions: accountPermissions });

    var keyPaths = ['active', 'active/mypermission'];
    assert.deepEqual(keystore.getKeyPaths(), { pubkey: keyPaths, wif: keyPaths });
  });

  it('get derived active public keys', function () {
    keystore = Keystore('uid');
    keystore.deriveKeys({ parent: master, accountPermissions: accountPermissions });

    assert.deepEqual(keystore.getPublicKeys(), ['XMX7vgT3ZsuUxWH1tWyqw6cyKqKhPjUFbonZjyrrXqDauty61SrYe', 'XMX5MiUJEXxjJw6wUcE6yUjxpATaWetubAGUJ1nYLRSHYPpGCJ8ZU']);
  });

  it('low permission page master login', function () {
    var uriRules = {
      'active/mypermission': '/'
    };

    keystore = Keystore('uid', { uriRules: uriRules });
    keystore.deriveKeys({ parent: master, accountPermissions: accountPermissions });

    // Make sure "active" is not avabile, only active/mypermisison
    var keyPaths = ['active/mypermission'];
    assert.deepEqual(keystore.getKeyPaths(), { pubkey: keyPaths, wif: keyPaths });
  });

  it('low permission page login', function () {
    var uriRules = {
      'active/mypermission': '/'
    };

    var mypermission = PrivateKey(master.substring(2)).getChildKey('owner').getChildKey('active').getChildKey('mypermission');

    keystore = Keystore('uid', { uriRules: uriRules });

    // Active key is not required, just the lower mypermission key
    keystore.deriveKeys({ parent: mypermission, accountPermissions: accountPermissions });

    var keyPaths = ['active/mypermission'];
    assert.deepEqual(keystore.getKeyPaths(), { pubkey: keyPaths, wif: keyPaths });
  });

  it('uri rules history', function () {
    var uriRules = {
      'owner': '/account_recovery',
      'active': '/transfers'
    };

    keystore = Keystore('uid', { uriRules: uriRules });

    pathname = '/';
    assert.throws(function () {
      return keystore.deriveKeys({ parent: master, accountPermissions: accountPermissions });
    }, /invalid login for page/);

    pathname = '/account_recovery';

    keystore.deriveKeys({ parent: master, accountPermissions: accountPermissions });

    assert.deepEqual(keystore.getKeyPaths(), {
      pubkey: ['active', 'owner', 'active/mypermission'],
      wif: ['active', 'owner', 'active/mypermission']
    });

    pathname = '/transfers';
    historyListener(); // trigger history change event
    assert.deepEqual(keystore.getKeyPaths(), {
      pubkey: ['active', 'owner', 'active/mypermission'],
      wif: ['active', 'active/mypermission']
    });
  });

  it('timeout', function (done) {
    var config = {
      uriRules: { '**': '.*' },
      timeoutInMin: .0001,
      timeoutKeyPaths: ['owner', 'owner/**']
    };

    keystore = Keystore('myaccount', config);
    keystore.deriveKeys({ parent: master, accountPermissions: accountPermissions });

    var before = ['active', 'owner', 'active/mypermission'];
    assert.deepEqual(keystore.getKeyPaths(), { pubkey: before, wif: before });

    function timeout() {
      var after = ['active', 'active/mypermission'];
      assert.deepEqual(keystore.getKeyPaths(), { pubkey: before, wif: after });
      done();
    }

    setTimeout(function () {
      timeout();
    }, .003 * min);
  });

  it('saveKeyMatches disk security', function () {
    keystore = Keystore('myaccount');
    assert.throws(function () {
      return keystore.deriveKeys({ parent: master, saveKeyMatches: 'owner' });
    }, /do not save owner key to disk/);
  });

  it('addKey disk security', async function () {
    keystore = Keystore('myaccount');

    var disk = true;
    var privateKey = await PrivateKey.randomKey();
    var save = function save(path) {
      return keystore.addKey(path, privateKey, disk);
    };

    assert.throws(function () {
      save('owner');
    }, /not be stored on disk/);
    assert.throws(function () {
      save('owner/cold');
    }, /not be stored on disk/);

    assert.doesNotThrow(function () {
      save('active');
    });
    assert.doesNotThrow(function () {
      save('active/mypermission');
    });
  });

  it('save key', async function () {
    keystore = Keystore('myaccount');
    var save = function save(key) {
      return keystore.addKey('active', key);
    };

    var privateKey = await PrivateKey.randomKey();
    var wif = privateKey.toWif();
    var publicKey = privateKey.toPublic();
    var pubkey = publicKey.toString();

    assert.deepEqual(save(privateKey), { wif: wif, pubkey: pubkey, dirty: true });
    assert.deepEqual(save(wif), { wif: wif, pubkey: pubkey, dirty: false });
    assert.deepEqual(save(publicKey), { pubkey: pubkey, dirty: false });
    assert.deepEqual(save(pubkey), { pubkey: pubkey, dirty: false });
  });

  it('save and get keys', async function () {
    keystore = Keystore('myaccount', {
      uriRules: { '**': '.*' // allow owner key
      } });

    var privateKey = await PrivateKey.randomKey();
    var wif = privateKey.toWif();
    var pubkey = privateKey.toPublic().toString();

    assert.deepEqual(keystore.addKey('owner', wif), {
      wif: wif,
      pubkey: pubkey,
      dirty: true
    });

    assert.deepEqual(keystore.getKeyPaths(), {
      pubkey: ['owner'],
      wif: ['owner']
    });

    assert.deepEqual(keystore.getPublicKeys(), [pubkey]);
    assert.deepEqual(keystore.getPublicKeys('owner'), [pubkey]);

    assert.equal(keystore.getPublicKey('owner'), pubkey);
    assert.equal(keystore.getPrivateKey('owner'), wif);

    var cold = privateKey.getChildKey('cold');
    assert.equal(keystore.getPublicKey('owner/cold'), cold.toPublic().toString());
    assert.equal(keystore.getPrivateKey('owner/cold'), cold.toWif());

    // keep the owner key above, add public key active/other
    assert.deepEqual(keystore.addKey('active/other', pubkey), {
      pubkey: pubkey,
      dirty: true
    });

    assert.deepEqual(keystore.getKeyPaths(), {
      pubkey: ['owner', 'active/other'],
      wif: ['owner']
    });

    // add the private key for active/mypermission
    assert.deepEqual(keystore.addKey('active/mypermission', wif), {
      dirty: true,
      pubkey: pubkey,
      wif: wif
    });

    // now we have everything: owner, active/mypermission
    assert.deepEqual(keystore.getKeyPaths(), {
      pubkey: ['owner', 'active/other', 'active/mypermission'],
      wif: ['owner', 'active/mypermission']
    });
  });

  it('removeKeys', async function () {
    keystore = Keystore('myaccount');

    var privateKey = await PrivateKey.randomKey();
    var wif = privateKey.toWif();
    var pubkey = privateKey.toPublic().toString();

    assert.deepEqual(keystore.addKey('active', wif), { wif: wif, pubkey: pubkey, dirty: true });

    keystore.removeKeys('active', true /*keepPublicKeys*/);
    assert.deepEqual(keystore.getKeyPaths(), {
      pubkey: ['active'],
      wif: []
    });

    keystore.removeKeys(new Set(['active']), false /*keepPublicKeys*/);
    assert.deepEqual(keystore.getKeyPaths(), { pubkey: [], wif: [] });
  });

  it('signSharedSecret', async function () {
    // server creates "one time" random key pairs

    var oneTimeServerPrivate = await PrivateKey.unsafeRandomKey(); // server
    var oneTimeServerPublic = ecc.privateToPublic(oneTimeServerPrivate); // server

    var clientKeystore = Keystore('myaccount', { uriRules: { '**': '.*' } });

    clientKeystore.deriveKeys({
      parent: master,
      accountPermissions: accountPermissions // .. all 3 keys
    });

    // client receives oneTimeServerPublic

    // client creates "one time" random key pairs (in signSharedSecret)
    var clientProof = await clientKeystore.signSharedSecret(oneTimeServerPublic);

    // server receives clientProof

    // clientProof is a collection of signatures and a one time public
    var sharedSecret = oneTimeServerPrivate.getSharedSecret(clientProof.oneTimePublic);

    var recoveredPubkeys = clientProof.signatures.map(function (signature) {
      return ecc.recover(signature, sharedSecret);
    } // server
    );

    assert.equal(recoveredPubkeys.length, 3, 'expecting 3 keys');
    assert.deepEqual(clientKeystore.getPublicKeys().sort(), recoveredPubkeys.sort());

    Keystore.wipeAll();
  });

  it('keyProvider', function () {
    keystore = Keystore('myaccount');
    keystore.deriveKeys({ parent: master });

    var pubkeys = keystore.keyProvider({ publicKeyPathMatcher: 'active' });

    assert.equal(pubkeys.length, 1, 'pubkeys.length');

    var wifs = keystore.keyProvider({ pubkeys: pubkeys });
    assert.equal(wifs.length, 1, 'pubkeys.length');
    assert.equal(ecc.privateToPublic(wifs[0]), pubkeys[0]);

    keystore.removeKeys('active');
    assert.throws(function () {
      keystore.keyProvider({ pubkeys: pubkeys });
    }, /login with your 'active' key/);

    keystore.removeKeys('active', false /* keepPublicKeys */);
    assert.throws(function () {
      keystore.keyProvider({ pubkeys: pubkeys });
    }, /missing public key XMAX.*/);
  });

  it('wipe all', async function () {
    keystore = Keystore('myaccount');
    keystore.addKey('active/mypermission', (await PrivateKey.randomKey()), true /*disk*/);

    Keystore.wipeAll();

    keystore = Keystore('myaccount');
    assert.deepEqual(keystore.getKeyPaths(), { pubkey: [], wif: [] });
  });

  it('logout', async function () {
    keystore = Keystore('myaccount');

    var privateKey = await PrivateKey.randomKey();
    var wif = privateKey.toWif();
    var pubkey = privateKey.toPublic().toString();

    // saves the public keys
    keystore.deriveKeys({ parent: 'PW' + (await ecc.unsafeRandomKey()) });
    keystore.logout();
    assert.equal(keystore.getKeys().length, 0, 'getKeys().length');

    // use a new password
    keystore.deriveKeys({ parent: master });
    assert.equal(keystore.getKeys().length, 1, 'getKeys().length');

    var keyPathStore2 = Keystore('myaccount');
    assert.deepEqual(keyPathStore2.getKeyPaths(), {
      pubkey: [],
      wif: []
    });
  });
});

var sec = 1000,
    min = 60 * sec;