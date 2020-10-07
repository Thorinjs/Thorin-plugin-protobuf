'use strict';
const protobuf = require("protobufjs"),
  pbjs = require('protobufjs/cli/pbjs'),
  path = require('path');

module.exports = (thorin, opt = {}) => {
  const logger = thorin.logger(opt.logger);

  class ThorinProtobuf {

    #root = null;
    #extenders = [];  // array of extensions to require.
    #counter = 0;   // this is our unique item counter, for every single registered type
    #ids = {};      // map of {id:fullName}
    #names = {};    // map of {fullName:id}
    #nameCache = {};  // map of {name, obj}
    #started = false;

    constructor() {
      protobuf.parse.defaults.keepCase = true;
      this.#root = new protobuf.Root(opt.options);
      if (!(opt.path instanceof Array)) opt.path = [opt.path];
      if (!(opt.extend instanceof Array)) opt.extend = [opt.extend];
      for (let i = 0, len = opt.path.length; i < len; i++) {
        let p = opt.path[i];
        if (typeof p !== 'string' || !p) continue;
        this.load(p, false);
      }
      for (let i = 0, len = opt.extend.length; i < len; i++) {
        let f = opt.extend[i];
        if (typeof f !== 'string' || !f) continue;
        if (f.indexOf('.') !== -1) {
          this.#extenders.push(f);
        } else {
          let subFiles = thorin.util.readDirectory(f, {
            ext: '.js'
          });
          this.#extenders = this.#extenders.concat(subFiles);
        }
      }
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
      this.#assignId();
      this.#started = true;
      for (let i = 0, len = this.#extenders.length; i < len; i++) {
        let extFile = this.#extenders[i];
        try {
          let extObj = require(extFile);
          if (typeof extObj === 'function') extObj(this.#root);
        } catch (e) {
          logger.error(`Could not load proto extension from [${extFile}]`);
          return done(e);
        }
      }
      done();
    }

    /**
     * Given a model object, it will return its full namespaced name.
     * */
    getModelName(obj, sep = '.', res) {
      let result = res || [];
      if (obj.name) {
        result.push(obj.name);
      }
      if (obj.parent) {
        this.getModelName(obj.parent, sep, result);
      }
      if (!res) {
        return result.reverse().join(sep);
      }
    }

    /**
     * Loops over all the registered items and assignes them a unique incremental id.
     * */
    #assignId = (root) => {
      if (typeof root === 'undefined') root = this.#root;
      if (!root) return;
      // Check if we have file ids, or auto ids
      if (opt.ids === 'file') { // {id}-{name}
        if (root.filename) {
          let fileName = path.basename(root.filename),
            fileId = parseInt(fileName.split('-')[0]);
          if (isNaN(fileId) || fileId < 0) {
            logger.error(`Proto file [${root.filename}] does not have id number in its name`);
            return;
          }
          root._id = fileId;
        }
      } else {
        root._id = this.#counter;
      }
      this.#counter++;
      let name = getFullName(root);
      if (name && typeof root._id !== 'undefined') {
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
      if (this.#nameCache[name]) return this.#nameCache[name];
      let r = this.get(name);
      if (r) {
        this.#nameCache[name] = r;
      }
      return r;
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

    /**
     * Actually compiles the .proto files to static js output
     * Note: this returns an array of compiled text.
     * */
    compile(keys = [], type = 'static', opt = {}) {
      let ns = [];
      if (keys.length === 0) {
        ns.push(this.#root);
      } else {
        for (let i = 0, len = keys.length; i < len; i++) {
          let s = this.get(keys[i]);
          if (!s) {
            logger.warn(`Namespace [${s}] does not exist`);
            continue;
          }
          ns.push(s);
        }
      }
      let files = [];
      for (let i = 0; i < ns.length; i++) {
        getNestedFiles(ns[i], files);
      }
      return new Promise((resolve, reject) => {
        let args = ["--target", type];
        Object.keys(opt).forEach((k) => {
          let q = `--${k}`;
          if (typeof opt[k] === 'number' || typeof opt[k] === 'string' && opt[k]) q += `=${opt[k]}`;
          args.push(q);
        });
        args = args.concat(files);
        pbjs.main(args, (err, output) => {
          if (err) {
            logger.warn(`Could not compile [${keys.join(',') || 'root'}] to [${type}]`);
            return reject(err);
          }
          resolve(output);
        });
      });
    }

    #setId = (obj, key) => {
      if (key) {
        let sid = this.#names[key];
        if (typeof sid === 'number') {
          obj._id = sid;
          obj._name = key;
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
  return names.concat([]).reverse().join('.');
}

function getNestedFiles(obj, files = []) {
  if (obj.filename && files.indexOf(obj.filename) === -1) {
    files.push(obj.filename);
  }
  if (obj.nested) {
    let sub = Object.keys(obj.nested);
    for (let i = 0; i < sub.length; i++) {
      let s = sub[i];
      getNestedFiles(obj.nested[s], files);
    }
  }
  return files;
}

