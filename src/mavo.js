/* global Mavo, Bliss */
/* eslint new-cap: "off" */

/**
 * Mavo v%%VERSION%%
 */
(function ($, $$) {
  const _ = self.Mavo = $.Class({
    constructor(element) {
      this.treeBuilt = Mavo.defer();
      this.dataLoaded = Mavo.defer();

      this.element = element;

      this.inProgress = false;

    // Index among other mavos in the page, 1 is first
      this.index = Object.keys(_.all).length + 1;
      Object.defineProperty(_.all, this.index - 1, {value: this});

    // Convert any data-mv-* attributes to mv-*
      const selector = _.attributes.map(attribute => `[data-${attribute}]`).join(', ');

      [this.element, ...$$(selector, this.element)].forEach(element => {
        _.attributes.forEach(attribute => {
          const value = element.getAttribute('data-' + attribute);

          if (value !== null) {
            element.setAttribute(attribute, value);
          }
        });
      });

    // Assign a unique (for the page) id to this mavo instance
      this.id = Mavo.getAttribute(this.element, 'mv-app', 'id') || `mavo${this.index}`;

      if (this.id in _.all) {
      // Duplicate app name
        for (var i = 2; this.id + i in _.all; i++) {}
        this.id = this.id + i;
      }

      _.all[this.id] = this;
      this.element.setAttribute('mv-app', this.id);

      const lang = $.value(this.element.closest('[lang]'), 'lang');
      this.locale = 'en-US';

    // Should we start in edit mode?
      this.autoEdit = this.element.classList.contains('mv-autoedit');

    // Should we save automatically?
      this.autoSave = this.element.hasAttribute('mv-autosave');
      this.autoSaveDelay = (this.element.getAttribute('mv-autosave') || 3) * 1000;

      this.element.setAttribute('typeof', '');

      Mavo.hooks.run('init-start', this);

    // Apply heuristic for groups
      $$(_.selectors.primitive + ',' + _.selectors.multiple, this.element).forEach(element => {
        const hasChildren = $(`${_.selectors.not(_.selectors.formControl)}, ${_.selectors.property}`, element);

        if (hasChildren) {
          const config = Mavo.Primitive.getConfig(element);
          const isCollection = Mavo.is('multiple', element);

          if (isCollection || !config.attribute && !config.hasChildren) {
            element.setAttribute('typeof', '');
          }
        }
      });

      this.expressions = new Mavo.Expressions(this);

    // Build mavo objects
      Mavo.hooks.run('init-tree-before', this);

      this.root = new Mavo.Group(this.element, this);
      this.treeBuilt.resolve();

      Mavo.hooks.run('init-tree-after', this);

      this.permissions = new Mavo.Permissions();

      const backendTypes = ['source', 'storage', 'init']; // Order is significant!

    // Figure out backends for storage, data reads, and initialization respectively
      backendTypes.forEach(role => this.updateBackend(role));

      this.backendObserver = new Mavo.Observer(this.element, backendTypes.map(role => 'mv-' + role), records => {
        const changed = {};

        const roles = records.map(record => {
          const role = record.attributeName.replace(/^mv-/, '');
          changed[role] = this.updateBackend(role);

          return role;
        });

      // Do we need to re-load data?
        if (changed.source) {  // If source changes, always reload
          this.load();
        } else if (!this.source) {
          if (changed.storage || changed.init && !this.root.data) {
            this.load();
          }
        }
      });

      this.permissions.can('login', () => {
      // We also support a URL param to trigger login, in case the user doesn't want visible login UI
        if (Mavo.Functions.url('login') !== null && this.index === 1 || Mavo.Functions.url(this.id + '-login') !== null) {
          this.primaryBackend.login();
        }
      });

    // Update login status
      $.bind(this.element, 'mv-login.mavo', evt => {
        if (evt.backend === (this.source || this.storage)) {
        // If last time we rendered we got nothing, maybe now we'll have better luck?
          if (!this.root.data && !this.unsavedChanges) {
            this.load();
          }
        }
      });

      this.bar = new Mavo.UI.Bar(this);

    // Prevent editing properties inside <summary> to open and close the summary (fix bug #82)
      if ($('summary [property]:not([typeof])')) {
        this.element.addEventListener('click', evt => {
          if (evt.target != document.activeElement) {
            evt.preventDefault();
          }
        });
      }

    // Is there any control that requires an edit button?
      this.needsEdit = this.calculateNeedsEdit();

      this.setUnsavedChanges(false);

      this.permissions.onchange(({action, value}) => {
        let permissions = this.element.getAttribute('mv-permissions') || '';
        permissions = permissions.trim().split(/\s+/).filter(a => a != action);

        if (value) {
          permissions.push(action);
        }

        this.element.setAttribute('mv-permissions', permissions.join(' '));
      });

      if (this.needsEdit) {
        this.permissions.can(['edit', 'add', 'delete'], () => {
        // Observe entire tree for mv-mode changes
          this.modeObserver = new Mavo.Observer(this.element, 'mv-mode', records => {
            records.forEach(record => {
              const element = record.target;
              const nodes = _.Node.children(element);

              for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                let previousMode = node.mode,
                  mode;

                if (node.element === element) {
                // If attribute set directly on a Mavo node, then it forces it into that mode
                // otherwise, descendant nodes still inherit, unless they are also mode-restricted
                  mode = node.element.getAttribute('mv-mode');
                  node.modes = mode;
                } else {
                // Inherited
                  if (node.modes) {
                  // Mode-restricted, we cannot change to the other mode
                    continue;
                  }

                  mode = _.getStyle(node.element.parentNode, '--mv-mode');
                }

                node.mode = mode;

                if (previousMode != node.mode) {
                  node[node.mode === 'edit' ? 'edit' : 'done']();
                }
              }
            });
          }, {subtree: true});

          if (this.autoEdit) {
            this.edit();
          }
        }, () => { // Cannot
          this.modeObserver && this.modeObserver.destroy();
        });
      }

      if (this.storage || this.source) {
      // Fetch existing data
        this.permissions.can('read', () => this.load());
      } else {
      // No storage or source
        requestAnimationFrame(() => {
          this.dataLoaded.resolve();
          $.fire(this.element, 'mv-load');
        });
      }

    // Dynamic ids
      $.bind(this.element, 'mv-load.mavo', evt => {
        if (location.hash) {
          const callback = records => {
            const target = document.getElementById(location.hash.slice(1));

            if (target || !location.hash) {
              if (this.element.contains(target)) {
                requestAnimationFrame(() => { // Give the browser a chance to render
                  Mavo.scrollIntoViewIfNeeded(target);
                });
              }

              if (observer) {
                observer.destroy();
                observer = null;
              }
            }

            return target;
          };

          if (!callback()) {
          // No target, perhaps not yet?
            var observer = new Mavo.Observer(this.element, 'id', callback, {subtree: true});
          }
        }

        requestAnimationFrame(() => 1);
      });

      if (this.autoSave) {
        this.dataLoaded.then(evt => {
          const debouncedSave = _.debounce(() => {
            this.save();
          }, this.autoSaveDelay);

          const callback = evt => {
            if (evt.node.saved) {
              debouncedSave();
            }
          };

          requestAnimationFrame(() => {
            this.permissions.can('save', () => {
              $.bind(this.element, 'mv-change.mavo:autosave', callback);
            }, () => {
              $.unbind(this.element, 'mv-change.mavo:autosave', callback);
            });
          });
        });
      }

    // Keyboard navigation
      this.element.addEventListener('keydown', evt => {
      // Ctrl + S or Cmd + S to save
        if (this.permissions.save && evt.keyCode === 83 && evt[_.superKey] && !evt.altKey) {
          evt.preventDefault();
          this.save();
        } else if (evt.keyCode === 38 || evt.keyCode === 40) {
          let element = evt.target;

          if (element.matches('textarea, input[type=range], input[type=number]')) {
          // Arrow keys are meaningful here
            return;
          }

          if (element.matches('.mv-editor')) {
            var editor = true;
            element = element.parentNode;
          }

          const node = Mavo.Node.get(element);

          if (node && node.closestCollection) {
            const nextNode = node.getCousin(evt.keyCode === 38 ? -1 : 1, {wrap: true});

            if (nextNode) {
              if (editor && nextNode.editing) {
                nextNode.edit({immediately: true}).then(() => nextNode.editor.focus());
              } else {
                nextNode.element.focus();
              }

              evt.preventDefault();
            }
          }
        }
      });

      Mavo.hooks.run('init-end', this);
    },

    get editing() {
      return this.root.editing;
    },

    getData(o) {
      return this.root.getData(o);
    },

    toJSON() {
      return _.toJSON(this.getData());
    },

    error(message, ...log) {
      if (log.length > 0) {
        console.log(`%c${this.id}: ${message}`, 'color: red; font-weight: bold', ...log);
      }
    },

    render(data) {
      this.expressions.active = false;

      const env = {context: this, data};
      _.hooks.run('render-start', env);

      if (env.data) {
        this.root.render(env.data);
      }

      this.unsavedChanges = false;

      this.expressions.active = true;
      requestAnimationFrame(() => this.expressions.update());

      _.hooks.run('render-end', env);
    },

    edit() {
      this.root.edit();

      $.bind(this.element, 'mouseenter.mavo:edit mouseleave.mavo:edit', evt => {
        if (evt.target.matches(_.selectors.multiple)) {
          evt.target.classList.remove('mv-has-hovered-item');

          const parent = evt.target.parentNode.closest(_.selectors.multiple);

          if (parent) {
            parent.classList.toggle('mv-has-hovered-item', evt.type === 'mouseenter');
          }
        }
      }, true);

      this.setUnsavedChanges();
    },

  /**
   * Set this mavo instance’s unsavedChanges flag.
   * @param {Boolean} [value]
   *        If true, just sets the flag to true, no traversal.
   *        If false, sets the flag of the Mavo instance and every tree node to false
   *        If not provided, traverses the tree and recalculates the flag value.
   */
    setUnsavedChanges(value) {
      let unsavedChanges = Boolean(value);

      if (!value) {
        this.walk(obj => {
          if (obj.unsavedChanges) {
            unsavedChanges = true;

            if (value === false) {
              obj.unsavedChanges = false;
            }

            return false;
          }
        });
      }

      return this.unsavedChanges = unsavedChanges;
    },

  // Conclude editing
    done() {
      this.root.done();
      $.unbind(this.element, '.mavo:edit');
      this.unsavedChanges = false;
    },

  /**
   * Update the backend for a given role
   * @return {Boolean} true if a change occurred, false otherwise
   */
    updateBackend(role) {
      let previous = this[role],
        backend;

      if (this.index === 1) {
        backend = _.Functions.url(role);
      }

      if (!backend) {
        backend = _.Functions.url(`${this.id}-${role}`) || this.element.getAttribute('mv-' + role) || null;
      }

      if (backend) {
        backend = backend.trim();

        if (backend === 'none') {
          backend = null;
        }
      }

      if (backend && (!previous || !previous.equals(backend))) {
      // We have a string, convert to a backend object if different than existing
        this[role] = backend = _.Backend.create(backend, {
          mavo: this,
          format: this.element.getAttribute(`mv-${role}-format`) || this.element.getAttribute('mv-format')
        }, this.element.getAttribute(`mv-${role}-type`));
      } else if (!backend) {
      // We had a backend and now we will un-have it
        this[role] = null;
      }

      const changed = backend ? !backend.equals(previous) : Boolean(previous);

      if (changed) {
      // A change occured
        if (!this.storage && !this.source && this.init) {
        // If init is present with no storage and no source, init is equivalent to source
          this.source = this.init;
          this.init = null;
        }

        const permissions = this.storage ? this.storage.permissions : new Mavo.Permissions({edit: true, save: false});
        permissions.parent = this.source && this.source.permissions;
        this.permissions.parent = permissions;

        this.primaryBackend = this.storage || this.source;
      }

      return changed;
    },

  /**
   * Load - Fetch data from source and render it.
   *
   * @return {Promise}  A promise that resolves when the data is loaded.
   */
    load() {
      let backend = this.source || this.storage;

      if (!backend) {
        return Promise.resolve();
      }

      this.inProgress = 'Loading';

      return backend.ready.then(() => backend.load())
    .catch(err => {
      // Try again with init
      if (this.init && this.init != backend) {
        backend = this.init;
        return this.init.ready.then(() => this.init.load());
      }

      // No init, propagate error
      return Promise.reject(err);
    })
    .catch(err => {
      if (err) {
        const xhr = err instanceof XMLHttpRequest ? err : err.xhr;

        if (xhr && xhr.status === 404) {
          this.render(null);
        } else {
          let message = 'problem-loading';

          if (xhr) {
            message += xhr.status ? 'http-error' : ': cant-connect';
          }

          this.error(message, err);
        }
      }
      return null;
    })
    .then(data => this.render(data))
    .then(() => {
      this.inProgress = false;
      requestAnimationFrame(() => {
        this.dataLoaded.resolve();
        $.fire(this.element, 'mv-load');
      });
    });
    },

    store() {
      if (!this.storage) {
        return Promise.resolve();
      }

      this.inProgress = 'Saving';

      return this.storage.store(this.getData())
      .catch(err => {
        if (err) {
          let message = 'problem-saving';

          if (err instanceof XMLHttpRequest) {
            message += ': ' + (err.status ? 'http-error' : 'cant-connect');
          }

          this.error(message, err);
        }

        return null;
      })
      .then(saved => {
        this.inProgress = false;
        return saved;
      });
    },

    save() {
      return this.store().then(saved => {
        if (saved) {
          $.fire(this.element, 'mv-save', saved);

          this.lastSaved = Date.now();
          this.root.save();
          this.unsavedChanges = false;
        }
      });
    },

    walk() {
      return this.root.walk(...arguments);
    },

    calculateNeedsEdit(test) {
      let needsEdit = false;

      this.walk((obj, path) => {
        if (needsEdit) {
        // If already true, no need to descend further
          return false;
        }

      // True if both modes are allowed and node is not group
        needsEdit = !obj.modes && obj.nodeType != 'Group';

        return !obj.modes;
      }, undefined, {descentReturn: true});

      return needsEdit;
    },

    live: {
      inProgress(value) {
        $.toggleAttribute(this.element, 'mv-progress', value, value);
        $.toggleAttribute(this.element, 'aria-busy', Boolean(value), Boolean(value));
        this.element.style.setProperty('--mv-progress-text', value ? `"${value}"` : '');
      },

      unsavedChanges(value) {
        this.element.classList.toggle('mv-unsaved-changes', value);
      },

      needsEdit(value) {
        this.bar.toggle('edit', value && this.permissions.edit);
      },

      storage(value) {
        if (value !== this._storage && !value) {
          const permissions = new Mavo.Permissions({edit: true, save: false});
          permissions.parent = this.permissions.parent;
          this.permissions.parent = permissions;
        }
      },

      primaryBackend(value) {
        value = value || null;

        if (value != this._primaryBackend) {
          return value;
        }
      },

      uploadBackend: {
        get() {
          if (this.storage && this.storage.upload) {
          // Prioritize storage
            return this.storage;
          }
        }
      }
    },

    static: {
      version: '%%VERSION%%',

      all: {},

      get(id) {
        if (id instanceof Element) {
        // Get by element
          for (var name in _.all) {
            if (_.all[name].element === id) {
              return _.all[name];
            }
          }

          return null;
        }

        var name = typeof id === 'number' ? Object.keys(_.all)[id] : id;

        return _.all[name] || null;
      },

      superKey: navigator.platform.indexOf('Mac') === 0 ? 'metaKey' : 'ctrlKey',
      base: location.protocol === 'about:' ? (document.currentScript ? document.currentScript.src : 'http://mavo.io') : location,
      dependencies: [],

      init(container = document) {
        const mavos = Array.isArray(arguments[0]) ? arguments[0] : $$(_.selectors.init, container);

        const ret = mavos.filter(element => !_.get(element)) // Not already inited
        .map(element => new _(element));

        return ret;
      },

      UI: {},

      hooks: new $.Hooks(),

      attributes: [
        'mv-app', 'mv-storage', 'mv-source', 'mv-init', 'mv-path', 'mv-multiple-path', 'mv-format',
        'mv-attribute', 'mv-default', 'mv-mode', 'mv-edit', 'mv-permisssions',
        'mv-rel', 'mv-value'
      ],

      lazy: {
        locale: () => document.documentElement.lang || 'en-US',
        toNode: () => Symbol('toNode')
      }
    }
  });

  Object.defineProperty(_.all, 'length', {
    get() {
      return Object.keys(this).length;
    }
  });

  {
    const s = _.selectors = {
      init: '.mv-app, [mv-app], [data-mv-app]',
      property: '[property], [itemprop]',
      specificProperty: name => `[property=${name}], [itemprop=${name}]`,
      group: '[typeof], [itemscope], [itemtype], [mv-group]',
      multiple: '[mv-multiple]',
      formControl: 'input, select, option, textarea',
      textInput: ['text', 'email', 'url', 'tel', 'search'].map(t => `input[type=${t}]`).join(', ') + ', input:not([type]), textarea',
      ui: '.mv-ui',
      container: {
    // "li": "ul, ol",
        tr: 'table',
        option: 'select'
    // "dt": "dl",
    // "dd": "dl"
      }
    };

    const arr = s.arr = selector => selector.split(/\s*,\s*/g);
    const not = s.not = selector => arr(selector).map(s => `:not(${s})`).join('');
    const or = s.or = (selector1, selector2) => selector1 + ', ' + selector2;
    const and = s.and = (selector1, selector2) => {
      let ret = [],
        arr2 = arr(selector2);

      arr(selector1).forEach(s1 => ret.push(...arr2.map(s2 => s1 + s2)));

      return ret.join(', ');
    };
    const andNot = s.andNot = (selector1, selector2) => and(selector1, not(selector2));

    $.extend(_.selectors, {
      primitive: andNot(s.property, s.group),
      rootGroup: andNot(s.group, s.property),
      item: or(s.multiple, s.group),
      output: or(s.specificProperty('output'), '.mv-output')
    });
  }

// Init mavo. Async to give other scripts a chance to modify stuff.
  requestAnimationFrame(() => {
    const polyfills = [];

    $.each({
      blissfuljs: Array.from && document.documentElement.closest && self.URL && 'searchParams' in URL.prototype,
      'Intl.~locale.en': self.Intl,
      IntersectionObserver: self.IntersectionObserver,
      Symbol: self.Symbol,
      'Element.prototype.remove': Element.prototype.remove
    }, (id, supported) => {
      if (!supported) {
        polyfills.push(id);
      }
    });

    const polyfillURL = 'https://cdn.polyfill.io/v2/polyfill.min.js?unknown=polyfill&features=' + polyfills.map(a => a + '|gated').join(',');

    _.dependencies.push(
      $.include(!polyfills.length, polyfillURL)
    );

    _.inited = $.ready().then(() => {
      $.attributes($$(_.selectors.init), {'mv-progress': 'Loading'});
      return _.ready;
    })
  .catch(console.error)
  .then(() => Mavo.init());

    _.ready = _.thenAll(_.dependencies);
  });

// Define $ and $$ if they are not already defined
// Primarily for backwards compat since we used to use Bliss Full.
  self.$ = self.$ || $;
  self.$$ = self.$$ || $$;
})(Bliss, Bliss.$);
