/* global Mavo, Bliss */
/* eslint new-cap: "off" */

(function ($) {
  const _ = Mavo.UI.Popup = $.Class({
    constructor(primitive) {
      this.primitive = primitive;

    // Need to be defined here so that this is what expected
      this.position = () => {
        const bounds = this.primitive.element.getBoundingClientRect();
        const x = bounds.left;
        let y = bounds.bottom;
        let pointDown = false;

        if (this.element.offsetHeight) {
        // Is in the DOM, check if it fits
          this.height = this.element.getBoundingClientRect().height || this.height;
        }

        if (this.height + y + 20 > innerHeight) {
        // Normal positioning means the popup would be cut off or too close to the edge, adjust

        // Perhaps placing it above is better
          if (bounds.top - this.height > 20) {
            pointDown = true;
            y = bounds.top - this.height - 20;
          } else {
          // Nah, just raise it a bit
            y = innerHeight - this.height - 20;
          }
        }

        this.element.classList.toggle('mv-point-down', pointDown);

        $.style(this.element, {top: `${y}px`, left: `${x}px`});
      };

      this.element = $.create('div', {
        className: 'mv-popup',
        hidden: true,
        contents: {
          tag: 'fieldset',
          contents: [
            {
              tag: 'legend',
              textContent: this.primitive.label + ':'
            },
            this.editor
          ]
        },
        events: {
          keyup: evt => {
            if (evt.keyCode === 13 || evt.keyCode === 27) {
              if (this.element.contains(document.activeElement)) {
                this.primitive.element.focus();
              }

              evt.stopPropagation();
              this.hide();
            }
          },
          transitionend: this.position
        }
      });

    // No point in having a dropdown in a popup
      if (this.editor.matches('select')) {
        this.editor.size = Math.min(10, this.editor.children.length);
      }
    },

    show() {
      $.unbind([this.primitive.element, this.element], '.mavo:showpopup');

      this.shown = true;

      this.hideCallback = evt => {
        if (!this.element.contains(evt.target) && !this.primitive.element.contains(evt.target)) {
          this.hide();
        }
      };

      this.element.style.transition = 'none';
      this.element.removeAttribute('hidden');

      this.position();

      this.element.setAttribute('hidden', '');
      this.element.style.transition = '';

      document.body.appendChild(this.element);

      setTimeout(() => {
        this.element.removeAttribute('hidden');
      }, 100); // Trigger transition. rAF or timeouts < 100 don't seem to, oddly.

      $.bind(document, 'focus click', this.hideCallback, true);
      window.addEventListener('scroll', this.position, {passive: true});
    },

    hide() {
      $.unbind(document, 'focus click', this.hideCallback, true);
      window.removeEventListener('scroll', this.position, {passive: true});
      this.element.setAttribute('hidden', ''); // Trigger transition
      this.shown = false;

      setTimeout(() => {
        $.remove(this.element);
      }, parseFloat(getComputedStyle(this.element).transitionDuration) * 1000 || 400);
      // -TODO transition-duration could override this
    },

    prepare() {
      $.bind(this.primitive.element, {
        'click.mavo:edit': () => {
          this.show();
        },
        'keyup.mavo:edit': evt => {
          if ([13, 113].indexOf(evt.keyCode) > -1) { // Enter or F2
            this.show();
            this.editor.focus();
          }
        }
      });
    },

    close() {
      this.hide();
      $.unbind(this.primitive.element, '.mavo:edit .mavo:preedit .mavo:showpopup');
    },

    proxy: {
      editor: 'primitive'
    }
  });
})(Bliss);
