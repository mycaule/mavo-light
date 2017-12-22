/* global window */

// import v from 'voca';

// // Functions available inside Mavo expressions

const numeric = {
  year: d => d.getFullYear(),
  month: d => d.getMonth() + 1,
  day: d => d.getDate(),
  weekday: d => d.getDay() || 7,
  hour: d => d.getHours(),
  minute: d => d.getMinutes(),
  second: d => d.getSeconds(),
  ms: d => d.getMilliseconds()
};

export default (Mavo, $, val, location) => {
  /**
   * Private helper methods
   */

    // Convert argument to string
  const str = (str = '') => {
    str = val(str);
    return !str && str !== 0 ? '' : String(str);
  };

  const empty = v => {
    v = Mavo.value(v);
    return v === null || v === false || v === '';
  };

  const not = v => {
    return !val(v);
  };

  const toLocaleString = (date, options) => {
    let ret = date.toLocaleString(Mavo.locale, options);

    ret = ret.replace(/\u200e/g, ''); // Stupid Edge bug

    return ret;
  };

  const getDateComponent = (component, u) => {
    return date => {
      date = u.date(date);

      if (!date) {
        return '';
      }

      let ret = numeric[component](date);

      // We don't want years to be formatted like 2,017!
      ret = new self[component === 'year' ? 'String' : 'Number'](ret);

      if (component === 'month' || component === 'weekday') {
        ret.name = toLocaleString(date, {[component]: 'long'});
        ret.shortname = toLocaleString(date, {[component]: 'short'});
      }

      if (component !== 'weekday') {
        ret.twodigit = (ret % 100 < 10 ? '0' : '') + (ret % 100);
      }

      return ret;
    };
  };

  const $u = {
    numbers(array, args) {
      array = Array.isArray(array) ? array : (args ? $(args) : [array]);

      return array.filter(number => !isNaN(number) && val(number) !== '').map(n => Number(n));
    },

    fixDateString(date) {
      date = date.trim();

      const hasDate = /^\d{4}-\d{2}(-\d{2})?/.test(date);
      const hasTime = date.indexOf(':') > -1;

      if (!hasDate && !hasTime) {
        return null;
      }

    // Fix up time format
      if (hasDate) {
      // Only year-month, add day
        date = date.replace(/^(\d{4}-\d{2})(?!-\d{2})/, '$1-01');
      } else {
      // No date, add today’s
        date = this.$today + ' ' + date;
      }

      if (hasTime) {
      // Make sure time starts with T, due to Safari bug
        date = date.replace(/-(\d{2})\s+(?=\d{2}:)/, '-$1T');
      } else {
      // Add a time if one doesn't exist
        date += 'T00:00:00';
      }

    // Remove all whitespace
      date = date.replace(/\s+/g, '');

      return date;
    },

    date(date) {
      date = val(date);

      if (!date) {
        return null;
      }

      if ($.type(date) === 'string') {
        date = this.fixDateString(date);

        if (date === null) {
          return null;
        }

        const timezone = Mavo.match(date, /[+-]\d{2}:?\d{2}|Z$/);

        if (timezone) {
        // Parse as ISO format
          date = new Date(date);
        } else {
        // Construct date in local timezone
          const fields = date.match(/\d+/g);
          date = new Date(
          // Year, month, date,
          fields[0], (fields[1] || 1) - 1, fields[2] || 1,
          // Hours, minutes, seconds, milliseconds,
          fields[3] || 0, fields[4] || 0, fields[5] || 0, fields[6] || 0
        );
        }
      } else {
        date = new Date(date);
      }

      if (isNaN(date)) {
        return null;
      }

      return date;
    }
  };

  const _ = {};

  Object.assign(_, {
    operators: {
      '=': 'eq'
    },

    // Get a property of an object. Used by the . operator to prevent TypeErrors
    get(obj, property, meta = {}) {
      meta.property = val(property);
      property = meta.property;
      const canonicalProperty = Mavo.getCanonicalProperty(obj, property);

      if (canonicalProperty !== undefined) {
        meta.property = canonicalProperty;
        const ret = obj[canonicalProperty];

        if (typeof ret === 'function' && ret.name.indexOf('bound') !== 0) {
          return ret.bind(obj);
        }

        return ret;
      }

      if (Array.isArray(obj) && property && isNaN(property)) {
      // Array and non-numerical property
        const eqIndex = property.indexOf('=');

        if (eqIndex > -1) {
        // Property query
          meta.query = {
            property: property.slice(0, eqIndex),
            value: property.slice(eqIndex + 1)
          };

          meta.property = [];

          let ret = obj.filter((e, i) => {
            const passes = this.get(e, meta.query.property) === meta.query.value;

            if (passes) {
              meta.property.push(i);
            }

            return passes;
          });

          if (meta.query.property === 'id') {
            meta.property = meta.property[0];
            ret = ret[0];
          }

          if (ret === undefined) {
            meta.property = obj.length;
          } else if (ret.length === 0) {
            meta.property = [obj.length];
          }

          return ret;
        }

        // Not a property query, get from objects inside
        // -TODO meta.property = ??
        return obj.map(e => this.get(e, property));
      }

      // Not found :(
      return null;
    },

    url: (id, url = location) => {
      if (id === undefined) {
        return window.location.href;
      }

      let ret = null;

      if (id) {
        id = str(id).replace(/[^\w-:]/g);

        ret = url.search.match(RegExp(`[?&]${id}(?:=(.+?))?(?=$|&)`)) ||
             url.pathname.match(RegExp(`(?:^|\\/)${id}\\/([^\\/]*)`));
      }

      return ret === null || !id ? null : decodeURIComponent(ret[1]) || '';
    },

    // -TODO return first/last non-null?
    first: arr => (arr && arr[0]) || '',
    last: arr => (arr && arr[arr.length - 1]) || '',

    unique(arr) {
      if (!Array.isArray(arr)) {
        return arr;
      }

      return [...new Set(arr.map(val))];
    },

    // Do two arrays or sets have a non-empty intersection?
    intersects(arr1, arr2) {
      if (arr1 && arr2) {
        const set2 = new Set(arr2.map ? arr2.map(val) : arr2);
        arr1 = arr1.map ? arr1.map(val) : [...arr1];

        return !arr1.every(el => !set2.has(el));
      }
    },

   // // Number functions

    // Aggregate sum
    sum(array) {
      return $u.numbers(array, arguments).reduce((prev, current) => {
        return Number(prev) + (Number(current) || 0);
      }, 0);
    },

    // Average of an array of numbers
    average(array) {
      array = $u.numbers(array, arguments);

      return array.length && this.sum(array) / array.length;
    },

    // Min of an array of numbers
    min(array) {
      return Math.min(...$u.numbers(array, arguments));
    },

    // Max of an array of numbers
    max(array) {
      return Math.max(...$u.numbers(array, arguments));
    },

    count(array) {
      return Mavo.toArray(array).filter(a => !empty(a)).length;
    },

    reverse(array) {
      return Mavo.toArray(array).slice().reverse();
    },

    round(num, decimals) {
      if (not(num) || not(decimals) || !isFinite(num)) {
        return Math.round(num);
      }

      return Number(num.toLocaleString('en-US', {
        useGrouping: false,
        maximumFractionDigits: decimals
      }));
    },

    th(num) {
      if (empty(num)) {
        return '';
      }

      let ord;
      if (ord < 10 || ord > 20) {
        ord = ['th', 'st', 'nd', 'th'][num % 10];
      }

      ord = ord || 'th';

      return num + ord;
    },

    iff(condition, iftrue = condition, iffalse = '') {
      if (Array.isArray(condition)) {
        return condition.map((c, i) => {
          const ret = val(c) ? iftrue : iffalse;

          return Array.isArray(ret) ? ret[Math.min(i, ret.length - 1)] : ret;
        });
      }

      return val(condition) ? iftrue : iffalse;
    },

    // // String functions

    // Replace all occurences of a string with another string
    replace(haystack, needle, replacement = '', iterations = 1) {
      if (Array.isArray(haystack)) {
        return haystack.map(item => this.replace(item, needle, replacement));
      }

      // Simple string replacement
      const needleRegex = RegExp(Mavo.escapeRegExp(needle), 'g');
      let ret = haystack;
      let prev;
      let counter = 0;

      while (ret !== prev && (counter++ < iterations)) {
        prev = ret;
        ret = ret.replace(needleRegex, replacement);
      }

      return ret;
    },

    len: text => str(text).length,

    // Case insensitive search
    search: (haystack, needle) => haystack && needle ? str(haystack).toLowerCase().indexOf((String(needle)).toLowerCase()) : -1,

    starts: (haystack, needle) => this.search(str(haystack), str(needle)) === 0,
    ends(haystack, needle) {
      [haystack, needle] = [str(haystack), str(needle)];

      const i = this.search(haystack, needle);
      return i > -1 && i === haystack.length - needle.length;
    },

    join(array, glue) {
      return Mavo.toArray(array).join(str(glue));
    },

    idify(readable) {
      return str(readable)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Convert accented letters to ASCII
      .replace(/[^\w\s-]/g, '') // Remove remaining non-ASCII characters
      .trim().replace(/\s+/g, '-') // Convert whitespace to hyphens
      .toLowerCase();
    },

    // Convert an identifier to readable text that can be used as a label
    readable(identifier) {
      // Is it camelCase?
      return str(identifier)
        .replace(/([a-z])([A-Z])(?=[a-z])/g, ($0, $1, $2) => $1 + ' ' + $2.toLowerCase()) // CamelCase?
        .replace(/([a-z0-9])[_/-](?=[a-z0-9])/g, '$1 ') // Hyphen-separated / Underscore_separated?
        .replace(/^[a-z]/, $0 => $0.toUpperCase()); // Capitalize
    },

    uppercase: text => str(text).toUpperCase(),
    lowercase: text => str(text).toLowerCase(),

    from: (haystack, needle) => this.between(haystack, needle),
    fromlast: (haystack, needle) => this.between(haystack, needle, '', true),
    to: (haystack, needle) => this.between(haystack, '', needle),
    tofirst: (haystack, needle) => this.between(haystack, '', needle, true),

    between: (haystack, from, to, tight) => {
      [haystack, from, to] = [str(haystack), str(from), str(to)];

      const i1 = from ? haystack[tight ? 'lastIndexOf' : 'indexOf'](from) : -1;
      const i2 = haystack[tight ? 'indexOf' : 'lastIndexOf'](to);

      if ((from && i1 === -1) || i2 === -1) {
        return '';
      }

      return haystack.slice(i1 + 1, i2 === -1 || !to ? haystack.length : i2);
    },

    filename: url => Mavo.match(new URL(str(url), Mavo.base).pathname, /[^/]+?$/),

    json: data => Mavo.safeToJSON(data),

    // // Date functions
    get $now() {
      return new Date();
    },

    $startup: new Date(), // Like $now, but doesn't update

    get $today() {
      return this.date(new Date());
    },

    year: getDateComponent('year', this),
    month: getDateComponent('month', this),
    day: getDateComponent('day', this),
    weekday: getDateComponent('weekday', this),
    hour: getDateComponent('hour', this),
    minute: getDateComponent('minute', this),
    second: getDateComponent('second', this),
    ms: getDateComponent('ms', this),

    date: date => {
      date = $u.date(date);

      return date ? `${this.year(date)}-${this.month(date).twodigit}-${this.day(date).twodigit}` : '';
    },
    time: date => {
      date = $u.date(date);

      return date ? `${this.hour(date).twodigit}:${this.minute(date).twodigit}:${this.second(date).twodigit}` : '';
    },

    minutes: seconds => Math.floor(Math.abs(seconds) / 60) || 0,
    hours: seconds => Math.floor(Math.abs(seconds) / 3600) || 0,
    days: seconds => Math.floor(Math.abs(seconds) / 86400) || 0,
    weeks: seconds => Math.floor(Math.abs(seconds) / 604800) || 0,
    months: seconds => Math.floor(Math.abs(seconds) / (30.4368 * 86400)) || 0,
    years: seconds => Math.floor(Math.abs(seconds) / (30.4368 * 86400 * 12)) || 0,

    localTimezone: -(new Date()).getTimezoneOffset(),

    // Log to the console and return
    log: (...args) => {
      console.log(...args.map(val));
      return args[0];
    },

    // Other special variables (some updated via events)
    $mouse: {x: 0, y: 0},

    get $hash() {
      return location.hash.slice(1);
    },

    // "Private" helpers
    util: $u
  });

  /*
  // Make function names case insensitive
  _._Trap = new Proxy(_, {
    get: (functions, property) => {
      let ret;

      const canonicalProperty =
          Mavo.getCanonicalProperty(functions, property) ||
          Mavo.getCanonicalProperty(Math, property);

      if (canonicalProperty) {
        ret = functions[canonicalProperty];

        if (ret === undefined) {
          ret = Math[canonicalProperty];
        }
      }

      if (ret !== undefined) {
        if (typeof ret === 'function') {
            // For when function names are used as unquoted strings, see #160
          ret.toString = () => property;
        }

        return ret;
      }

        // Still not found? Maybe it's a global
      if (property in _) {
        return _[property];
      }

        // Prevent undefined at all costs
      return property;
    },

      // Super ugly hack, but otherwise data is not
      // the local variable it should be, but the string "data"
      // so all property lookups fail.
    has: (functions, property) => property !== 'data'
  });

  */

  return _;
};
