'use strict';
const protobuf = require("protobufjs"),
  path = require('path');

module.exports = (thorin, opt = {}) => {
  const logger = thorin.logger(opt.logger);

  class ThorinProtobuf {

    #root = null;
    #counter = 0;   // this is our unique item counter, for every single registered type
    #ids = {};      // map of {id:fullName}
    #names = {};    // map of {fullName:id}
    #started = false;

    constructor() {
      this.#root = new protobuf.Root(opt.options);
    }

    get root() {
      return this.#root;
    }

    set root(v) {}

    get ids() {
      return this.#ids;
    }

    /**
     * Adds a new path to be read.
     * */
    addPath(_p) {
      if (typeof _p !== 'string' || !_p) return false;
      if (this.#started) {
        this.load(_p);
      } else {
        if (!(opt.path instanceof Array)) opt.path = [];
        opt.path.push(_p);
      }
      return true;
    }

    /**
     * Given a path, it will load all models inside it.
     * */
    load(folder = '', assignIds = true) {
      let modelPath = path.isAbsolute(folder) ? path.normalize(folder) : path.normalize(thorin.root + '/' + folder);
      let protoFiles = thorin.util.readDirectory(modelPath, {
        ext: 'proto'
      }).sort();
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
      if (assignIds === true) {
        this.#assignId();
      }
    }

    /**
     * Loads all .proto files from the given opt.path
     * */
    async run(done) {
      if (!(opt.path instanceof Array)) opt.path = [opt.path];
      for (let i = 0, len = opt.path.length; i < len; i++) {
        let p = opt.path[i];
        if (typeof p !== 'string' || !p) continue;
        this.load(p, false);
      }
      this.#assignId();
      this.#started = true;
      done();
    }

    /**
     * Loops over all the registered items and assignes them a unique incremental id.
     * */
    #assignId = (root) => {
      if (typeof root === 'undefined') root = this.#root;
      if (!root) return;
      root._id = this.#counter;
      this.#counter++;
      let name = getFullName(root);
      if (name) {
        this.#ids[root._id] = name;
        this.#names[name] = root._id;
      }
      if (!root.nested) return;
      let subs = Object.keys(root.nested || {}).sort();
      for (let i = 0; i < subs.length; i++) {
        let subObj = root.nested[subs[i]];
        this.#assignId(subObj);
      }
    }

    /**
     * Returns the protobuf instance
     * */
    getInstance() {
      return protobuf;
    }

    /**
     * Alias to get
     * */
    model(name) {
      return this.get(name);
    }

    /**
     * Wrapper functions over some common functionality.
     * */
    get(name) {
      if (typeof name === 'number') {
        name = this.#ids[name];
      }
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
      let q = this.#root.add(obj);
      this.#assignId();
      return q;
    }

    /**
     * Exports the root object, or, the given nested objects.
     * @Arguments
     *  - key - the dotted string to export.
     * */
    export(nestedKey = null) {
      let s = nestedKey ? this.get(nestedKey) : this.#root;
      if (!s) {
        logger.warn(`Namespace [${nestedKey}] does not exist`);
        return null;
      }
      let res = s.toJSON(),
        baseNs = nestedKey || '';
      this.#setId(res, baseNs);
      return res;
    }

    #setId = (obj, key) => {
      if (key) {
        let sid = this.#names[key];
        if (typeof sid === 'number') {
          obj._id = sid;
        }
      }
      let nestedKeys = Object.keys(obj.nested || {});
      for (let i = 0; i < nestedKeys.length; i++) {
        let subKey = nestedKeys[i],
          subObj = obj.nested[subKey];
        let newKey = key;
        if (newKey) newKey += '.';
        newKey += subKey;
        this.#setId(subObj, newKey);
      }
    }

  }


  return new ThorinProtobuf();
}

function getFullName(obj, names = []) {
  if (obj.name) {
    names.push(obj.name);
  }
  if (obj.parent) {
    getFullName(obj.parent, names);
  }
  return names.reverse().join('.');
}

