/*
Build file to concat & minify files, compile SCSS and so on.
npm install gulp gulp-util gulp-uglify gulp-rename gulp-concat gulp-sourcemaps gulp-babel gulp-sass gulp-autoprefixer --save-dev
*/
// grab our gulp packages
const gulp = require('gulp');
const concat = require('gulp-concat');
const babel = require('gulp-babel');
const babili = require('gulp-babili');
const sourcemaps = require('gulp-sourcemaps');
const merge = require('merge2');
const injectVersion = require('gulp-inject-version');

const dependencies = ['../bliss/bliss.shy.min.js', '../stretchy/stretchy.min.js', '../jsep/build/jsep.min.js'];
const mavo = `mavo util locale locale.en plugins ui.bar ui.message permissions backend formats node group primitive ui.popup elements collection ui.itembar
expression domexpression expressions mv-if mv-value functions mavoscript
backend.dropbox backend.github`
  .split(/\s+/).map(path => `src/${path}.js`);
const versionOptions = {
  replace: /%%VERSION%%/g
};

gulp.task('concat', () => {
  const files = ['lib/*.js', ...mavo];

  return gulp.src(files)
    .pipe(sourcemaps.init())
    .pipe(injectVersion(versionOptions))
    .pipe(concat('mavo.js'))
    .pipe(sourcemaps.write('maps'))
    .pipe(gulp.dest('dist'));
});

const transpileStream = () => gulp.src(mavo)
  .pipe(sourcemaps.init())
  .pipe(injectVersion(versionOptions))
  .pipe(babel())
  .on('error', function (error) {
    console.error(error.message, error.loc);
    this.emit('end');
  });

gulp.task('transpile', () => {
  return merge(gulp.src(['lib/*.js']), transpileStream())
    .pipe(concat('mavo.es5.js'))
    .pipe(sourcemaps.write('maps'))
    .pipe(gulp.dest('dist'));
});

gulp.task('minify', () => {
  return merge(gulp.src('lib/*.js')
    , gulp.src(mavo)
      .pipe(babili())
  )
    .pipe(sourcemaps.init())
    .pipe(concat('mavo.min.js'))
    .pipe(sourcemaps.write('maps'))
    .pipe(gulp.dest('dist'));
});

gulp.task('minify-es5', () => {
  return merge(gulp.src('lib/*.js')
    , transpileStream()
      .pipe(babili())
  )
    .pipe(sourcemaps.init())
    .pipe(concat('mavo.es5.min.js'))
    .pipe(sourcemaps.write('maps'))
    .pipe(gulp.dest('dist'));
});

gulp.task('lib', () => {
  gulp.src(dependencies).pipe(gulp.dest('lib'));
});

gulp.task('watch', () => {
  gulp.watch(dependencies, ['lib']);
  gulp.watch(['src/*.js', 'lib/*.js'], ['concat']);
  gulp.watch(['dist/mavo.js'], ['transpile']);
});
gulp.task('default', ['concat', 'transpile', 'minify', 'minify-es5']);
