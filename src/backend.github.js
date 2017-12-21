/* global Mavo, Bliss */

(function ($) {
  const _ = Mavo.Backend.register($.Class({
    extends: Mavo.Backend,
    id: 'Github',
    constructor() {
      this.permissions.on(['login', 'read']);

      this.key = this.mavo.element.getAttribute('mv-github-key') || '7e08e016048000bc594e';

    // Extract info for username, repo, branch, filepath from URL
      const extension = this.format.constructor.extensions[0] || '.json';

      this.defaults = {
        repo: 'mv-data',
        filename: `${this.mavo.id}${extension}`
      };

      this.info = _.parseURL(this.source, this.defaults);
      $.extend(this, this.info);

      this.login(true);
    },

    get(url) {
      if (this.isAuthenticated() || !this.path || url) {
      // Authenticated or raw API call
        const info = url ? _.parseURL(url) : this.info;

        if (info.apiData) {
        // GraphQL
          return this.request(info.apiCall, info.apiData, 'POST')
          .then(response => {
            if (response.errors && response.errors.length) {
              return Promise.reject(response.errors.map(x => x.message).join('\n'));
            }

            return response.data;
          });
        }

        return this.request(info.apiCall, null, 'GET', {
          headers: {
            Accept: 'application/vnd.github.squirrel-girl-preview'
          }
        }).then(response => Promise.resolve(info.repo ? _.atob(response.content) : response));
      }

      // Unauthenticated, use simple GET request to avoid rate limit
      url = new URL(`https://raw.githubusercontent.com/${this.username}/${this.repo}/${this.branch || 'master'}/${this.path}`);
      url.searchParams.set('timestamp', Date.now()); // Ensure fresh copy

      return $.fetch(url.href, {
        headers: {
          Accept: 'application/vnd.github.squirrel-girl-preview'
        }
      }).then(xhr => Promise.resolve(xhr.responseText), () => Promise.resolve(null));
    },

    upload(file, path = this.path) {
      return Mavo.readFile(file).then(dataURL => {
        let base64 = dataURL.slice(5); // Remove data:
        const media = base64.match(/^\w+\/[\w+]+/)[0];
        base64 = base64.replace(RegExp(`^${media}(;base64)?,`), '');
        path = this.path.replace(/[^/]+$/, '') + path; // Make upload path relative to existing path

        return this.put(base64, path, {isEncoded: true});
      })
      .then(fileInfo => this.getURL(path, fileInfo.commit.sha));
    },

  /**
   * Saves a file to the backend.
   * @param {String} serialized - Serialized data
   * @param {String} path - Optional file path
   * @return {Promise} A promise that resolves when the file is saved.
   */
    put(serialized, path = this.path, o = {}) {
      if (!path) {
      // Raw API calls are read-only for now
        return;
      }

      const repoCall = `repos/${this.username}/${this.repo}`;
      let fileCall = `${repoCall}/contents/${path}`;
      const commitPrefix = this.mavo.element.getAttribute('mv-github-commit-prefix') || '';

    // Create repo if it doesn’t exist
      const repoInfo = this.repoInfo || this.request('user/repos', {name: this.repo}, 'POST').then(repoInfo => this.repoInfo = repoInfo);

      serialized = o.isEncoded ? serialized : _.btoa(serialized);

      return Promise.resolve(repoInfo)
      .then(repoInfo => {
        if (!this.canPush()) {
          // Does not have permission to commit, create a fork
          return this.request(`${repoCall}/forks`, {name: this.repo}, 'POST')
            .then(forkInfo => {
              fileCall = `repos/${forkInfo.full_name}/contents/${path}`;
              return this.forkInfo = forkInfo;
            })
            .then(forkInfo => {
              // Ensure that fork is created (they take a while)
              let timeout;
              const test = (resolve, reject) => {
                clearTimeout(timeout);
                this.request(`repos/${forkInfo.full_name}/commits`, {until: '1970-01-01T00:00:00Z'}, 'HEAD')
                  .then(x => {
                    resolve(forkInfo);
                  })
                  .catch(x => {
                    // Try again after 1 second
                    timeout = setTimeout(test, 1000);
                  });
              };

              return new Promise(test);
            });
        }

        return repoInfo;
      })
      .then(repoInfo => {
        return this.request(fileCall, {
          ref: this.branch
        }).then(fileInfo => this.request(fileCall, {
          message: commitPrefix + this.mavo._('gh-updated-file', {name: fileInfo.name || 'file'}),
          content: serialized,
          branch: this.branch,
          sha: fileInfo.sha
        }, 'PUT'), xhr => {
          if (xhr.status === 404) {
            // File does not exist, create it
            return this.request(fileCall, {
              message: commitPrefix + 'Created file',
              content: serialized,
              branch: this.branch
            }, 'PUT');
          }

          return xhr;
        });
      })
      .then(fileInfo => {
        if (this.forkInfo) {
          // We saved in a fork, do we have a pull request?
          this.request(`repos/${this.username}/${this.repo}/pulls`, {
            head: `${this.user.username}:${this.branch}`,
            base: this.branch
          }).then(prs => {
            this.pullRequest(prs[0]);
          });
        }

        return fileInfo;
      });
    },

    pullRequest(existing) {
      const previewURL = new URL(location);
      previewURL.searchParams.set(this.mavo.id + '-storage', `https://github.com/${this.forkInfo.full_name}/${this.path}`);
      const message = this.mavo._('gh-edit-suggestion-saved-in-profile', {previewURL});

      if (this.notice) {
        this.notice.close();
      }

      if (existing) {
      // We already have a pull request, ask about closing it
        this.notice = this.mavo.message(`${message}
        ${this.mavo._('gh-edit-suggestion-notreviewed')}
        <form onsubmit="return false">
          <button class="mv-danger">${this.mavo._('gh-edit-suggestion-revoke')}</button>
        </form>`, {
          classes: 'mv-inline',
          dismiss: ['button', 'submit']
        });

        this.notice.closed.then(form => {
          if (!form) {
            return;
          }

        // Close PR
          this.request(`repos/${this.username}/${this.repo}/pulls/${existing.number}`, {
            state: 'closed'
          }, 'POST').then(prInfo => {
            new Mavo.UI.Message(this.mavo, `<a href="${prInfo.html_url}">${this.mavo._('gh-edit-suggestion-cancelled')}</a>`, {
              dismiss: ['button', 'timeout']
            });

            this.pullRequest();
          });
        });
      } else {
      // Ask about creating a PR
        this.notice = this.mavo.message(`${message}
        ${this.mavo._('gh-edit-suggestion-instructions')}
        <form onsubmit="return false">
          <textarea name="edits" class="mv-autosize" placeholder="${this.mavo._('gh-edit-suggestion-reason-placeholder')}"></textarea>
          <button>${this.mavo._('gh-edit-suggestion-send')}</button>
        </form>`, {
          classes: 'mv-inline',
          dismiss: ['button', 'submit']
        });

        this.notice.closed.then(form => {
          if (!form) {
            return;
          }

        // We want to send a pull request
          this.request(`repos/${this.username}/${this.repo}/pulls`, {
            title: this.mavo._('gh-edit-suggestion-title'),
            body: this.mavo._('gh-edit-suggestion-body', {
              description: form.elements.edits.value,
              previewURL
            }),
            head: `${this.user.username}:${this.branch}`,
            base: this.branch
          }, 'POST').then(prInfo => {
            new Mavo.UI.Message(this.mavo, `<a href="${prInfo.html_url}">${this.mavo._('gh-edit-suggestion-sent')}</a>`, {
              dismiss: ['button', 'timeout']
            });

            this.pullRequest(prInfo);
          });
        });
      }
    },

    login(passive) {
      return this.oAuthenticate(passive)
      .then(() => this.getUser())
      .catch(xhr => {
        if (xhr.status === 401) {
          // Unauthorized. Access token we have is invalid, discard it
          this.logout();
        }
      })
      .then(u => {
        if (this.user) {
          this.permissions.on(['edit', 'save', 'logout']);

          if (this.repo) {
            return this.request(`repos/${this.username}/${this.repo}`)
              .then(repoInfo => {
                if (this.branch === undefined) {
                  this.branch = repoInfo.default_branch;
                }

                return this.repoInfo = repoInfo;
              });
          }
        }
      });
    },

    canPush() {
      if (this.repoInfo) {
        return this.repoInfo.permissions.push;
      }

    // Repo does not exist so we can't check permissions
    // Just check if authenticated user is the same as our URL username
      return this.user && this.user.username.toLowerCase() === this.username.toLowerCase();
    },

    oAuthParams: () => '&scope=repo,gist',

    logout() {
      return this.oAuthLogout().then(() => {
        this.user = null;
      });
    },

    getUser() {
      if (this.user) {
        return Promise.resolve(this.user);
      }

      return this.request('user').then(info => {
        this.user = {
          username: info.login,
          name: info.name || info.login,
          avatar: info.avatar_url,
          url: 'https://github.com/' + info.login,
          info
        };

        $.fire(this.mavo.element, 'mv-login', {backend: this});
      });
    },

    getURL(path = this.path, sha) {
      const repoInfo = this.forkInfo || this.repoInfo;
      const repo = repoInfo.full_name;
      path = path.replace(/ /g, '%20');

      repoInfo.pagesInfo = repoInfo.pagesInfo || this.request(`repos/${repo}/pages`, {}, 'GET', {
        headers: {
          Accept: 'application/vnd.github.mister-fantastic-preview+json'
        }
      });

      return repoInfo.pagesInfo.then(pagesInfo => pagesInfo.html_url + path)
      .catch(xhr => {
        // No Github Pages, return rawgit URL
        if (sha) {
          return `https://cdn.rawgit.com/${repo}/${sha}/${path}`;
        }

        return `https://rawgit.com/${repo}/${this.branch}/${path}`;
      });
    },

    static: {
      apiDomain: 'https://api.github.com/',
      oAuth: 'https://github.com/login/oauth/authorize',

      test(url) {
        url = new URL(url, Mavo.base);
        return /\bgithub.com|raw.githubusercontent.com/.test(url.host);
      },

    /**
     * Parse Github URLs, return username, repo, branch, path
     */
      parseURL(source, defaults = {}) {
        const ret = {};
        const url = new URL(source, Mavo.base);
        const path = url.pathname.slice(1).split('/');

        ret.username = path.shift();
        ret.repo = path.shift() || defaults.repo;

        if (/raw.githubusercontent.com$/.test(url.host)) {
          ret.branch = path.shift();
        } else if (/api.github.com$/.test(url.host)) {
        // Raw API call
          const apiCall = url.pathname.slice(1) + url.search;
          const data = Mavo.Functions.from(source, '#'); // Url.* drops line breaks

          return {
            apiCall,
            apiData: apiCall === 'graphql' ? {query: data} : data
          };
        } else if (path[0] === 'blob') {
          path.shift();
          ret.branch = path.shift();
        }

        const lastSegment = path[path.length - 1];

        if (/\.\w+$/.test(lastSegment)) {
          ret.filename = lastSegment;
          path.splice(path.length - 1, 1);
        } else {
          ret.filename = defaults.filename;
        }

        ret.filepath = path.join('/') || defaults.filepath || '';
        ret.path = (ret.filepath ? ret.filepath + '/' : '') + ret.filename;

        ret.apiCall = `repos/${ret.username}/${ret.repo}/contents/${ret.path}`;

        return ret;
      },

    // Fix atob() and btoa() so they can handle Unicode
      btoa: str => btoa(unescape(encodeURIComponent(str))),
      atob: str => decodeURIComponent(escape(window.atob(str)))
    }
  }));
})(Bliss);
