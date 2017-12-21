/* global Mavo, Bliss */

(function ($, $$) {
  const _ = Mavo.Locale = $.Class({
    constructor(lang, phrases) {
      this.lang = lang;
      this.phrases = {};
      this.extend(phrases);
    },

    get fallback() {
    // TODO should we fallback to other dialects? I.e. should en-US fallback to en-GB if en didn't exist?
      if (_.all[this.baseLang]) {
        return _.all[this.baseLang];
      }

      if (this !== _.default) {
        return _.default;
      }
    },

    extend(phrases) {
      $.extend(this.phrases, phrases);
    },

    phrase(id, vars) {
      const key = id.toLowerCase();
      let phrase = this.phrases[key];

      if (phrase === undefined && this.fallback) {
        phrase = this.fallback.phrase(key);
      }

      if (phrase === undefined) {
      // Everything failed, use id
        phrase = Mavo.Functions.readable(key);
      } else if (vars) {
        const keys = Mavo.matches(phrase, /\{\w+(?=\})/g).map(v => v.slice(1));
        Mavo.Functions.unique(keys).forEach(name => {
          if (name in vars) {
            phrase = phrase.replace(RegExp(`{${name}}`, 'gi'), vars[name]);
          }
        });
      }

      return phrase;
    },

    live: {
      lang(lang) {
        this.baseLang = _.getBaseLang(lang);

        if (lang === this.baseLang) {
          this.baseLang = null;
        }
      }
    },

    static: {
      all: {},

    /**
     * Register new locale or extend existing locale
     */
      register(lang, phrases) {
        if (_.all[lang]) {
          _.all[lang].extend(phrases);
        } else {
          _.all[lang] = new _(lang, phrases);
        }
      },

      match(lang = '') {
        return _.all[lang] || _.all[_.getBaseLang(lang)];
      },

      get(lang) {
        return _.match(lang) || _.default;
      },

      getBaseLang(lang) {
        return lang.split('-')[0];
      },

      lazy: {
        default: () => {
          return _.match(Mavo.locale) || _.all.en;
        }
      }
    }
  });

/**
 * Use phrase
 */
  Mavo.prototype._ = function (id, vars) {
    return this.locale && id ? this.locale.phrase(id, vars) : id;
  };

  $.ready().then(() => {
    $$('datalist.mv-phrases[lang]').forEach(datalist => {
      const phrases = $$('option', datalist).reduce((o, option) => {
        o[option.value] = option.textContent.trim();
        return o;
      }, {});

      Mavo.Locale.register(datalist.lang, phrases);
    });
  });
})(Bliss, Bliss.$);
