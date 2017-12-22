/* eslint no-unused-vars: "off" */
/* eslint new-cap: "off" */

import test from 'ava';
import {struct} from 'superstruct';
import fns from './functions';
import Mocks from './mocks/objects';

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

test('Functions', t => {
  const result = fns(Mocks.Mavo, Mocks.Bliss, Mocks.location);
  const [error] = MvFunctions.validate(result);
  t.is(error, undefined);
});

test('Date and Time Functions', t => {
  const MvFn = fns(Mocks.Mavo, Mocks.Bliss, Mocks.location);
  const date = new Date();
  const diff10mins = 10 * 60 * 1000;
  const diff10hours = diff10mins * 60;
  const diff10days = diff10hours * 24;
  const diff10weeks = diff10days * 7;
  const diff10months = diff10weeks * 4.4;
  const diff10years = diff10months * 12;
  const date1 = new Date(date.getTime() + diff10mins);
  const date2 = new Date(date.getTime() + diff10hours);
  const date3 = new Date(date.getTime() + diff10days);
  const date4 = new Date(date.getTime() + diff10weeks);
  const date5 = new Date(date.getTime() + diff10months);
  const date6 = new Date(date.getTime() + diff10years);

  const results = {
    year: MvFn.year(date),
    month: MvFn.month(date),
    weekday: MvFn.weekday(date),
    day: MvFn.day(date),
    hour: MvFn.hour(date),
    minute: MvFn.minute(date),
    second: MvFn.second(date),
    date: MvFn.date(date),
    time: MvFn.time(date),
    minutes: MvFn.minutes((date1 - date) / 1000),
    hours: MvFn.hours((date2 - date) / 1000),
    days: MvFn.days((date3 - date) / 1000),
    weeks: MvFn.weeks((date4 - date) / 1000),
    months: MvFn.months((date5 - date) / 1000),
    years: MvFn.years((date6 - date) / 1000)
  };

  console.log(results);
  t.true(results.year > 2016);
  t.true(results.month > 0 && results.month <= 12);
  t.true(results.weekday > 0 && results.weekday <= 7);
  t.true(results.day > 0 && results.day <= 31);
  t.true(results.hour >= 0 && results.hour < 24);
  t.true(results.minute >= 0 && results.minute < 60);
  t.true(results.second >= 0 && results.second < 60);
  t.is(results.date.length, 10);
  t.true(results.date.includes('-'));
  t.is(results.time.length, 8);
  t.true(results.time.includes(':'));
  t.is(results.minutes, 10);
  t.is(results.hours, 10);
  t.is(results.days, 10);
  t.is(results.weeks, 10);
  t.is(results.months, 10);
  t.is(results.years, 10);

  // Weekday(date).name
  // weekday(date).shortname
  // month(date).twodigit
  // month(date).name
  // year(date).twodigit
});

test('Text Functions', t => {
  const MvFn = fns(Mocks.Mavo, Mocks.Bliss, Mocks.location);
  t.is(MvFn.len('foo'), 3);
  t.is(MvFn.search('abcd', 'cd'), 2);
  t.is(MvFn.starts('abcd', 'b'), false);
  t.is(MvFn.ends('abcd', 'd'), true);
  t.is(MvFn.replace('abbbc', 'b', 'd'), 'adddc');
  // T.is(MvFn.replace('abbbbbbc', 'b', 'b', 3), 'abc');
  t.is(MvFn.idify('Chicken Liver Pâté! 😋'), 'chicken-liver-pate');
  t.is(MvFn.readable('fooBar-baz'), 'Foo bar baz');
  t.is(MvFn.uppercase('Foo'), 'FOO');
  t.is(MvFn.lowercase('Foo'), 'foo');
  t.is(MvFn.from('foo.bar.boy', '.'), 'bar.boy');
  t.is(MvFn.fromlast('foo.bar.boy', '.'), 'boy');
  t.is(MvFn.to('foo.bar.boy', '.'), 'foo.bar');
  t.is(MvFn.tofirst('foo.bar.boy', '.'), 'foo');
  // T.is(MvFn.between('foo@gmail.com', '@', '.'), 'gmail');

  t.is(MvFn.join(['a', 'b', 'c'], ', '), 'a, b, c');
  t.is(MvFn.join([1, 2, 'a'], ', '), '1, 2, a');
});
