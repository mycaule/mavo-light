<p align="center">
  A lighter version of Mavo.io
</p>

<p align="center">
  <a href="http://travis-ci.org/mycaule/mavo-light"><img src="https://api.travis-ci.org/mycaule/mavo-light.svg?branch=master" alt="Build Status"></a>
  <a href="https://david-dm.org/mycaule/mavo-light"><img src="https://david-dm.org/mycaule/mavo-light/status.svg" alt="dependencies Status"></a>
  <a href="https://david-dm.org/mycaule/mavo-light?type=dev"><img src="https://david-dm.org/mycaule/mavo-light/dev-status.svg" alt="devDependencies Status"></a>
  <br>
  <br>
</p>

## Roadmap

- [ ] ES6, unit tests and modern build tools with Node.js v8.9.3 LTS
- [ ] Modularize by ES6 imports, Support for JS bundlers
- [ ] Modularize `bliss` and `jsep`
- [x] Remove CSS stuff

## Documentation

### Event handlers

`mv-change`

### Delete buttons

## Refactoring notes

* [Chained assignment](https://stackoverflow.com/questions/3387247/in-javascript-is-chained-assignment-okay)
* [Bliss and ES6 modules](https://github.com/LeaVerou/bliss/issues/107)
* [30 seconds of code](https://30secondsofcode.org)
* [Modern JS cheatsheet](https://github.com/mbeaudru/modern-js-cheatsheet)

## Contributions

Changes and improvements are welcome! Feel free to fork and open a pull request into `master`.

Please visit https://mavo.io for info on using Mavo.

Useful commands

```
# Running the tests
npm test

# Running old build method
gulp watch

# Running new build method
parcel build src/index.js
```
