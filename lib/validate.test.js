'use strict';

/* eslint-env mocha */
var assert = require('assert');

var validate = require('./validate');

describe('Validate', function () {

  it('path', function () {
    validate.path('owner'); // better error than doesNotThrow
    assert.doesNotThrow(function () {
      return validate.path('owner');
    });
    assert.doesNotThrow(function () {
      return validate.path('active');
    });
    assert.doesNotThrow(function () {
      return validate.path('active/mypermission');
    });
    assert.doesNotThrow(function () {
      return validate.path('active');
    });
    assert.doesNotThrow(function () {
      return validate.path('active/mykey');
    });

    assert.throws(function () {
      return validate.path('active/mykey/active');
    }, /duplicate/);
    assert.throws(function () {
      return validate.path('owner/active');
    }, /owner is implied, juse use active/);
    assert.throws(function () {
      return validate.path('joe/active');
    }, /path should start with owner or active/);
    assert.throws(function () {
      return validate.path('owner/mykey/active');
    }, /active is always first/);
    assert.throws(function () {
      return validate.path('active/mykey/owner');
    }, /owner is always first/);
    assert.throws(function () {
      return validate.path('active/owner');
    }, /owner is always first/);
  });

  it('keyType', function () {
    var testPubkey = 'XMX6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV';
    var testMasterPass = 'PW5JMx76CTUTXxpAbwAqGMMVzSeJaP5UVTT5c2uobcpaMUdLAphSp';
    var testPrivate = testMasterPass.substring(2);

    assert.equal(validate.keyType(testPubkey), 'pubkey');
    assert.equal(validate.keyType(testMasterPass), 'master');
    assert.equal(validate.keyType(testPrivate), 'wif');
    assert.equal(validate.keyType(testPrivate.substring(1)), null);
  });

  it('isMasterKey', function () {
    var testMasterPass = 'PW5JMx76CTUTXxpAbwAqGMMVzSeJaP5UVTT5c2uobcpaMUdLAphSp';
    assert(validate.isMasterKey(testMasterPass));
    assert(!validate.isMasterKey(testMasterPass + 'a'));
  });
});