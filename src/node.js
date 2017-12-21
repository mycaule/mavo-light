/* global Mavo, Bliss */

(function ($, $$) {
  const _ = Mavo.Node = $.Class({
    abstract: true,
    constructor(element, mavo, options = {}) {
      if (!element || !mavo) {
        throw new Error('Mavo.Node constructor requires an element argument and a mavo object');
      }

      const env = {context: this, options};

    // Set these first, for debug reasons
      this.uid = ++_.maxId;
      this.nodeType = this.nodeType;
      this.property = null;
      this.element = element;

      $.extend(this, env.options);

      _.all.set(element, [...(_.all.get(this.element) || []), this]);

      this.mavo = mavo;
      this.group = this.parentGroup = env.options.group;

      this.template = env.options.template;

      this.alias = this.element.getAttribute('mv-alias');

      if (this.template) {
        this.template.copies.push(this);
      } else {
      // First (or only) of its kind
        this.copies = [];
      }

      if (!this.fromTemplate('property', 'type')) {
        this.property = _.getProperty(element);
        this.type = Mavo.Group.normalize(element);
        this.storage = this.element.getAttribute('mv-storage');
      }

      this.modes = this.element.getAttribute('mv-mode');

      Mavo.hooks.run('node-init-start', env);

      this.mode = Mavo.getStyle(this.element, '--mv-mode') || 'read';

      this.collection = env.options.collection;

      if (this.collection) {
      // This is a collection item
        this.group = this.parentGroup = this.collection.parentGroup;
      }

    // Must run before collections have a marker which messes up paths
      const template = this.template;

      if (template && template.expressions) {
      // We know which expressions we have, don't traverse again
        this.expressions = template.expressions.map(et => new Mavo.DOMExpression({
          template: et,
          item: this,
          mavo: this.mavo
        }));
      }

      if (this instanceof Mavo.Group || this.collection) {
      // Handle mv-value
      // TODO integrate with the code in Primitive that decides whether this is a computed property
        const et = Mavo.DOMExpression.search(this.element).filter(et => et.originalAttribute === 'mv-value')[0];

        if (et) {
          et.mavoNode = this;
          this.expressionText = et;
          this.storage = this.storage || 'none';
          this.modes = 'read';

          if (this.collection) {
            this.collection.expressions = [...(this.collection.expressions || []), et];
            et.mavoNode = this.collection;
            this.collection.storage = this.collection.storage || 'none';
            this.collection.modes = 'read';
          }
        }
      }

      Mavo.hooks.run('node-init-end', env);
    },

    get editing() {
      return this.mode === 'edit';
    },

    get isRoot() {
      return !this.property;
    },

    get name() {
      return Mavo.Functions.readable(this.property || this.type).toLowerCase();
    },

    get saved() {
      return this.storage !== 'none';
    },

    get parent() {
      return this.collection || this.parentGroup;
    },

  /**
   * Runs after the constructor is done (including the constructor of the inheriting class), synchronously
   */
    postInit() {
      if (this.modes === 'edit') {
        this.edit();
      }
    },

    destroy() {
      if (this.template) {
        Mavo.delete(this.template.copies, this);
      }

      if (this.expressions) {
        this.expressions.forEach(expression => expression.destroy());
      }

      if (this.itembar) {
        this.itembar.destroy();
      }
    },

    getData(o = {}) {
      if (this.isDataNull(o)) {
        return o.forceObjects ? Mavo.objectify(null) : null;
      }
    },

    isDataNull(o) {
      const env = {
        context: this,
        options: o,
        result: this.deleted || !this.saved && !o.live
      };

      Mavo.hooks.run('unit-isdatanull', env);

      return env.result;
    },

  /**
   * Execute a callback on every node of the Mavo tree
   * If callback returns (strict) false, walk stops.
   * @param callback {Function}
   * @param path {Array} Initial path. Mostly used internally.
   * @param o {Object} Options:
   *       - descentReturn {Boolean} If callback returns false, just don't descend
   * @return false if was stopped via a false return value, true otherwise
   */
    walk(callback, path = [], o = {}) {
      var walker = (obj, path) => {
        var ret = callback(obj, path);

        if (ret !== false) {
          for (const i in obj.children) {
            const node = obj.children[i];

            if (node instanceof Mavo.Node) {
              var ret = walker.call(node, node, [...path, i]);

              if (ret === false && !o.descentReturn) {
                return false;
              }
            }
          }
        }

        return ret !== false;
      };

      return walker(this, path);
    },

    walkUp(callback) {
      let group = this;

      while (group = group.parentGroup) {
        const ret = callback(group);

        if (ret !== undefined) {
          return ret;
        }
      }
    },

    edit() {
      this.mode = 'edit';

      if (this.mode != 'edit') {
        return false;
      }

      $.fire(this.element, 'mv-edit', {
        mavo: this.mavo,
        node: this
      });

      Mavo.hooks.run('node-edit-end', this);
    },

    done() {
      this.mode = Mavo.getStyle(this.element.parentNode, '--mv-mode') || 'read';

      if (this.mode != 'read') {
        return false;
      }

      $.unbind(this.element, '.mavo:edit');

      $.fire(this.element, 'mv-done', {
        mavo: this.mavo,
        node: this
      });

      this.propagate('done');

      Mavo.hooks.run('node-done-end', this);
    },

    propagate(callback) {
      for (const i in this.children) {
        const node = this.children[i];

        if (node instanceof Mavo.Node) {
          if (typeof callback === 'function') {
            callback.call(node, node);
          } else if (callback in node) {
            node[callback]();
          }
        }
      }
    },

    propagated: ['save', 'destroy'],

    toJSON: Mavo.prototype.toJSON,

    fromTemplate(...properties) {
      if (this.template) {
        properties.forEach(property => this[property] = this.template[property]);
      }

      return Boolean(this.template);
    },

    render(data) {
      this.oldData = this.data;
      this.data = data;

      data = Mavo.subset(data, this.inPath);

      const env = {context: this, data};

      Mavo.hooks.run('node-render-start', env);

      if (this.nodeType != 'Collection' && Array.isArray(data)) {
      // We are rendering an array on a singleton, what to do?
        let properties;

        if (this.isRoot && (properties = this.getNames('Collection')).length === 1) {
        // If it's root with only one collection property, render on that property
          env.data = {
            [properties[0]]: env.data
          };
        } else {
        // Otherwise, render first item
          this.inPath.push('0');
          env.data = env.data[0];
        }
      }

      if (this.editing) {
        this.done();
        this.dataRender(env.data);
        this.edit();
      } else {
        this.dataRender(env.data);
      }

      this.save();

      Mavo.hooks.run('node-render-end', env);
    },

    dataChanged(action, o = {}) {
      $.fire(o.element || this.element, 'mv-change', $.extend({
        property: this.property,
        action,
        mavo: this.mavo,
        node: this
      }, o));
    },

    toString() {
      return `#${this.uid}: ${this.nodeType} (${this.property})`;
    },

    getClosestCollection() {
      const closestItem = this.closestItem;

      return closestItem ? closestItem.collection : null;
    },

    getClosestItem() {
      if (this.collection && this.collection.mutable) {
        return this;
      }

      return this.parentGroup ? this.parentGroup.closestItem : null;
    },

  /**
   * Check if this unit is either deleted or inside a deleted group
   */
    isDeleted() {
      const ret = this.deleted;

      if (this.deleted) {
        return true;
      }

      return Boolean(this.parentGroup) && this.parentGroup.isDeleted();
    },

  // Resolve a property name from this node
    resolve(property, o = {}) {
    // First look in descendants
      let ret = this.find(property, o);

      if (ret === undefined) {
      // Still not found, look in ancestors
        ret = this.walkUp(group => {
          if (group.property === property) {
            return group;
          }

          if (property in group.children) {
            return group.children[property];
          }
        });
      }

      if (ret === undefined) {
      // Still not found, look anywhere
        ret = this.mavo.root.find(property, o);
      }

      return ret;
    },

    relativizeData: self.Proxy ? function (data, options = {live: true}) {
      const cache = {};

      return new Proxy(data, {
        get: (data, property, proxy) => {
          if (property in data) {
            return data[property];
          }

        // Checking if property is in proxy might add it to the cache
          if (property in proxy && property in cache) {
            return cache[property];
          }
        },

        has: (data, property) => {
          if (property in data || property in cache) {
            return true;
          }

        // Property does not exist, look for it elsewhere

        // Special values
          switch (property) {
            case '$index':
              cache[property] = this.index || 0;
              return true; // If index is 0 it's falsy and has would return false!
            case '$next':
            case '$previous':
              if (this.closestCollection) {
                cache[property] = this.closestCollection.getData(options)[this.index + (property === '$next' ? 1 : -1)];
                return true;
              }

              cache[property] = null;
              return false;
          }

        // First look in descendants
          let ret = this.resolve(property);

          if (ret !== undefined) {
            if (Array.isArray(ret)) {
              ret = ret.map(item => item.getData(options))
                 .filter(item => item !== null);
            } else if (ret instanceof Mavo.Node) {
              ret = ret.getData(options);
            }

            cache[property] = ret;

            return true;
          }

        // Does it reference another Mavo?
          if (property in Mavo.all && Mavo.all[property].root) {
            return cache[property] = Mavo.all[property].root.getData(options);
          }

          return false;
        },

        set(data, property = '', value) {
          console.warn(`You cannot set data via expressions. Attempt to set ${property.toString()} to ${value} ignored.`);
          return value;
        }
      });
    } : data => data,

    pathFrom(node) {
      const path = this.path;
      const nodePath = node.path;

      for (var i = 0; i < path.length && nodePath[i] === path[i]; i++) {}

      return path.slice(i);
    },

    getDescendant(path) {
      return path.reduce((acc, cur) => acc.children[cur], this);
    },

  /**
   * Get same node in other item in same collection
   * E.g. for same node in the next item, use an offset of -1
   */
    getCousin(offset, o = {}) {
      if (!this.closestCollection) {
        return null;
      }

      const collection = this.closestCollection;
      const distance = Math.abs(offset);
      const direction = offset < 0 ? -1 : 1;

      if (collection.length < distance + 1) {
        return null;
      }

      let index = this.closestItem.index + offset;

      if (o.wrap) {
        index = Mavo.wrap(index, collection.length);
      }

      for (let i = 0; i < collection.length; i++) {
        let ind = index + i * direction;
        ind = o.wrap ? Mavo.wrap(ind, collection.length) : ind;

        var item = collection.children[ind];

        if (!item || !item.isDeleted()) {
          break;
        }
      }

      if (!item || item.isDeleted() || item === this.closestItem) {
        return null;
      }

      if (this.collection) {
        return item;
      }

      const relativePath = this.pathFrom(this.closestItem);
      return item.getDescendant(relativePath);
    },

    contains(node) {
      do {
        if (node === this) {
          return true;
        }

        node = node.parent;
      }
      while (node);

      return false;
    },

    lazy: {
      closestCollection() {
        return this.getClosestCollection();
      },

      closestItem() {
        return this.getClosestItem();
      },

    // Are we only rendering and editing a subset of the data?
      inPath() {
        const attribute = this.nodeType === 'Collection' ? 'mv-multiple-path' : 'mv-path';

        return (this.element.getAttribute(attribute) || '').split('/').filter(p => p.length);
      },

      properties() {
        if (this.template) {
          return this.template.properties;
        }

        let ret = new Set(this.property && [this.property]);

        if (this.nodeType === 'Group') {
          for (const property in this.children) {
            ret = Mavo.union(ret, this.children[property].properties);
          }
        } else if (this.nodeType === 'Collection') {
          ret = Mavo.union(ret, this.itemTemplate.properties);
        }

        return ret;
      }
    },

    live: {
      store(value) {
        $.toggleAttribute(this.element, 'mv-storage', value);
      },

      unsavedChanges(value) {
        if (value && (!this.saved || !this.editing)) {
          value = false;
        }

        this.element.classList.toggle('mv-unsaved-changes', value);

        return value;
      },

      mode(value) {
        if (this._mode != value) {
        // Is it allowed?
          if (this.modes && value != this.modes) {
            value = this.modes;
          }

        // If we don't do this, setting the attribute below will
        // result in infinite recursion
          this._mode = value;

          if (!(this instanceof Mavo.Collection) && [null, '', 'read', 'edit'].indexOf(this.element.getAttribute('mv-mode')) > -1) {
          // If attribute is not one of the recognized values, leave it alone
            const set = this.modes || value === 'edit';
            Mavo.Observer.sneak(this.mavo.modeObserver, () => {
              $.toggleAttribute(this.element, 'mv-mode', value, set);
            });
          }

          return value;
        }
      },

      modes(value) {
        if (value && value != 'read' && value != 'edit') {
          return null;
        }

        this._modes = value;

        if (value && this.mode != value) {
          this.mode = value;
        }
      },

      deleted(value) {
        this.element.classList.toggle('mv-deleted', value);

        if (value) {
        // Soft delete, store element contents in a fragment
        // and replace them with an undo prompt.
          this.elementContents = document.createDocumentFragment();
          $$(this.element.childNodes).forEach(node => {
            this.elementContents.appendChild(node);
          });

          $.contents(this.element, [
            {
              tag: 'button',
              className: 'mv-close mv-ui',
              textContent: '×',
              events: {
                click(evt) {
                  $.remove(this.parentNode);
                }
              }
            },
            'Deleted ' + this.name,
            {
              tag: 'button',
              className: 'mv-undo mv-ui',
              textContent: 'Undo',
              events: {
                click: evt => this.deleted = false
              }
            }
          ]);

          this.element.classList.remove('mv-highlight');
          this.itembar.remove();
        } else if (this.deleted) {
        // Undelete
          this.element.textContent = '';
          this.element.appendChild(this.elementContents);

        // Otherwise expressions won't update because this will still seem as deleted
        // Alternatively, we could fire datachange with a timeout.
          this._deleted = false;

          this.dataChanged('undelete');
          this.itembar.add();
        }
      },

      path: {
        get() {
          const path = this.parent ? this.parent.path : [];

          return this.property ? [...path, this.property] : path;
        }
      }
    },

    static: {
      maxId: 0,

      all: new WeakMap(),

      create(element, mavo, o = {}) {
        if (Mavo.is('multiple', element) && !o.collection) {
          return new Mavo.Collection(element, mavo, o);
        }

        return new Mavo[Mavo.is('group', element) ? 'Group' : 'Primitive'](element, mavo, o);
      },

    /**
     * Get & normalize property name, if exists
     */
      getProperty(element) {
        let property = element.getAttribute('property') || element.getAttribute('itemprop');

        if (!property) {
          if (element.hasAttribute('property')) { // Property used without a value
            property = element.name || element.id || element.classList[0];
          } else if (element.matches(Mavo.selectors.multiple)) {
          // Mv-multiple used without property, generate name
            property = element.getAttribute('mv-multiple') || 'collection';
          }
        }

        if (property) {
          element.setAttribute('property', property);
        }

        return property;
      },

      get(element, prioritizePrimitive) {
        const nodes = (_.all.get(element) || []).filter(node => !(node instanceof Mavo.Collection));

        if (nodes.length < 2 || !prioritizePrimitive) {
          return nodes[0];
        }

        if (nodes[0] instanceof Mavo.Group) {
          return node[1];
        }
      },

    /**
     * Get all properties that are inside an element but not nested into other properties
     */
      children(element) {
        let ret = Mavo.Node.get(element);

        if (ret) {
        // Element is a Mavo node
          return [ret];
        }

        ret = $$(Mavo.selectors.property, element)
        .map(e => Mavo.Node.get(e))
        .filter(e => !element.contains(e.parentGroup.element)) // Drop nested properties
        .map(e => e.collection || e);

        return Mavo.Functions.unique(ret);
      }
    }
  });
})(Bliss, Bliss.$);
