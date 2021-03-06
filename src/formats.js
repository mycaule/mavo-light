/* global Mavo, Bliss */
/* eslint new-cap: "off" */

(function ($) {
  const _ = Mavo.Formats = {};

  const base = _.Base = $.Class({
    abstract: true,
    constructor(backend) {
      this.backend = backend;
    },
    proxy: {
      mavo: 'backend'
    },

  // So that child classes can only override the static methods if they don't
  // need access to any instance variables.
    parse(content) {
      return this.constructor.parse(content, this);
    },
    stringify(data) {
      return this.constructor.stringify(data, this);
    },

    static: {
      parse: serialized => Promise.resolve(serialized),
      stringify: data => Promise.resolve(data),
      extensions: [],
      dependencies: [],
      ready() {
        return Promise.all(this.dependencies.map(d => $.include(d.test(), d.url)));
      }
    }
  });

  const json = _.JSON = $.Class({
    extends: _.Base,
    static: {
      parse: serialized => Promise.resolve(serialized ? JSON.parse(serialized) : null),
      stringify: data => Promise.resolve(Mavo.toJSON(data)),
      extensions: ['.json', '.jsonld']
    }
  });

  const text = _.Text = $.Class({
    extends: _.Base,
    constructor(backend) {
      this.property = this.mavo.root.getNames('Primitive')[0];
    },

    static: {
      extensions: ['.txt'],
      parse: (serialized, me) => Promise.resolve({[me ? me.property : 'content']: serialized}),
      stringify: (data, me) => Promise.resolve(data[me ? me.property : 'content'])
    }
  });

  Object.defineProperty(_, 'create', {
    value(format, backend) {
      if (format && typeof format === 'object') {
        return format;
      }

      if (typeof format === 'string') {
      // Search by id
        format = format.toLowerCase();

        for (var id in _) {
          var Format = _[id];

          if (id.toLowerCase() === format) {
            return new Format(backend);
          }
        }
      }

      if (!format) {
        const url = backend.url ? backend.url.pathname : backend.source;
        const extension = Mavo.match(url, /\.\w+$/) || '.json';
        var Format = _.JSON;

        for (var id in _) {
          if (_[id].extensions.indexOf(extension) > -1) {
          // Do not return match, as we may find another match later
          // and last match wins
            Format = _[id];
          }
        }

        return new Format(backend);
      }
    }
  });
})(Bliss);
