'use strict';

var Keystore = require('./keystore');
var Keygen = require('./keygen');

var createHistory = require('history').createBrowserHistory;
var config = require('./config');

config.history = createHistory();
config.localStorage = localStorage;

module.exports = {
  Keystore: Keystore,
  Keygen: Keygen
};