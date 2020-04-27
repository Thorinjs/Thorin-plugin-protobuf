'use strict';
const initProto = require('./lib/protobuf');
module.exports = function (thorin, opt, pluginName) {
  const defaultOpt = {
    logger: pluginName || 'protobuf',
    debug: false,
    path: 'app/models',
    options: {} // additional protobuf options for https://protobufjs.github.io/protobuf.js/Root.html
  };
  opt = thorin.util.extend(defaultOpt, opt);
  const protoObj = initProto(thorin, opt);
  /**
   * Manually create a new plugin instance.
   * */
  protoObj.create = (_opt = {}) => {
    return initProto(thorin, _opt);
  };
  return protoObj;
};
module.exports.publicName = 'protobuf';
