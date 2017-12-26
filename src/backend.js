/* global Mavo, Bliss */
/* eslint new-cap: "off" */

(function ($) {
/**
 * Base class for all backends
 */
  const _ = Mavo.Backend = $.Class({
    constructor(url, o = {}) {
      this.source = url;
      this.url = new URL(this.source, Mavo.base);
      this.mavo = o.mavo;
      this.format = Mavo.Formats.create(o.format, this);

    // Permissions of this particular backend.
      this.permissions = new Mavo.Permissions();
    },

    get(url = new URL(this.url)) {
      url.searchParams.set('timestamp', Date.now()); // Ensure fresh copy

      return $.fetch(url.href).then(xhr => Promise.resolve(xhr.responseText), () => Promise.resolve(null));
    },

    load() {
      return this.ready
      .then(() => this.get())
      .then(response => {
        if (typeof response !== 'string') {
          // Backend did the parsing, we're done here
          return response;
        }

        response = response.replace(/^\ufeff/, ''); // Remove Unicode BOM

        return this.format.parse(response);
      });
    },

    store(data, {path, format = this.format} = {}) {
      return this.ready.then(() => {
        const serialize = typeof data === 'string' ? Promise.resolve(data) : format.stringify(data);

        return serialize.then(serialized => this.put(serialized, path).then(() => {
          return {data, serialized};
        }));
      });
    },

  // To be be overriden by subclasses
    ready: Promise.resolve(),
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    put: () => Promise.reject(),

    toString() {
      return `${this.id} (${this.url})`;
    },

    equals(backend) {
      return backend === this || (backend && this.id === backend.id && this.source === backend.source);
    },

    static: {
    // Return the appropriate backend(s) for this url
      create(url, o, type) {
        let Backend;

        if (type) {
          Backend = Mavo.Functions.get(_, type);
        }

        if (url && !Backend) {
          Backend = _.types.filter(Backend => Backend.test(url))[0] || _.Remote;
        }

        return Backend ? new Backend(url, o) : null;
      },

      types: [],

      register(Class) {
        _[Class.prototype.id] = Class;
        _.types.push(Class);
        return Class;
      }
    }
  });

/**
 * Save in an HTML element
 */
  _.register($.Class({
    id: 'Element',
    extends: _,
    constructor() {
      this.permissions.on(['read', 'edit', 'save']);

      this.element = $(this.source) || $.create('script', {
        type: 'application/json',
        id: this.source.slice(1),
        inside: document.body
      });
    },

    get() {
      return Promise.resolve(this.element.textContent);
    },

    put(serialized) {
      return Promise.resolve(this.element.textContent = serialized);
    },

    static: {
      test: url => url.indexOf('#') === 0
    }
  }));

// Load from a remote URL, no save
  _.register($.Class({
    id: 'Remote',
    extends: _,
    constructor() {
      this.permissions.on('read');
    },

    static: {
      test: () => false
    }
  }));

// Save in localStorage
  _.register($.Class({
    extends: _,
    id: 'Local',
    constructor() {
      this.permissions.on(['read', 'edit', 'save']);
      this.key = this.mavo.id;
    },

    get() {
      return Promise[this.key in localStorage ? 'resolve' : 'reject'](localStorage[this.key]);
    },

    put(serialized) {
      if (!serialized) {
        delete localStorage[this.key];
      } else {
        localStorage[this.key] = serialized;
      }

      return Promise.resolve(serialized);
    },

    static: {
      test: value => value === 'local'
    }
  }));
})(Bliss);
