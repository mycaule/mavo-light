/* eslint new-cap: "off" */

import test from 'ava';
import {struct} from 'superstruct';
import fns from './functions';

const MvFunctions = struct({
  $hash: 'string | array',
  $mouse: struct({x: 'number', y: 'number'}),
  $now: 'date',
  $startup: 'date',
  $today: 'string',
  average: 'function',
  between: 'function',
  count: 'function',
  date: 'function',
  day: 'function',
  days: 'function',
  ends: 'function',
  filename: 'function',
  first: 'function',
  from: 'function',
  fromlast: 'function',
  get: 'function',
  hour: 'function',
  hours: 'function',
  idify: 'function',
  iff: 'function',
  intersects: 'function',
  join: 'function',
  json: 'function',
  last: 'function',
  len: 'function',
  localTimezone: 'number',
  log: 'function',
  lowercase: 'function',
  max: 'function',
  min: 'function',
  minute: 'function',
  minutes: 'function',
  month: 'function',
  months: 'function',
  ms: 'function',
  operators: struct({'=': 'string'}),
  readable: 'function',
  replace: 'function',
  reverse: 'function',
  round: 'function',
  search: 'function',
  second: 'function',
  starts: 'function',
  sum: 'function',
  th: 'function',
  time: 'function',
  to: 'function',
  tofirst: 'function',
  unique: 'function',
  uppercase: 'function',
  url: 'function',
  util: struct({numbers: 'function', fixDateString: 'function', date: 'function'}),
  weekday: 'function',
  weeks: 'function',
  year: 'function',
  years: 'function',
  _Trap: 'function?'
});

const MvFunctions2 = struct({
  IF: 'function',
  add: 'function',
  and: 'function',
  Avg: 'function',
  bigger: 'function',
  concatenate: 'function',
  div: 'function',
  divide: 'function',
  eq: 'function',
  equal: 'function',
  equality: 'function',
  filter: 'function',
  gt: 'function',
  gte: 'function',
  larger: 'function',
  lt: 'function',
  lte: 'function',
  minus: 'function',
  mod: 'function',
  mult: 'function',
  multiply: 'function',
  neq: 'function',
  not: 'function',
  or: 'function',
  ordinal: 'function',
  plus: 'function',
  product: 'function',
  smaller: 'function',
  subtract: 'function'
});

const Mocks = {
  locale: 'cn',
  Mavo: {
    getCanonicalProperty: () => true,

    value: () => true
  },
  Bliss(str) {
    console.log(str);
    return [];
  }
};

const val = str => {
  console.log(str);
  return '';
};

const location = {
  hash: []
};

test('Functions', t => {
  const result = fns(Mocks.Mavo, Mocks.Bliss, val, location);
  const [error] = MvFunctions.validate(result);
  t.is(error, undefined);
});
