/* global Mavo, Bliss */

(function ($) {
  Mavo.attributes.push('mv-expressions');

  const _ = Mavo.Expression = $.Class({
    constructor(expression) {
      this.expression = expression;
    },

    eval(data) {
      Mavo.hooks.run('expression-eval-beforeeval', this);

      try {
        if (!this.function) {
          this.function = Mavo.Script.compile(this.expression);
        }

        return this.function(data);
      } catch (exception) {
        console.info('%cExpression error!', 'color: red; font-weight: bold', `${exception.message} in expression ${this.expression}`, `
Not an expression? Use mv-expressions="none" to disable expressions on an element and its descendants.`);

        Mavo.hooks.run('expression-eval-error', {context: this, exception});

        return exception;
      }
    },

    toString() {
      return this.expression;
    },

    changedBy(evt) {
      return _.changedBy(this.identifiers, evt);
    },

    live: {
      expression(value) {
        this.function = null;
        this.identifiers = value.match(/[$a-z][$\w]*/ig) || [];
      }
    },

    static: {
      changedBy(identifiers, evt) {
        if (!evt) {
          return true;
        }

        if (!identifiers) {
          return false;
        }

        if (identifiers.indexOf(evt.property) > -1) {
          return true;
        }

        if (Mavo.Functions.intersects(evt.properties, identifiers)) {
          return true;
        }

        if (evt.action === 'propertychange') {
          return Mavo.Functions.intersects(identifiers, evt.node.path);
        }

        if (Mavo.Functions.intersects(['$index', '$previous', '$next'], identifiers)) {
          return true;
        }

        const collection = evt.node.collection || evt.node;

        if (Mavo.Functions.intersects(collection.properties, identifiers)) {
          return true;
        }

        return false;
      }
    }
  });

  _.Syntax = $.Class({
    constructor(start, end) {
      this.start = start;
      this.end = end;
      this.regex = RegExp(`${Mavo.escapeRegExp(start)}([\\S\\s]+?)${Mavo.escapeRegExp(end)}`, 'gi');
    },

    test(str) {
      this.regex.lastIndex = 0;

      return this.regex.test(str);
    },

    tokenize(str) {
      let match,
        ret = [],
        lastIndex = 0;

      this.regex.lastIndex = 0;

      while ((match = this.regex.exec(str)) !== null) {
      // Literal before the expression
        if (match.index > lastIndex) {
          ret.push(str.substring(lastIndex, match.index));
        }

        lastIndex = this.regex.lastIndex;

        ret.push(new Mavo.Expression(match[1]));
      }

    // Literal at the end
      if (lastIndex < str.length) {
        ret.push(str.substring(lastIndex));
      }

      return ret;
    },

    static: {
      create(element) {
        if (element) {
          let syntax = element.getAttribute('mv-expressions');

          if (syntax) {
            syntax = syntax.trim();
            return /\s/.test(syntax) ? new _.Syntax(...syntax.split(/\s+/)) : _.Syntax.ESCAPE;
          }
        }
      },

      ESCAPE: -1
    }
  });

  _.Syntax.default = new _.Syntax('[', ']');
})(Bliss);
