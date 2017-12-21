/* global Mavo, Bliss */

(function ($, $$) {
  const _ = $.extend(Mavo, {
  /**
   * Load a file, only once
   */
    load: (url, base = document.currentScript ? document.currentScript.src : location) => {
      _.loaded = _.loaded || new Set();

      if (_.loaded.has(String(url))) {
        return;
      }

      url = new URL(url, base);

      if (/\.css$/.test(url.pathname)) {
      // CSS file
        $.create('link', {
          href: url,
          rel: 'stylesheet',
          inside: document.head
        });

      // No need to wait for stylesheets
        return Promise.resolve();
      }

    // JS file
      return $.include(url);
    },

    readFile: (file, format = 'DataURL') => {
      const reader = new FileReader();

      return new Promise((resolve, reject) => {
        reader.onload = f => resolve(reader.result);
        reader.onerror = reader.onabort = reject;
        reader['readAs' + format](file);
      });
    },

    toJSON: data => {
      if (data === null) {
        return '';
      }

      if (typeof data === 'string') {
      // Do not stringify twice!
        return data;
      }

      return JSON.stringify(data, null, '\t');
    },

  /**
   * ToJSON without cycles
   */
    safeToJSON(o) {
      const cache = self.WeakSet ? new WeakSet() : new Set();

      return JSON.stringify(o, (key, value) => {
        if (typeof value === 'object' && value !== null) {
        // No circular reference found

          if (cache.has(value)) {
            return; // Circular reference found!
          }

          cache.add(value);
        }

        return value;
      });
    },

    objectify: (value, properties) => {
      const primitive = Mavo.value(value);

      if (typeof value !== 'object' || value === null) {
        if (value === null) {
          value = {
            [Symbol.toStringTag]: 'Null',
            toJSON: () => null
          };
        } else {
          const constructor = value.constructor;
          value = new constructor(primitive);
          value[Symbol.toStringTag] = constructor.name;
        }

        value.valueOf = value[Symbol.toPrimitive] = () => primitive;
      }

      return $.extend(value, properties);
    },

    value: value => value && value.valueOf ? value.valueOf() : value,

  /**
   * Array & set utlities
   */

  // If the passed value is not an array, convert to an array
    toArray: arr => {
      return arr === undefined ? [] : Array.isArray(arr) ? arr : [arr];
    },

    delete: (arr, element, all) => {
      do {
        const index = arr && arr.indexOf(element);

        if (index > -1) {
          arr.splice(index, 1);
        }
      } while (index > -1 && all);
    },

  // Recursively flatten a multi-dimensional array
    flatten: arr => {
      if (!Array.isArray(arr)) {
        return [arr];
      }

      return arr.reduce((prev, c) => _.toArray(prev).concat(_.flatten(c)), []);
    },

  // Push an item to an array iff it's not already in there
    pushUnique: (arr, item) => {
      if (arr.indexOf(item) === -1) {
        arr.push(item);
      }
    },

    union: (set1, set2) => {
      return new Set([...(set1 || []), ...(set2 || [])]);
    },

  /**
   * DOM element utilities
   */

    is(thing, ...elements) {
      for (let i = 0, element; i < elements.length; i++) {
        element = elements[i];

        if (element && element.matches && element.matches(_.selectors[thing])) {
          return true;
        }
      }

      return false;
    },

  /**
   * Get the current value of a CSS property on an element
   */
    getStyle: (element, property) => {
      if (element) {
        const value = getComputedStyle(element).getPropertyValue(property);

        if (value) {
          return value.trim();
        }
      }
    },
  /**
   * Get/set data on an element
   */
    data(element, name, value) {
      let data = _.elementData.get(element) || {},
        ret;

      if (arguments.length === 2) {
        ret = data[name];
      } else if (value === undefined) {
        delete data[name];
      } else {
        ret = data[name] = value;
      }

      _.elementData.set(element, data);
      return ret;
    },

    elementData: new WeakMap(),

  /**
   * Get node from path or get path of a node to an ancestor
   * For maximum robustness, all but the last path segment refer to elements only.
   * The last part of the path is a decimal: the integer part of the decimal is element index,
   * the decimal part is node index *after* that element and starts from 1.
   * If the node has no previous element sibling, the integer part of the index will be -1.
   */
    elementPath(ancestor, element) {
      if (Array.isArray(element)) {
      // Get element by path
        const path = element;

        let ret = path.reduce((acc, cur) => {
          return acc.children[cur >> 0] || acc;
        }, ancestor);

        const last = path[path.length - 1];

        if (last != (last >> 0)) {
        // We are returning a non-element node
          let offset = Number((String(last)).split('.')[1]);

          if (last >> 0 < 0) {
            ret = ret.firstChild;
            offset--;
          }

          for (let i = 0; i < offset; i++) {
            ret = ret.nextSibling;
          }
        }

        return ret;
      }
      // Get path
      const path = [];

      for (let parent = element; parent && parent != ancestor; parent = parent.parentNode) {
        let index = 0;
        let countNonElementSiblings = parent === element && element.nodeType !== 1;
        let offset = countNonElementSiblings ? 1 : 0;
        let sibling = parent;

        while (sibling = sibling[`previous${countNonElementSiblings ? '' : 'Element'}Sibling`]) {
          if (countNonElementSiblings) {
            offset++;

            if (sibling.nodeType === 1) {
              countNonElementSiblings = false;
            }
          } else {
            index++;
          }
        }

        if (offset > 0) {
          index = index - 1 + '.' + offset;
        }

        path.unshift(index);
      }

      return parent ? path : null;
    },

  /**
   * Revocably add/remove elements from the DOM
   */
    revocably: {
      add(element, parent) {
        const comment = _.revocably.isRemoved(element);

        if (comment && comment.parentNode) {
          comment.parentNode.replaceChild(element, comment);
        } else if (element && parent && !element.parentNode) {
        // Has not been revocably removed because it has never even been added
          parent.appendChild(element);
        }

        return comment;
      },

      remove(element, commentText) {
        if (!element) {
          return;
        }

        let comment = _.data(element, 'commentstub');

        if (!comment) {
          commentText = commentText || element.id || element.className || element.nodeName;
          comment = _.data(element, 'commentstub', document.createComment(commentText));
        }

        if (element.parentNode) {
        // In DOM, remove
          element.parentNode.replaceChild(comment, element);
        }

        return comment;
      },

      isRemoved(element) {
        if (!element || element.parentNode) {
          return false;
        }

        const comment = _.data(element, 'commentstub');

        if (comment && comment.parentNode) {
          return comment;
        }

        return false;
      },

      setAttribute(element, attribute, value) {
        const previousValue = _.data(element, 'attribute-' + attribute);

        if (previousValue === undefined) {
        // Only set this when there's no old value stored, otherwise
        // if called multiple times, it could result in losing the original value
          _.data(element, 'attribute-' + attribute, element.getAttribute(attribute));
        }

        element.setAttribute(attribute, value);
      },

      restoreAttribute(element, attribute) {
        const previousValue = _.data(element, 'attribute-' + attribute);

        if (previousValue !== undefined) {
          $.toggleAttribute(element, attribute, previousValue);
          _.data(element, 'attribute-' + attribute, undefined);
        }
      }
    },

    inView: {
      is: element => {
        const r = element.getBoundingClientRect();

        return (r.bottom >= 0 && r.bottom <= innerHeight || r.top >= 0 && r.top <= innerHeight) && // Vertical
             (r.right >= 0 && r.right <= innerWidth || r.left >= 0 && r.left <= innerWidth); // Horizontal
      },

      when: element => {
        const observer = _.inView.observer = _.inView.observer || new IntersectionObserver(function (entries) {
          entries.forEach(entry => {
            this.unobserve(entry.target);
            $.fire(entry.target, 'mv-inview', {entry});
          });
        });

        return new Promise(resolve => {
          if (_.is(element)) {
            resolve();
          }

          observer.observe(element);

          const callback = evt => {
            element.removeEventListener('mv-inview', callback);
            evt.stopPropagation();
            resolve();
          };

          element.addEventListener('mv-inview', callback);
        });
      }
    },

    scrollIntoViewIfNeeded: element => {
      if (element && !Mavo.inView.is(element)) {
        element.scrollIntoView({behavior: 'smooth'});
      }
    },

  /**
   * Set attribute only if it doesn’t exist
   */
    setAttributeShy(element, attribute, value) {
      if (!element.hasAttribute(attribute)) {
        element.setAttribute(attribute, value);
      }
    },

  /**
   * Get the value of an attribute, with fallback attributes in priority order.
   */
    getAttribute(element, ...attributes) {
      for (let i = 0, attribute; attribute = attributes[i]; i++) {
        const value = element.getAttribute(attribute);

        if (value) {
          return value;
        }
      }

      return null;
    },

  /**
   * Get the element identified by the URL hash
   */
    getTarget() {
      const id = location.hash.substr(1);
      return document.getElementById(id);
    },

  /**
   * Object utilities
   */

  /**
   * Check if property exists in object. Like the in operator but more robust and does not throw.
   * Why not just in? E.g. "foo".length is 3 but "length" in "foo" throws
   */
    in(obj, property) {
      if (obj) {
        return (typeof obj === 'object' && property in obj) || obj[property] !== undefined;
      }
    },

  /**
   * Get real property name from case insensitive property
   */
    getCanonicalProperty(obj, property) {
      if (obj && (property || property === 0)) {
      // Property in object?
        if (_.in(obj, property)) {
          return property;
        }

        if (property.toLowerCase) {
        // Lowercase property in object?
          const propertyL = property.toLowerCase();

          if (_.in(obj, propertyL)) {
            return propertyL;
          }

        // Any case property in object?
          const properties = Object.keys(obj);
          const i = properties.map(p => p.toLowerCase()).indexOf(propertyL);

          if (i > -1) {
            return properties[i];
          }
        }
      }
    },

    subset(obj, path, value) {
      if (arguments.length === 3) {
      // Put
        if (path.length) {
          const last = path[path.length - 1];
          const parent = $.value(obj, ...path.slice(0, -1));

          if (Array.isArray(parent) && Array.isArray(value)) {
          // Merge arrays instead of adding array inside array
            parent.splice(last, 1, ...value);
          } else if (parent) {
            parent[path[path.length - 1]] = value;
          }

          return obj;
        }

        return value;
      } else if (typeof obj === 'object' && path && path.length) { // Get
        return path.reduce((obj, property, i) => {
          const meta = {};
          let ret = Mavo.Functions.get(obj, property, meta);

        // We don't yet support multiple properties at the same level
        // i.e. the path can't be for the 2nd and 3rd item
          path[i] = Array.isArray(meta.property) ? meta.property[0] : meta.property;

          if (ret === undefined && meta.query) {
          // Not found, return dummy if query
            ret = {[meta.query.property]: meta.query.value};
          }

          return ret;
        }, obj);
      }

      return obj;
    },

    clone(o) {
      return JSON.parse(_.safeToJSON(o));
    },

  // Credit: https://remysharp.com/2010/07/21/throttling-function-calls
    debounce(fn, delay) {
      if (!delay) {
      // No throttling
        return fn;
      }

      let timer = null,
        code;

      return function () {
        let context = this,
          args = arguments;

        code = function () {
          fn.apply(context, args);
          removeEventListener('beforeunload', code);
        };

        clearTimeout(timer);
        timer = setTimeout(code, delay);
        addEventListener('beforeunload', code);
      };
    },

    timeout: delay => new Promise(resolve => setTimeout(resolve, delay)),

    escapeRegExp: s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'),

    matches: (str, regex) => {
      const ret = (String(str)).match(regex);
      return ret ? ret : [];
    },

    match: (str, regex, i = 0) => _.matches(str, regex)[i] || '',

    observeResize(element, callbackOrObserver) {
      if (!self.ResizeObserver) {
        return;
      }

      let previousRect = null;
      const ro = callbackOrObserver instanceof ResizeObserver ? callbackOrObserver : new ResizeObserver(entries => {
        const contentRect = entries[entries.length - 1].contentRect;

        if (previousRect &&
        previousRect.width === contentRect.width &&
        previousRect.height === contentRect.height) {
          return;
        }

        callbackOrObserver(entries);

        previousRect = contentRect;
      });

      ro.observe(element);

      return ro;
    },

    Observer: $.Class({
      constructor(element, attribute, callback, o = {}) {
        if (callback instanceof MutationObserver) {
          this.observer = callback;
        }

        this.observer = this.observer || new MutationObserver(callback);
        this.element = element;
        this.callback = callback;
        this.attribute = attribute;

        this.options = $.extend({}, o);

        if (attribute) {
          $.extend(this.options, {
            attributes: true,
            attributeFilter: this.attribute === 'all' ? undefined : Mavo.toArray(this.attribute),
            attributeOldValue: Boolean(o.oldValue)
          });
        }

        if (!this.attribute || this.attribute === 'all') {
          $.extend(this.options, {
            characterData: true,
            childList: true,
            subtree: true,
            characterDataOldValue: Boolean(o.oldValue)
          });
        }

        this.run();
      },

      stop() {
        if (this.observer) {
          this.observer.disconnect();
        }

        this.running = false;

        return this;
      },

      run() {
        if (this.observer) {
          this.observer.observe(this.element, this.options);
          this.running = true;
        }

        return this;
      },

    /**
     * Disconnect an observer, run some code, then observe again
     */
      sneak(callback) {
        if (this.running) {
          this.stop();
          const ret = callback();
          this.run();
        } else {
          var ret = callback();
        }

        return ret;
      },

      destroy() {
        this.stop();
        this.observer = this.element = null;
      },

      static: {
        sneak(observer, callback) {
          return observer ? observer.sneak(callback) : callback();
        }
      }
    }),

    defer(constructor) {
      let res, rej;

      const promise = new Promise((resolve, reject) => {
        if (constructor) {
          constructor(resolve, reject);
        }

        res = resolve;
        rej = reject;
      });

      promise.resolve = a => {
        res(a);
        return promise;
      };

      promise.reject = a => {
        rej(a);
        return promise;
      };

      return promise;
    },

  /**
   * Similar to Promise.all() but can handle post-hoc additions
   * and does not reject if one promise rejects.
   */
    thenAll(iterable) {
    // Turn rejected promises into resolved ones
      $$(iterable).forEach(promise => {
        if ($.type(promise) === 'promise') {
          promise = promise.catch(err => err);
        }
      });

      return Promise.all(iterable).then(resolved => {
        if (iterable.length != resolved.length) {
        // The list of promises or values changed. Return a new Promise.
        // The original promise won't resolve until the new one does.
          return _.thenAll(iterable);
        }

      // The list of promises or values stayed the same.
      // Return results immediately.
        return resolved;
      });
    },

  /**
   * Run & Return a function
   */
    rr(f) {
      f();
      return f;
    },

  // Get out of bounds array index to wrap around
    wrap: (index, length) => index < 0 ? length - 1 : index >= length ? 0 : index,

  /**
   * Parses a simple CSS-like text format for declaring key-value options:
   * Pairs are comma or semicolon-separated, key and value are colon separated.
   * Escapes are supported, via backslash. Useful for attributes.
   */
    options: str => {
      const ret = {};

      (str.trim().match(/(?:\\[,;]|[^,;])+/g) || []).forEach(option => {
        if (option) {
          option = option.trim().replace(/\\([,;])/g, '$1');
          const pair = option.match(/^\s*((?:\\:|[^:])+?)\s*:\s*(.+)$/);

          if (pair) {
            ret[pair[1].replace(/\\:/g, ':')] = pair[2];
          } else {
          // If no value, it's boolean
            ret[option] = true;
          }
        }
      });

      return ret;
    }
  });

// Bliss plugins

  $.add('toggleAttribute', function (name, value, test = value !== null) {
    if (test) {
      this.setAttribute(name, value);
    } else {
      this.removeAttribute(name);
    }
  });

// Provide shortcuts to long property chains
  $.proxy = $.classProps.proxy = $.overload((obj, property, proxy) => {
    Object.defineProperty(obj, property, {
      get() {
        return this[proxy][property];
      },
      set(value) {
        this[proxy][property] = value;
      },
      configurable: true,
      enumerable: true
    });

    return obj;
  });

  $.classProps.propagated = function (proto, names) {
    Mavo.toArray(names).forEach(name => {
      const existing = proto[name];

      proto[name] = function () {
        const ret = existing && existing.apply(this, arguments);

        if (this.propagate && ret !== false) {
          this.propagate(name);
        }
      };
    });
  };

// :target-within shim
  function updateTargetWithin() {
    let element = _.getTarget();
    const cl = 'mv-target-within';

    $$('.' + cl).forEach(el => el.classList.remove(cl));

    while (element && element.classList) {
      element.classList.add(cl);
      element = element.parentNode;
    }
  }

  addEventListener('hashchange', updateTargetWithin);
  const idObserver = new Mavo.Observer(document.documentElement, 'id', updateTargetWithin);
})(Bliss, Bliss.$);
