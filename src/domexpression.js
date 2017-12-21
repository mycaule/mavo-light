(function ($, $$) {
  var _ = Mavo.DOMExpression = $.Class({
    constructor(o = {}) {
      this.mavo = o.mavo;
      this.template = o.template && o.template.template || o.template;

      for (const prop of ['item', 'path', 'syntax', 'fallback', 'attribute', 'originalAttribute', 'expression', 'parsed']) {
        this[prop] = o[prop] === undefined && this.template ? this.template[prop] : o[prop];
      }

      this.node = o.node;

      if (!this.node) {
      // No node provided, figure it out from path
        this.node = Mavo.elementPath(this.item.element, this.path);
      }

      this.element = this.node;
      this.attribute = this.attribute || null;

      Mavo.hooks.run('domexpression-init-start', this);

      if (this.attribute == 'mv-value') {
        this.originalAttribute = 'mv-value';
        this.attribute = Mavo.Primitive.getValueAttribute(this.element);
        this.fallback = this.fallback || Mavo.Primitive.getValue(this.element, {attribute: this.attribute});
        const expression = this.element.getAttribute('mv-value');
        this.element.removeAttribute('mv-value');
        this.parsed = [new Mavo.Expression(expression)];
        this.expression = this.syntax.start + expression + this.syntax.end;
      }

      if (this.node.nodeType === 3 && this.element === this.node) {
        this.element = this.node.parentNode;

      // If no element siblings make this.node the element, which is more robust
      // Same if attribute, there are no attributes on a text node!
        if (!this.node.parentNode.children.length || this.attribute) {
          this.node = this.element;
          this.element.normalize();
        }
      }

      if (!this.expression) { // Still unhandled?
        if (this.attribute) {
        // Some web components (e.g. AFrame) hijack getAttribute()
          const value = Element.prototype.getAttribute.call(this.node, this.attribute);

          this.expression = (value || '').trim();
        } else {
        // Move whitespace outside to prevent it from messing with types
          this.node.normalize();

          if (this.node.firstChild && this.node.childNodes.length === 1 && this.node.firstChild.nodeType === 3) {
            const whitespace = this.node.firstChild.textContent.match(/^\s*|\s*$/g);

            if (whitespace[1]) {
              this.node.firstChild.splitText(this.node.firstChild.textContent.length - whitespace[1].length);
              $.after(this.node.lastChild, this.node);
            }

            if (whitespace[0]) {
              this.node.firstChild.splitText(whitespace[0].length);
              this.node.parentNode.insertBefore(this.node.firstChild, this.node);
            }
          }

          this.expression = this.node.textContent;
        }

        this.parsed = o.template ? o.template.parsed : this.syntax.tokenize(this.expression);
      }

      this.oldValue = this.value = this.parsed.map(x => x instanceof Mavo.Expression ? x.expression : x);

      this.item = Mavo.Node.get(this.element.closest(Mavo.selectors.item));

      this.mavo.treeBuilt.then(() => {
        if (!this.template && !this.item) {
        // Only collection items and groups can have their own expressions arrays
          this.item = Mavo.Node.get(this.element.closest(Mavo.selectors.item));
        }

        if (this.originalAttribute == 'mv-value' && this.mavoNode && this.mavoNode == this.item.collection) {
          Mavo.delete(this.item.expressions, this);
        }

        Mavo.hooks.run('domexpression-init-treebuilt', this);
      });

      Mavo.hooks.run('domexpression-init-end', this);

      _.elements.set(this.element, [...(_.elements.get(this.element) || []), this]);
    },

    destroy() {
      _.special.delete(this);
    },

    changedBy(evt) {
      if (this.originalAttribute == 'mv-value' && this.mavoNode && !(this.mavoNode instanceof Mavo.Primitive)) {
      // Just prevent the same node from triggering changes, everything else is game
        return !evt || !this.mavoNode.contains(evt.node);
      }

      if (!this.identifiers) {
        this.identifiers = Mavo.flatten(this.parsed.map(x => x.identifiers || []));

      // Any identifiers that need additional updating?
        _.special.add(this);
      }

      return Mavo.Expression.changedBy(this.identifiers, evt);
    },

    update(data = this.data, event) {
      const env = {context: this, event};
      const parentEnv = env;

      this.data = data;

      Mavo.hooks.run('domexpression-update-start', env);

      this.oldValue = this.value;
      let changed = false;

      env.value = this.value = this.parsed.map((expr, i) => {
        if (expr instanceof Mavo.Expression) {
          if (expr.changedBy(parentEnv.event)) {
            const env = {context: this, expr, parentEnv};

            Mavo.hooks.run('domexpression-update-beforeeval', env);

            env.value = Mavo.value(env.expr.eval(data));

            Mavo.hooks.run('domexpression-update-aftereval', env);

            changed = true;

            if (env.value instanceof Error) {
              return this.fallback !== undefined ? this.fallback : this.syntax.start + env.expr.expression + this.syntax.end;
            }

            if (env.value === undefined || env.value === null) {
            // Don’t print things like "undefined" or "null"
              return '';
            }

            return env.value;
          }

          return this.oldValue[i];
        }

        return expr;
      });

      if (!changed) {
      // If nothing changed, no need to do anything
        return;
      }

      if (env.value.length === 1) {
        env.value = env.value[0];
      } else {
        env.value = env.value.map(v => Mavo.Primitive.format(v, {
          attribute: this.attribute,
          element: this.element
        })).join('');
      }

      this.output(env.value);

      Mavo.hooks.run('domexpression-update-end', env);
    },

    output(value) {
      if (this.primitive) {
        this.primitive.value = value;
      } else if (this.mavoNode) {
        this.mavoNode.render(value);
      } else {
        Mavo.Primitive.setValue(this.node, value, {attribute: this.attribute});
      }
    },

    live: {
      item(item) {
        if (item && this._item != item) {
          if (this._item) {
          // Previous item, delete from its expressions
            Mavo.delete(this._item.expressions, this);
          }

          item.expressions = item.expressions || [];
          item.expressions.push(this);
        }
      }
    },

    static: {
      elements: new WeakMap(),

    /**
     * Search for Mavo.DOMExpression object(s) associated with a given element
     * and optionally an attribute.
     *
     * @return If one argument, array of matching DOMExpression objects.
     *         If two arguments, the matching DOMExpression object or null
     */
      search(element, attribute) {
        if (element === null) {
          return element;
        }

        const all = _.elements.get(element) || [];

        if (arguments.length > 1) {
          if (!all.length) {
            return null;
          }

          return all.filter(et => et.attribute === attribute)[0] || null;
        }

        return all;
      },

      special: {
        add(domexpression, name) {
          if (name) {
            const o = this.vars[name];

            if (o && domexpression.identifiers.indexOf(name) > -1) {
              o.all = o.all || new Set();
              o.all.add(domexpression);

              if (o.all.size === 1) {
                o.observe();
              } else if (!o.all.size) {
                o.unobserve();
              }
            }
          } else {
          // All names
            for (var name in this.vars) {
              this.add(domexpression, name);
            }
          }
        },

        delete(domexpression, name) {
          if (name) {
            const o = this.vars[name];

            o.all = o.all || new Set();
            o.all.delete(domexpression);

            if (!o.all.size) {
              o.unobserve();
            }
          } else {
          // All names
            for (var name in this.vars) {
              this.delete(domexpression, name);
            }
          }
        },

        update() {
          if (this.update) {
            this.update(...arguments);
          }

          this.all.forEach(domexpression => domexpression.update());
        },

        event(name, {type, update, target = document} = {}) {
          this.vars[name] = {
            observe() {
              this.callback = this.callback || _.special.update.bind(this);
              target.addEventListener(type, this.callback);
            },
            unobserve() {
              target.removeEventListener(type, this.callback);
            }
          };

          if (update) {
            this.vars[name].update = function (evt) {
              Mavo.Functions[name] = update(evt);
            };
          }
        },

        vars: {
          $now: {
            observe() {
              var callback = () => {
                _.special.update.call(this);
                this.timer = requestAnimationFrame(callback);
              };

              this.timer = requestAnimationFrame(callback);
            },
            unobserve() {
              cancelAnimationFrame(this.timer);
            }
          }
        }
      }
    }
  });

  _.special.event('$mouse', {
    type: 'mousemove',
    update(evt) {
      return {x: evt.clientX, y: evt.clientY};
    }
  });

  _.special.event('$hash', {
    type: 'hashchange',
    target: window
  });
})(Bliss, Bliss.$);
