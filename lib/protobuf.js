'use strict';
const protobuf = require("protobufjs"),
  path = require('path');

module.exports = (thorin, opt = {}) => {
  const logger = thorin.logger(opt.logger);

  class ThorinProtobuf {

    #root = null;

    constructor() {
      this.#root = new protobuf.Root(opt.options);
    }

    get root() {
      return this.#root;
    }

    set root(v) {}

    /**
     * Loads all .proto files from the given opt.path
     * */
    async run(done) {
      let modelPath = path.normalize(thorin.root + '/' + opt.path);
      let protoFiles = thorin.util.readDirectory(modelPath, {
        ext: 'proto'
      });
      for (let i = 0, len = protoFiles.length; i < len; i++) {
        let protoFile = protoFiles[i],
          protoName = protoFile.replace(thorin.root, '');
        try {
          this.#root.loadSync(protoFile);
        } catch (e) {
          logger.warn(`Could not load protobuf: ${protoName}`);
          logger.debug(e.message);
        }
      }
      done();
    }

    /**
     * Returns the protobuf instance
     * */
    getInstance() {
      return protobuf;
    }

    /**
     * Wrapper functions over some common functionality.
     * */
    get(name) {
      if (typeof name !== 'string' || !name || name.indexOf('.') === -1) {
        return this.#root.get(name) || null;
      }
      let keys = name.split('.'),
        tmp = this.#root,
        valid = true;
      for (let i = 0, len = keys.length; i < len; i++) {
        let key = keys[i];
        if (!tmp.nested[key]) {
          valid = false;
          break;
        }
        tmp = tmp.nested[key];
      }
      if (!valid) return null;
      return tmp;
    }

    /**
     * Adds a new item to the root instance
     * */
    add(obj) {
      return this.#root.add(obj);
    }

    /**
     * Exports the root object, or, the given nested objects.
     * @Arguments
     *  - key - the dotted string to export.
     * */
    export(nestedKey = null) {
      if (!nestedKey) return this.#root.toJSON();
      let s = this.get(nestedKey);
      if (!s) {
        logger.warn(`Namespace [${nestedKey}] does not exist`);
        return null;
      }
      return s.toJSON();
    }

  }


  return new ThorinProtobuf();
}
