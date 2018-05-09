'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var assert = require('assert');

var accountPermissions = [{
  perm_name: 'active',
  parent: 'owner',
  required_auth: {
    threshold: 1,
    keys: [{
      key: 'XMX7vgT3ZsuUxWH1tWyqw6cyKqKhPjUFbonZjyrrXqDauty61SrYe',
      weight: 1
    }],
    accounts: []
  }
}, {
  perm_name: 'mypermission',
  parent: 'active',
  required_auth: {
    threshold: 1,
    keys: [{
      key: 'XMX5MiUJEXxjJw6wUcE6yUjxpATaWetubAGUJ1nYLRSHYPpGCJ8ZU',
      weight: 1
    }],
    accounts: []
  }
}, {
  perm_name: 'owner',
  parent: '',
  required_auth: {
    threshold: 1,
    keys: [{
      key: 'XMX8jJUMo67w6tYBhzjZqyzq5QyL7pH7jVTmv1xoakXmkkgLrfTTx',
      weight: 1
    }],
    accounts: []
  }
}];

function checkKeySet(keys) {
  assert.equal(_typeof(keys.masterPrivateKey), 'string', 'keys.masterPrivateKey');

  assert.equal(_typeof(keys.privateKeys), 'object', 'keys.privateKeys');
  assert.equal(_typeof(keys.privateKeys.owner), 'string', 'keys.privateKeys.owner');
  assert.equal(_typeof(keys.privateKeys.active), 'string', 'keys.privateKeys.active');

  assert.equal(_typeof(keys.publicKeys), 'object', 'keys.publicKeys');
  assert.equal(_typeof(keys.publicKeys.owner), 'string', 'keys.publicKeys.owner');
  assert.equal(_typeof(keys.publicKeys.active), 'string', 'keys.publicKeys.active');
}

module.exports = {
  accountPermissions: accountPermissions,
  checkKeySet: checkKeySet
};