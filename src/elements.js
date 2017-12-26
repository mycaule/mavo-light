/* global Mavo, Bliss */

/**
 * Configuration for different types of elements. Options:
 * - attribute {String}
 * - useProperty {Boolean}
 * - datatype {"number"|"boolean"|"string"} Default is "string"
 * - modes
 * - editor {Object|Function}
 * - setEditorValue temporary
 * - edit
 * - done
 * - observe
 * - default: If there is no attribute, can we use that rule to pick one?
 * @
 */
(function ($) {
  const _ = Mavo.Elements = {};

  Object.defineProperties(_, {
    register: {
      value(id, config) {
        if (typeof arguments[0] === 'object') {
        // Multiple definitions
          for (const s in arguments[0]) {
            _.register(s, arguments[0][s]);
          }

          return;
        }

        if (config.extend) {
          const base = _[config.extend];

          config = $.extend($.extend({}, base), config);
        }

        if (id.indexOf('@') > -1) {
          const parts = id.split('@');

          config.selector = config.selector || parts[0] || '*';

          if (config.attribute === undefined) {
            config.attribute = parts[1];
          }
        }

        config.selector = config.selector || id;
        config.id = id;

        if (Array.isArray(config.attribute)) {
          config.attribute.forEach(attribute => {
            const o = $.extend({}, config);
            o.attribute = attribute;

            _[`${id}@${attribute}`] = o;
          });
        } else {
          _[id] = config;
        }

        return _;
      }
    },
    search: {
      value(element, attribute, datatype) {
        const matches = _.matches(element, attribute, datatype);

        const lastMatch = matches[matches.length - 1];

        if (lastMatch) {
          return lastMatch;
        }

        const config = $.extend({}, _.defaultConfig[datatype || 'string']);
        config.attribute = attribute === undefined ? config.attribute : attribute;

        return config;
      }
    },
    matches: {
      value(element, attribute, datatype) {
        const matches = [];

        for (const id in _) {
          const o = _[id];

        // Passes attribute test?
          const attributeMatches = attribute === undefined && o.default || attribute === o.attribute;

          if (!attributeMatches) {
            continue;
          }

        // Passes datatype test?
          if (datatype !== undefined && datatype !== 'string' && datatype !== o.datatype) {
            continue;
          }

        // Passes selector test?
          const selector = o.selector || id;

          if (!element.matches(selector)) {
            continue;
          }

        // Passes arbitrary test?
          if (o.test && !o.test(element, attribute, datatype)) {
            continue;
          }

        // All tests have passed
          matches.push(o);
        }

        return matches;
      }
    },

    isSVG: {
      value: e => e.namespaceURI === 'http://www.w3.org/2000/svg'
    },

    defaultConfig: {
      value: {
        string: {
          editor: {tag: 'input'}
        },
        number: {
          editor: {tag: 'input', type: 'number'}
        },
        boolean: {
          attribute: 'content',
          editor: {tag: 'input', type: 'checkbox'}
        }
      }
    }
  });

  _.register({
    '@hidden': {
      datatype: 'boolean'
    },

    '@y': {
      test: _.isSVG,
      datatype: 'number'
    },

    '@x': {
      default: true,
      test: _.isSVG,
      datatype: 'number'
    },

    media: {
      default: true,
      selector: 'img, video, audio',
      attribute: 'src',
      editor() {
        const mainInput = $.create('input', {
          type: 'url',
          placeholder: 'http://example.com/image.png',
          className: 'mv-output',
          'aria-label': 'URL to image'
        });

        if (this.mavo.uploadBackend && self.FileReader) {
          let popup;
          let type = this.element.nodeName.toLowerCase();
          type = type === 'img' ? 'image' : type;
          const path = this.element.getAttribute('mv-uploads') || type + 's';

          const upload = (file, name = file.name) => {
            if (!file || file.type.indexOf(type + '/') !== 0) {
              return;
            }

            const tempURL = URL.createObjectURL(file);

            this.sneak(() => this.element.src = tempURL);

            this.mavo.upload(file, path + '/' + name).then(url => {
            // Backend claims image is uploaded, we should load it from remote to make sure everything went well
              let attempts = 0;
              const load = Mavo.rr(() => Mavo.timeout(1000 + attempts * 500).then(() => {
                attempts++;
                this.element.src = url;
              }));
              const cleanup = () => {
                URL.revokeObjectURL(tempURL);
                this.element.removeEventListener('load', onload);
                this.element.removeEventListener('error', onload);
              };
              var onload = evt => {
                if (this.element.src != tempURL) {
                // Actual uploaded image has loaded, yay!
                  this.element.src = url;
                  cleanup();
                }
              };
              const onerror = evt => {
              // Oops, failed. Put back temp URL and try again
                if (attempts <= 10) {
                  this.sneak(() => this.element.src = tempURL);
                  load();
                } else {
                // 11 + 0.5*10*11/2 = 38.5 seconds later, giving up
                  this.mavo.error(this.mavo._('cannot-load-uploaded-file') + ' ' + url);
                  cleanup();
                }
              };

              mainInput.value = url;
              this.element.addEventListener('load', onload);
              this.element.addEventListener('error', onerror);
            });
          };

          const uploadEvents = {
            paste: evt => {
              const item = evt.clipboardData.items[0];

              if (item.kind === 'file' && item.type.indexOf(type + '/') === 0) {
              // Is a file of the correct type, upload!
                const name = `pasted-${type}-${Date.now()}.${item.type.slice(6)}`; // Image, video, audio are all 5 chars
                upload(item.getAsFile(), name);
                evt.preventDefault();
              }
            },
            'drag dragstart dragend dragover dragenter dragleave drop': evt => {
              evt.preventDefault();
              evt.stopPropagation();
            },
            'dragover dragenter': evt => {
              popup.classList.add('mv-dragover');
              this.element.classList.add('mv-dragover');
            },
            'dragleave dragend drop': evt => {
              popup.classList.remove('mv-dragover');
              this.element.classList.remove('mv-dragover');
            },
            drop: evt => {
              upload(evt.dataTransfer.files[0]);
            }
          };

          $.bind(this.element, uploadEvents);

          return popup = $.create({
            className: 'mv-upload-popup',
            contents: [
              mainInput, {
                tag: 'input',
                type: 'file',
                'aria-label': 'Upload image',
                accept: type + '/*',
                events: {
                  change: evt => {
                    const file = evt.target.files[0];

                    if (!file) {
                      return;
                    }

                    upload(file);
                  }
                }
              }, {
                className: 'mv-tip',
                innerHTML: '<strong>Tip:</strong> You can also drag & drop or paste!'
              }
            ],
            events: uploadEvents
          });
        }

        return mainInput;
      }
    },

    'video, audio': {
      attribute: ['autoplay', 'buffered', 'loop'],
      datatype: 'boolean'
    },

    details: {
      attribute: 'open',
      datatype: 'boolean'
    },

    'a, link': {
      default: true,
      attribute: 'href'
    },

    'input, select, button, textarea': {
      attribute: 'disabled',
      datatype: 'boolean'
    },

    formControl: {
      selector: 'input',
      default: true,
      attribute: 'value',
      modes: 'edit',
      changeEvents: 'input change',
      edit: () => {},
      done: () => {},
      init() {
        this.editor = this.element;
      }
    },

    select: {
      extend: 'formControl',
      selector: 'select',
      subtree: true
    },

    textarea: {
      extend: 'formControl',
      selector: 'textarea',
      attribute: null,
      getValue: element => element.value,
      setValue: (element, value) => element.value = value
    },

    formNumber: {
      extend: 'formControl',
      selector: 'input[type=range], input[type=number]',
      datatype: 'number',
      setValue(element, value) {
        element.value = value;
        element.setAttribute('value', value);

        const attribute = value > element.value ? 'max' : 'min';

        if (!isNaN(value) && element.value != value && !Mavo.data(element, 'boundObserver')) {
        // Value out of bounds, maybe race condition? See #295
        // Observe min/max attrs until user interaction or data change
          const observer = new Mavo.Observer(element, attribute, r => {
            element.value = value;
          });

          requestAnimationFrame(() => {
            $.bind(element, 'input mv-change', function handler() {
              observer.destroy();
              Mavo.data(element, 'boundObserver', undefined);
              $.unbind(element, 'input mv-change', handler);
            });
          });

        // Prevent creating same observer twice
          Mavo.data(element, 'boundObserver', observer);
        }
      }
    },

    checkbox: {
      extend: 'formControl',
      selector: 'input[type=checkbox]',
      attribute: 'checked',
      datatype: 'boolean',
      changeEvents: 'click'
    },

    radio: {
      extend: 'formControl',
      selector: 'input[type=radio]',
      attribute: 'checked',
      modes: 'edit',
      getValue: element => {
        if (element.form) {
          return element.form[element.name].value;
        }

        const checked = $(`input[type=radio][name="${element.name}"]:checked`);
        return checked && checked.value;
      },
      setValue: (element, value) => {
        if (element.form) {
          element.form[element.name].value = value;
          return;
        }

        const toCheck = $(`input[type=radio][name="${element.name}"][value="${value}"]`);
        $.properties(toCheck, {checked: true});
      },
      init(element) {
        this.mavo.element.addEventListener('change', evt => {
          if (evt.target.name === element.name) {
            this.value = this.getValue();
          }
        });
      }
    },

    counter: {
      extend: 'formControl',
      selector: 'button, .counter',
      attribute: 'mv-clicked',
      datatype: 'number',
      init(element) {
        if (this.attribute === 'mv-clicked') {
          element.setAttribute('mv-clicked', '0');

          element.addEventListener('click', evt => {
            let clicked = Number(element.getAttribute('mv-clicked')) || 0;
            this.value = ++clicked;
          });
        }
      }
    },

    meta: {
      default: true,
      attribute: 'content'
    },

    block: {
      default: true,
      selector: 'p, div, dt, dd, h1, h2, h3, h4, h5, h6, article, section, address',
      editor() {
        const cs = getComputedStyle(this.element);
        const display = cs.display;
        const tag = display.indexOf('inline') === 0 ? 'input' : 'textarea';
        const editor = $.create(tag);

        if (tag === 'textarea') {
        // Actually multiline
          const width = this.element.offsetWidth;

          if (width) {
            editor.width = width;
          }

        // We cannot collapse whitespace because then users
        // are adding characters they don’t see (#300).
          editor.style.whiteSpace = ({
            normal: 'pre-wrap',
            nowrap: 'pre'
          })[cs.whiteSpace] || 'inherit';
        }

        return editor;
      },

      setEditorValue(value) {
        if (this.datatype && this.datatype != 'string') {
          value = String(value);
        }

        const cs = getComputedStyle(this.element);
        value = value || '';

        if (['normal', 'nowrap'].indexOf(cs.whiteSpace) > -1) {
        // Collapse lines
          value = value.replace(/\r?\n/g, ' ');
        }

        if (['normal', 'nowrap', 'pre-line'].indexOf(cs.whiteSpace) > -1) {
        // Collapse whitespace
          value = value.replace(/^[ \t]+|[ \t]+$/gm, '').replace(/[ \t]+/g, ' ');
        }

        this.editor.value = value;
        return true;
      }
    },

    time: {
      attribute: 'datetime',
      default: true,
      init() {
        if (!this.fromTemplate('dateType')) {
          const dateFormat = Mavo.DOMExpression.search(this.element, null);
          const datetime = this.element.getAttribute('datetime') || 'YYYY-MM-DD';

          for (var type in this.config.dateTypes) {
            if (this.config.dateTypes[type].test(datetime)) {
              break;
            }
          }

          this.dateType = type;

          if (!dateFormat) {
          // -TODO what about mv-expressions?
            this.element.textContent = this.config.defaultFormats[this.dateType](this.property);
            this.mavo.expressions.extract(this.element, null);
          }
        }
      },
      dateTypes: {
        month: /^[Y\d]{4}-[M\d]{2}$/i,
        time: /^[H\d]{2}:[M\d]{2}/i,
        'datetime-local': /^[Y\d]{4}-[M\d]{2}-[D\d]{2} [H\d]{2}:[Mi\d]{2}/i,
        date: /^[Y\d]{4}-[M\d]{2}-[D\d]{2}$/i
      },
      defaultFormats: {
        date: name => `[day(${name})] [month(${name}).shortname] [year(${name})]`,
        month: name => `[month(${name}).name] [year(${name})]`,
        time: name => `[hour(${name}).twodigit]:[minute(${name}).twodigit]`,
        'datetime-local'(name) {
          return this.date(name) + ' ' + this.time(name);
        }
      },
      editor() {
        return {tag: 'input', type: this.dateType};
      }
    },

    'circle@r': {
      default: true,
      datatype: 'number'
    },

    circle: {
      attribute: ['cx', 'cy'],
      datatype: 'number'
    },

    text: {
      default: true,
      popup: true
    },

    '.mv-toggle': {
      default: true,
      attribute: 'aria-checked',
      datatype: 'boolean',
      edit() {
        Mavo.revocably.setAttribute(this.element, 'role', 'checkbox');

        $.bind(this.element, 'click.mavo:edit keyup.mavo:edit keydown.mavo:edit', evt => {
          if (evt.type === 'click' || evt.key === ' ' || evt.key === 'Enter') {
            if (evt.type != 'keydown') {
              this.value = !this.value;
            }

            evt.preventDefault();
            evt.stopPropagation();
          }
        });
      },
      done() {
        Mavo.revocably.restoreAttribute(this.element, 'role');

        $.unbind(this.element, '.mavo:edit');
      }
    }
  });
})(Bliss);
