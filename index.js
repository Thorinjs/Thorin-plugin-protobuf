'use strict';
const initProto = require('./lib/protobuf');
module.exports = function (thorin, opt, pluginName) {
  const defaultOpt = {
    logger: pluginName || 'protobuf',
    debug: false,
    path: ['app/models'],
    ids: 'auto',  // do we generate the ids automatically? or based on the file name. Values are "auto" or "file"
                  // Note: when ids="file", the filename must have {id}-{name}.proto
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
