/* global Mavo, Bliss */

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

    isAuthenticated() {
      return Boolean(this.accessToken);
    },

  // Any extra params to be passed to the oAuth URL.
    oAuthParams: () => '',

    toString() {
      return `${this.id} (${this.url})`;
    },

    equals(backend) {
      return backend === this || (backend && this.id === backend.id && this.source === backend.source);
    },

  /**
   * Helper for making OAuth requests with JSON-based APIs.
   */
    request(call, data, method = 'GET', req = {}) {
      req.method = req.method || method;
      req.responseType = req.responseType || 'json';

      req.headers = $.extend({
        'Content-Type': 'application/json; charset=utf-8'
      }, req.headers || {});

      req.data = data;

      if (this.isAuthenticated()) {
        req.headers.Authorization = req.headers.Authorization || `Bearer ${this.accessToken}`;
      }

      if ($.type(req.data) === 'object') {
        if (req.method === 'GET') {
          req.data = Object.keys(req.data).map(p => p + '=' + encodeURIComponent(req.data[p])).join('&');
        } else {
          req.data = JSON.stringify(req.data);
        }
      }

      call = new URL(call, this.constructor.apiDomain);

    // Prevent getting a cached response. Cache-control is often not allowed via CORS
      if (req.method === 'GET') {
        call.searchParams.set('timestamp', Date.now());
      }

      return $.fetch(call, req)
      .catch(err => {
        if (err && err.xhr) {
          return Promise.reject(err.xhr);
        }

        this.mavo.error('Something went wrong while connecting to ' + this.id, err);
      })
      .then(xhr => req.method === 'HEAD' ? xhr : xhr.response);
    },

  /**
   * Helper method for authenticating in OAuth APIs
   */
    oAuthenticate(passive) {
      return this.ready.then(() => {
        if (this.isAuthenticated()) {
          return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
          const id = this.id.toLowerCase();

          if (passive) {
            this.accessToken = localStorage[`mavo:${id}token`];

            if (this.accessToken) {
              resolve(this.accessToken);
            }
          } else {
          // Show window
            const popup = {
              width: Math.min(1000, innerWidth - 100),
              height: Math.min(800, innerHeight - 100)
            };

            popup.top = (screen.height - popup.height) / 2;
            popup.left = (screen.width - popup.width) / 2;

            const state = {
              url: location.href,
              backend: this.id
            };

            this.authPopup = open(`${this.constructor.oAuth}?client_id=${this.key}&state=${encodeURIComponent(JSON.stringify(state))}` + this.oAuthParams(),
            'popup', `width=${popup.width},height=${popup.height},left=${popup.left},top=${popup.top}`);

            if (!this.authPopup) {
              const message = 'Login popup was blocked! Please check your popup blocker settings.';
              this.mavo.error(message);
              reject(Error(message));
            }

            addEventListener('message', evt => {
              if (evt.source === this.authPopup) {
                if (evt.data.backend === this.id) {
                  this.accessToken = localStorage[`mavo:${id}token`] = evt.data.token;
                }

                if (!this.accessToken) {
                  reject(Error('Authentication error'));
                }

                resolve(this.accessToken);

              // Log in to other similar backends that are logged out
                for (const appid in Mavo.all) {
                  const storage = Mavo.all[appid].primaryBackend;

                  if (storage &&
                  storage.id === this.id &&
                  storage !== this &&
                  !storage.isAuthenticated()) {
                    storage.login(true);
                  }
                }
              }
            });
          }
        });
      });
    },

  /**
   * OAuth logout helper
   */
    oAuthLogout() {
      if (this.isAuthenticated()) {
        const id = this.id.toLowerCase();

        localStorage.removeItem(`mavo:${id}token`);
        delete this.accessToken;

        this.permissions.off(['edit', 'add', 'delete', 'save']).on('login');

        $.fire(this.mavo.element, 'mv-logout', {backend: this});
      }

      return Promise.resolve();
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
      test: url => false
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
