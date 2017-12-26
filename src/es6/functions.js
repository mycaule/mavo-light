/* eslint no-unused-vars: "off" */

import v from 'voca';
import {getMilliseconds, getSeconds, getMinutes, getHours, getDay, getDaysInMonth, getMonth, getYear, format} from 'date-fns';

// // Functions available inside Mavo expressions

export default (Mavo, $, location) => {
  const val = Mavo.value;
  const locale = 'en-US';
  const getCanonicalProperty = Mavo.getCanonicalProperty;
  const toArray = Mavo.toArray;
  const match = Mavo.match;
  const base = Mavo.base;
  const safeToJSON = Mavo.safeToJSON;

  // Convert argument to string
  const str = (str = '') => {
    str = val(str);
    return !str && str !== 0 ? '' : String(str);
  };

  const empty = v => {
    v = val(v);
    return v === null || v === false || v === '';
  };

  const not = v => {
    return !val(v);
  };

  const toLocaleString = (date, options) => {
    let ret = date.toLocaleString(locale, options);

    ret = ret.replace(/\u200e/g, ''); // Stupid Edge bug

    return ret;
  };

  const $u = {
    numbers(array, args) {
      array = Array.isArray(array) ? array : (args ? $(args) : [array]);

      return array.filter(number => !isNaN(number) && val(number) !== '').map(n => Number(n));
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
      const canonicalProperty = getCanonicalProperty(obj, property);

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
      return toArray(array).filter(a => !empty(a)).length;
    },

    reverse(array) {
      return toArray(array).slice().reverse();
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
      const needleRegex = RegExp(v.escapeRegExp(needle), 'g');
      let ret = haystack;
      let prev;
      let counter = 0;

      while (ret !== prev && (counter++ < iterations)) {
        prev = ret;
        ret = ret.replace(needleRegex, replacement);
      }

      return ret;
    },

    len: text => text.length,

    // Case insensitive search
    search: (haystack, needle) => v.indexOf(haystack, needle),
    starts: (haystack, needle) => v.startsWith(haystack, needle),
    ends: (haystack, needle) => v.endsWith(haystack, needle),
    join: (array, glue) => array.join(glue),

    idify: str => v.slugify(str),

    // Convert an identifier to readable text that can be used as a label
    readable: str => v(str).snakeCase().replaceAll('_', ' ').capitalize().value(),

    uppercase: v.upperCase,
    lowercase: v.lowerCase,

    from: (haystack, needle) => {
      const i = v.indexOf(haystack, needle);
      return v.slice(haystack, i + 1);
    },

    fromlast: (haystack, needle) => {
      const i = v.lastIndexOf(haystack, needle);
      return v.slice(haystack, i + 1);
    },

    to: (haystack, needle) => {
      const i = v.lastIndexOf(haystack, needle);
      return v.slice(haystack, 0, i);
    },

    tofirst: (haystack, needle) => {
      const i = v.indexOf(haystack, needle);
      return v.slice(haystack, 0, i);
    },

    between: (haystack, from, to, tight) => {
      [haystack, from, to] = [str(haystack), str(from), str(to)];

      const i1 = from ? haystack[tight ? 'lastIndexOf' : 'indexOf'](from) : -1;
      const i2 = haystack[tight ? 'indexOf' : 'lastIndexOf'](to);

      if ((from && i1 === -1) || i2 === -1) {
        return '';
      }

      return haystack.slice(i1 + 1, i2 === -1 || !to ? haystack.length : i2);
    },

    filename: url => match(new URL(str(url), base).pathname, /[^/]+?$/),

    json: data => safeToJSON(data),

    // // Date functions
    get $now() {
      return new Date();
    },

    $startup: new Date(), // Like $now, but doesn't update

    year: getYear,
    month: d => getMonth(d) + 1,
    day: d => format(d, 'DD'),
    weekday: getDay,
    hour: getHours,
    minute: getMinutes,
    second: getSeconds,
    ms: getMilliseconds,

    time: date => format(date, 'HH:mm:ss'),
    date: date => format(date, 'YYYY-MM-DD')
  });

  Object.assign(_, {
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

    get $today() {
      return _.date(new Date());
    }
  });

  /*
  // Make function names case insensitive
  _._Trap = new Proxy(_, {
    get: (functions, property) => {
      let ret;

      const canonicalProperty =
          getCanonicalProperty(functions, property) ||
          getCanonicalProperty(Math, property);

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
