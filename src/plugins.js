(function ($, $$) {
  Mavo.attributes.push('mv-plugins');

  var _ = Mavo.Plugins = {
    loaded: {},

    load() {
      _.plugins = new Set();

      $$('[mv-plugins]').forEach(element => {
        element
        .getAttribute('mv-plugins').trim().split(/\s+/)
        .forEach(plugin => _.plugins.add(plugin));
      });

      if (!_.plugins.size) {
        return Promise.resolve();
      }

    // Fetch plugin index
      return $.fetch(_.url + '/plugins.json', {
        responseType: 'json'
      }).then(xhr => {
      // Fetch plugins
        return Mavo.thenAll(xhr.response.plugin
        .filter(plugin => _.plugins.has(plugin.id))
        .map(plugin => {
          // Load plugin
          const filename = `mavo-${plugin.id}.js`;

          if (plugin.repo) {
            // Plugin hosted in a separate repo
            var url = `https://raw.githubusercontent.com/${plugin.repo}/master/${filename}`;

            return _.loaded[plugin.id] ? Promise.resolve() : $.fetch(url).then(xhr => {
              $.create('script', {
                textContent: xhr.responseText,
                inside: document.head
              });
            });
          }

            // Plugin hosted in the mavo-plugins repo
          var url = `${_.url}/${plugin.id}/${filename}`;

          return $.include(_.loaded[plugin.id], url);
        }));
      });
    },

    register(name, o = {}) {
      if (_.loaded[name]) {
      // Do not register same plugin twice
        return;
      }

      Mavo.hooks.add(o.hooks);

      for (const Class in o.extend) {
        const existing = Class == 'Mavo' ? Mavo : Mavo[Class];

        if ($.type(existing) === 'function') {
          $.Class(existing, o.extend[Class]);
        } else {
          $.extend(existing, o.extend[Class]);
        }
      }

      const ready = [];

      if (o.ready) {
        ready.push(o.ready);
      }

      if (o.dependencies) {
        const base = document.currentScript ? document.currentScript.src : location;
        const dependencies = o.dependencies.map(url => Mavo.load(url, base));
        ready.push(...dependencies);
      }

      if (ready.length) {
        Mavo.dependencies.push(...ready);
      }

      _.loaded[name] = o;

      if (o.init) {
        Promise.all(ready).then(() => o.init());
      }
    },

    url: 'https://plugins.mavo.io'
  };
})(Bliss, Bliss.$);
