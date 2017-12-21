(function ($, $$) {
  Mavo.attributes.push('mv-multiple', 'mv-order', 'mv-accepts');

  var _ = Mavo.Collection = $.Class({
    extends: Mavo.Node,
    nodeType: 'Collection',
    constructor(element, mavo, o) {
    /*
     * Create the template, remove it from the DOM and store it
     */
      this.templateElement = this.element;

      this.children = [];

    // ALL descendant property names as an array
      if (!this.fromTemplate('mutable', 'templateElement', 'accepts', 'optional', 'like', 'likeNode')) {
        this.mutable = this.templateElement.matches(Mavo.selectors.multiple);
        this.accepts = (this.templateElement.getAttribute('mv-accepts') || '').split(/\s+/);
        this.like = this.templateElement.getAttribute('mv-like');

        if (this.like) {
          this.likeNode = this.resolve(this.like, {exclude: this});
          this.likeNode = this.likeNode || this.likeNode.template;

          if (!this.likeNode) {
            this.like = null;
          }
        }

        this.optional = Boolean(this.like) || this.templateElement.hasAttribute('mv-optional');

      // Must clone because otherwise once expressions are parsed on the template element
      // we will not be able to pick them up from subsequent items
        this.templateElement = this.templateElement.cloneNode(true);
      }

      if (this.likeNode) {
        this.itemTemplate = this.likeNode;
        const templateElement = $.value(this.likeNode.collection, 'templateElement') || this.likeNode.element;
        this.templateElement = templateElement.cloneNode(true);
        this.templateElement.setAttribute('property', this.property);
        this.properties = this.likeNode.properties;
      } else if (!this.optional || !this.template) {
        const item = this.createItem(this.element);
        this.add(item, undefined, {silent: true});

        if (this.optional) {
          this.delete(item, true);
        }
      }

      if (this.optional) {
        this.element.remove();
      }

      this.postInit();

      Mavo.hooks.run('collection-init-end', this);
    },

    get length() {
      return this.children.length;
    },

    getData(o = {}) {
      const env = {
        context: this,
        options: o,
        data: []
      };

      this.children.forEach(item => {
        if (!item.deleted || env.options.live) {
          const itemData = item.getData(env.options);

          if (env.options.live || Mavo.value(itemData) !== null) {
            env.data.push(itemData);
          }
        }
      });

      if (!this.mutable) {
      // If immutable, drop nulls
        env.data = env.data.filter(item => Mavo.value(item) !== null);

        if (env.options.live && env.data.length === 1) {
        // If immutable with only 1 item, return the item
        // See https://github.com/LeaVerou/mavo/issues/50#issuecomment-266079652
          env.data = env.data[0];
        } else if (this.data && !env.options.live) {
          const rendered = Mavo.subset(this.data, this.inPath);
          env.data = env.data.concat(rendered.slice(env.data.length));
        }
      }

      if (env.options.live && Array.isArray(env.data)) {
        env.data[Mavo.toNode] = this;
        env.data = this.relativizeData(env.data);
      }

      if (!env.options.live) {
        env.data = Mavo.subset(this.data, this.inPath, env.data);
      }

      Mavo.hooks.run('node-getdata-end', env);

      return env.data;
    },

  // Create item but don't insert it anywhere
  // Mostly used internally
    createItem(element) {
      if (!element) {
        element = this.templateElement.cloneNode(true);
      }

      const template = this.itemTemplate || (this.template ? this.template.itemTemplate : null);

      const item = Mavo.Node.create(element, this.mavo, {
        collection: this,
        template,
        property: this.property,
        type: this.type
      });

      if (!this.itemTemplate) {
        this.itemTemplate = template || item;
      }

      return item;
    },

  /**
   * Add a new item to this collection
   * @param item {Node|Mavo.Node} Optional. Element or Mavo object for the new item
   * @param index {Number} Optional. Index of existing item, will be added opposite to list direction
   * @param silent {Boolean} Optional. Throw a datachange event? Mainly used internally.
   */
    add(item, index, o = {}) {
      if (item instanceof Node) {
        item = Mavo.Node.get(item) || this.createItem(item);
      } else {
        item = item || this.createItem();
      }

      if (item.collection != this) {
        this.adopt(item);
      }

      if (this.mutable) {
      // Add it to the DOM, or fix its place
        const rel = this.children[index] ? this.children[index].element : this.marker;
        $[this.bottomUp ? 'after' : 'before'](item.element, rel);

        if (index === undefined) {
          index = this.bottomUp ? 0 : this.length;
        }
      } else {
        index = this.length;
      }

      const env = {context: this, item};

      env.previousIndex = item.index;

    // Update internal data model
      env.changed = this.splice({
        remove: env.item
      }, {
        index,
        add: env.item
      });

      if (env.item.itembar) {
        env.item.itembar.reposition();
      }

      if (this.mavo.expressions.active && !o.silent) {
        requestAnimationFrame(() => {
          env.changed.forEach(i => {
            i.dataChanged(i == env.item && env.previousIndex === undefined ? 'add' : 'move');
            i.unsavedChanges = true;
          });

          this.unsavedChanges = this.mavo.unsavedChanges = true;

          this.mavo.expressions.update(env.item);
        });
      }

      Mavo.hooks.run('collection-add-end', env);

      return env.item;
    },

    splice(...actions) {
      actions.forEach(action => {
        if (action.index === undefined && action.remove && isNaN(action.remove)) {
        // Remove is an item
          action.index = this.children.indexOf(action.remove);
          action.remove = 1;
        }
      });

    // Sort in reverse index order
      actions.sort((a, b) => b.index - a.index);

    // FIXME this could still result in buggy behavior.
    // Think of e.g. adding items on i, then removing > 1 items on i-1.
    // The new items would get removed instead of the old ones.
    // Not a pressing issue though since we always remove 1 max when adding things too.
      actions.forEach(action => {
        if (action.index > -1 && (action.remove || action.add)) {
          action.remove = action.remove || 0;
          action.add = Mavo.toArray(action.add);

          this.children.splice(action.index, Number(action.remove), ...action.add);
        }
      });

      const changed = [];

      for (let i = 0; i < this.length; i++) {
        const item = this.children[i];

        if (item && item.index !== i) {
          item.index = i;
          changed.push(item);
        }
      }

      return changed;
    },

    adopt(item) {
      if (item.collection) {
      // It belongs to another collection, delete from there first
        item.collection.splice({remove: item});
        item.collection.dataChanged('delete');
      }

     // Update collection & closestCollection properties
      this.walk(obj => {
        if (obj.closestCollection === item.collection) {
          obj.closestCollection = this;
        }

      // Belongs to another Mavo?
        if (item.mavo != this.mavo) {
          item.mavo = this.mavo;
        }
      });

      item.collection = this;

    // Adjust templates and their copies
      if (item.template) {
        Mavo.delete(item.template.copies, item);

        item.template = this.itemTemplate;
      }
    },

    delete(item, hard) {
      if (hard) {
      // Hard delete
        $.remove(item.element);
        this.splice({remove: item});
        item.destroy();
        return;
      }

      return $.transition(item.element, {opacity: 0}).then(() => {
        item.deleted = true; // Schedule for deletion
        item.element.style.opacity = '';

        item.dataChanged('delete');

        this.unsavedChanges = item.unsavedChanges = this.mavo.unsavedChanges = true;
      });
    },

  /**
   * Move existing item to a new position. Wraps around if position is out of bounds.
   * @offset relative position
   */
    move(item, offset) {
      let index = item.index + offset + (offset > 0);

      index = Mavo.wrap(index, this.children.length + 1);

      this.add(item, index);

      if (item instanceof Mavo.Primitive && item.itembar) {
        item.itembar.reposition();
      }
    },

    editItem(item, o = {}) {
      const when = o.immediately ? Promise.resolve() : Mavo.inView.when(item.element);

      return when.then(() => {
        if (this.mutable) {
          if (!item.itembar) {
            item.itembar = new Mavo.UI.Itembar(item);
          }

          item.itembar.add();
        }

        return item.edit(o);
      });
    },

    edit(o = {}) {
      if (this.super.edit.call(this) === false) {
        return false;
      }

      if (this.mutable) {
      // Insert the add button if it's not already in the DOM
        if (!this.addButton.parentNode) {
          const tag = this.element.tagName.toLowerCase();
          const containerSelector = Mavo.selectors.container[tag];
          const rel = containerSelector ? this.marker.parentNode.closest(containerSelector) : this.marker;
          $[this.bottomUp ? 'before' : 'after'](this.addButton, rel);
        }

      // Set up drag & drop
        _.dragula.then(() => {
          this.getDragula();
        });
      }

    // Edit items, maybe insert item bar
      return Promise.all(this.children.map(item => this.editItem(item, o)));
    },

    done() {
      if (this.super.done.call(this) === false) {
        return false;
      }

      if (this.mutable) {
        if (this.addButton.parentNode) {
          this.addButton.remove();
        }

        this.propagate(item => {
          if (item.itembar) {
            item.itembar.remove();
          }
        });
      }
    },

    dataChanged(action, o = {}) {
      o.element = o.element || this.marker;
      return this.super.dataChanged.call(this, action, o);
    },

    save() {
      this.children.forEach(item => {
        if (item.deleted) {
          this.delete(item, true);
        } else {
          item.unsavedChanges = false;
        }
      });
    },

    propagated: ['save'],

    dataRender(data) {
      if (data === undefined) {
        return;
      }

      data = data === null ? [] : Mavo.toArray(data).filter(i => i !== null);

      if (!this.mutable) {
        this.children.forEach((item, i) => item.render(data && data[i]));
      } else {
      // First render on existing items
        for (var i = 0; i < this.children.length; i++) {
          var item = this.children[i];

          if (i < data.length) {
            item.render(data[i]);
          } else {
            item.dataChanged('delete');
            this.delete(item, true);
            i--;
          }
        }

        if (data.length > i) {
        // There are still remaining items
        // Using document fragments improves performance by 60%
          const fragment = document.createDocumentFragment();

          for (var j = i; j < data.length; j++) {
            var item = this.createItem();

            item.render(data[j]);

            this.children.push(item);
            item.index = j;

            fragment.appendChild(item.element);

            const env = {context: this, item};
            Mavo.hooks.run('collection-add-end', env);
          }

          if (this.bottomUp) {
            $.after(fragment, i > 0 ? this.children[i - 1].element : this.marker);
          } else {
            $.before(fragment, this.marker);
          }

          for (var j = i; j < this.children.length; j++) {
            this.children[j].dataChanged('add');

            if (this.mavo.expressions.active) {
              requestAnimationFrame(() => this.mavo.expressions.update(this.children[j]));
            }
          }
        }
      }
    },

    find(property, o = {}) {
      if (o.exclude === this) {
        return;
      }

      const items = this.children.filter(item => !item.deleted && !item.hidden);

      if (this.property == property) {
        return o.collections ? this : items;
      }

      if (this.properties.has(property)) {
        const ret = items.map(item => item.find(property, o));

        return Mavo.flatten(ret);
      }
    },

    isCompatible(c) {
      return c && this.itemTemplate.nodeType == c.itemTemplate.nodeType && (c === this ||
           c.template == this || this.template == c || this.template && this.template == c.template ||
           this.accepts.indexOf(c.property) > -1);
    },

    live: {
      mutable(value) {
        if (value && value !== this.mutable) {
        // Why is all this code here? Because we want it executed
        // every time mutable changes, not just in the constructor
        // (think multiple elements with the same property name, where only one has mv-multiple)
          this._mutable = value;

        // Keep position of the template in the DOM, since we might remove it
          this.marker = document.createComment('mv-marker');
          Mavo.data(this.marker, 'collection', this);

          const ref = this.templateElement.parentNode ? this.templateElement : this.children[this.length - 1].element;

          $.after(this.marker, ref);
        }
      }
    },

  // Make sure to only call after dragula has loaded
    getDragula() {
      if (this.dragula) {
        return this.dragula;
      }

      if (this.template) {
        Mavo.pushUnique(this.template.getDragula().containers, this.marker.parentNode);
        return this.dragula = this.template.dragula || this.template.getDragula();
      }

      const me = this;
      this.dragula = dragula({
        containers: [this.marker.parentNode],
        isContainer: el => {
          if (this.accepts.length) {
            return Mavo.flatten(this.accepts.map(property => this.mavo.root.find(property, {collections: true})))
                .filter(c => c && c instanceof _)
                .map(c => c.marker.parentNode)
                .indexOf(el) > -1;
          }

          return false;
        },
        moves: (el, container, handle) => {
          return handle.classList.contains('mv-drag-handle') && handle.closest(Mavo.selectors.multiple) == el;
        },
        accepts(el, target, source, next) {
          if (el.contains(target)) {
            return false;
          }

          const previous = next ? next.previousElementSibling : target.lastElementChild;

          const collection = _.get(previous) || _.get(next);

          if (!collection) {
            return false;
          }

          const item = Mavo.Node.get(el);

          return item && item.collection.isCompatible(collection);
        }
      });

      this.dragula.on('drop', (el, target, source) => {
        const item = Mavo.Node.get(el);
        const oldIndex = item && item.index;
        const next = el.nextElementSibling;
        const previous = el.previousElementSibling;
        const collection = _.get(previous) || _.get(next);
        let closestItem = Mavo.Node.get(previous) || Mavo.Node.get(next);

        if (closestItem && closestItem.collection != collection) {
          closestItem = null;
        }

        if (item.collection.isCompatible(collection)) {
          const index = closestItem ? closestItem.index + (closestItem.element === previous) : collection.length;
          collection.add(item, index);
        } else {
          return this.dragula.cancel(true);
        }
      });

      _.dragulas.push(this.dragula);

      return this.dragula;
    },

    lazy: {
      bottomUp() {
      /*
       * Add new items at the top or bottom?
       */

        if (!this.mutable) {
          return false;
        }

        const order = this.templateElement.getAttribute('mv-order');

        if (order !== null) {
        // Attribute has the highest priority and overrides any heuristics
          return /^desc\b/i.test(order);
        }

        if (!this.addButton.parentNode) {
        // If add button not in DOM, do the default
          return false;
        }

      // If add button is already in the DOM and *before* our template, then we default to prepending
        return Boolean(this.addButton.compareDocumentPosition(this.marker) & Node.DOCUMENT_POSITION_FOLLOWING);
      },

      closestCollection() {
        const parent = this.marker ? this.marker.parentNode : this.templateElement.parentNode;

        return parent.closest(Mavo.selectors.multiple);
      },

      addButton() {
      // Find add button if provided, or generate one
        const selector = `button.mv-add-${this.property}`;
        const group = this.closestCollection || this.marker.parentNode.closest(Mavo.selectors.group);

        if (group) {
          var button = $$(selector, group).filter(button => {
            return !this.templateElement.contains(button) &&  // Is outside the template element
            !Mavo.data(button, 'collection'); // And does not belong to another collection
          })[0];
        }

        if (!button) {
          button = $.create('button', {
            className: 'mv-add',
            textContent: this.mavo._('add-item', this)
          });
        }

        button.classList.add('mv-ui', 'mv-add');
        Mavo.data(button, 'collection', this);

        if (this.property) {
          button.classList.add(`mv-add-${this.property}`);
        }

        button.addEventListener('click', evt => {
          evt.preventDefault();

          this.editItem(this.add());
        });

        return button;
      }
    },

    static: {
      dragulas: [],
      get: element => {
      // Is it an add button or a marker?
        const collection = Mavo.data(element, 'collection');

        if (collection) {
          return collection;
        }

      // Maybe it's a collection item?
        const item = Mavo.Node.get(element);

        return item && item.collection || null;
      },

      lazy: {
        dragula: () => $.include(self.dragula, 'https://cdnjs.cloudflare.com/ajax/libs/dragula/3.7.2/dragula.min.js')
      }
    }
  });
})(Bliss, Bliss.$);
