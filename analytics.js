(function outer(modules, cache, entries){

  /**
   * Global
   */

  var global = (function(){ return this; })();

  /**
   * Require `name`.
   *
   * @param {String} name
   * @param {Boolean} jumped
   * @api public
   */

  function require(name, jumped){
    if (cache[name]) return cache[name].exports;
    if (modules[name]) return call(name, require);
    throw new Error('cannot find module "' + name + '"');
  }

  /**
   * Call module `id` and cache it.
   *
   * @param {Number} id
   * @param {Function} require
   * @return {Function}
   * @api private
   */

  function call(id, require){
    var m = cache[id] = { exports: {} };
    var mod = modules[id];
    var name = mod[2];
    var fn = mod[0];

    fn.call(m.exports, function(req){
      var dep = modules[id][1][req];
      return require(dep ? dep : req);
    }, m, m.exports, outer, modules, cache, entries);

    // expose as `name`.
    if (name) cache[name] = cache[id];

    return cache[id].exports;
  }

  /**
   * Require all entries exposing them on global if needed.
   */

  for (var id in entries) {
    if (entries[id]) {
      global[entries[id]] = require(id);
    } else {
      require(id);
    }
  }

  /**
   * Duo flag.
   */

  require.duo = true;

  /**
   * Expose cache.
   */

  require.cache = cache;

  /**
   * Expose modules
   */

  require.modules = modules;

  /**
   * Return newest require.
   */

   return require;
})({
1: [function(require, module, exports) {

/**
 * Analytics.js
 *
 * (C) 2013 Segment.io Inc.
 */

var Integrations = require('analytics.js-integrations');
var Analytics = require('./analytics');
var each = require('each');


/**
 * Expose the `analytics` singleton.
 */

var analytics = module.exports = exports = new Analytics();

/**
 * Expose require
 */

analytics.require = require;

/**
 * Expose `VERSION`.
 */

exports.VERSION = require('./version');

/**
 * Add integrations.
 */

each(Integrations, function (name, Integration) {
  analytics.use(Integration);
});

}, {"./analytics":2,"./version":3,"analytics.js-integrations":4,"each":5}],
2: [function(require, module, exports) {

var after = require('after');
var bind = require('bind');
var callback = require('callback');
var canonical = require('canonical');
var clone = require('clone');
var cookie = require('./cookie');
var debug = require('debug');
var defaults = require('defaults');
var each = require('each');
var Emitter = require('emitter');
var group = require('./group');
var is = require('is');
var isEmail = require('is-email');
var isMeta = require('is-meta');
var newDate = require('new-date');
var on = require('event').bind;
var prevent = require('prevent');
var querystring = require('querystring');
var size = require('object').length;
var store = require('./store');
var url = require('url');
var user = require('./user');
var Facade = require('facade');
var Identify = Facade.Identify;
var Group = Facade.Group;
var Alias = Facade.Alias;
var Track = Facade.Track;
var Page = Facade.Page;


/**
 * Expose `Analytics`.
 */

exports = module.exports = Analytics;

/**
 * Expose `cookie`
 */

exports.cookie = cookie;
exports.store = store;

/**
 * Initialize a new `Analytics` instance.
 */

function Analytics () {
  this.Integrations = {};
  this._integrations = {};
  this._readied = false;
  this._timeout = 300;
  this._user = user; // BACKWARDS COMPATIBILITY
  bind.all(this);

  var self = this;
  this.on('initialize', function (settings, options) {
    if (options.initialPageview) self.page();
  });

  this.on('initialize', function () {
    self._parseQuery();
  });

}


/**
 * Event Emitter.
 */

Emitter(Analytics.prototype);


/**
 * Use a `plugin`.
 *
 * @param {Function} plugin
 * @return {Analytics}
 */

Analytics.prototype.use = function (plugin) {
  plugin(this);
  return this;
};


/**
 * Define a new `Integration`.
 *
 * @param {Function} Integration
 * @return {Analytics}
 */

Analytics.prototype.addIntegration = function (Integration) {
  var name = Integration.prototype.name;
  if (!name) throw new TypeError('attempted to add an invalid integration');
  this.Integrations[name] = Integration;
  return this;
};


/**
 * Initialize with the given integration `settings` and `options`. Aliased to
 * `init` for convenience.
 *
 * @param {Object} settings
 * @param {Object} options (optional)
 * @return {Analytics}
 */

Analytics.prototype.init =
Analytics.prototype.initialize = function (settings, options) {
  settings = settings || {};
  options = options || {};

  this._options(options);
  this._readied = false;
  this._integrations = {};

  // load user now that options are set
  user.load();
  group.load();

  // clean unknown integrations from settings
  var self = this;
  each(settings, function (name) {
    var Integration = self.Integrations[name];
    if (!Integration) delete settings[name];
  });

  // make ready callback
  var ready = after(size(settings), function () {
    self._readied = true;
    self.emit('ready');
  });

  // initialize integrations, passing ready
  each(settings, function (name, opts) {
    var Integration = self.Integrations[name];
    if (options.initialPageview && opts.initialPageview === false) {
      Integration.prototype.page = after(2, Integration.prototype.page);
    }

    var integration = new Integration(clone(opts));
    integration.once('ready', ready);
    integration.initialize();
    self._integrations[name] = integration;
  });

  // backwards compat with angular plugin.
  // TODO: remove
  this.initialized = true;

  this.emit('initialize', settings, options);
  return this;
};


/**
 * Identify a user by optional `id` and `traits`.
 *
 * @param {String} id (optional)
 * @param {Object} traits (optional)
 * @param {Object} options (optional)
 * @param {Function} fn (optional)
 * @return {Analytics}
 */

Analytics.prototype.identify = function (id, traits, options, fn) {
  if (is.fn(options)) fn = options, options = null;
  if (is.fn(traits)) fn = traits, options = null, traits = null;
  if (is.object(id)) options = traits, traits = id, id = user.id();


  // clone traits before we manipulate so we don't do anything uncouth, and take
  // from `user` so that we carryover anonymous traits
  user.identify(id, traits);
  id = user.id();
  traits = user.traits();

  this._invoke('identify', new Identify({
    options: options,
    traits: traits,
    userId: id
  }));

  // emit
  this.emit('identify', id, traits, options);
  this._callback(fn);
  return this;
};


/**
 * Return the current user.
 *
 * @return {Object}
 */

Analytics.prototype.user = function () {
  return user;
};


/**
 * Identify a group by optional `id` and `traits`. Or, if no arguments are
 * supplied, return the current group.
 *
 * @param {String} id (optional)
 * @param {Object} traits (optional)
 * @param {Object} options (optional)
 * @param {Function} fn (optional)
 * @return {Analytics or Object}
 */

Analytics.prototype.group = function (id, traits, options, fn) {
  if (0 === arguments.length) return group;
  if (is.fn(options)) fn = options, options = null;
  if (is.fn(traits)) fn = traits, options = null, traits = null;
  if (is.object(id)) options = traits, traits = id, id = group.id();


  // grab from group again to make sure we're taking from the source
  group.identify(id, traits);
  id = group.id();
  traits = group.traits();

  this._invoke('group', new Group({
    options: options,
    traits: traits,
    groupId: id
  }));

  this.emit('group', id, traits, options);
  this._callback(fn);
  return this;
};


/**
 * Track an `event` that a user has triggered with optional `properties`.
 *
 * @param {String} event
 * @param {Object} properties (optional)
 * @param {Object} options (optional)
 * @param {Function} fn (optional)
 * @return {Analytics}
 */

Analytics.prototype.track = function (event, properties, options, fn) {
  if (is.fn(options)) fn = options, options = null;
  if (is.fn(properties)) fn = properties, options = null, properties = null;

  this._invoke('track', new Track({
    properties: properties,
    options: options,
    event: event
  }));

  this.emit('track', event, properties, options);
  this._callback(fn);
  return this;
};


/**
 * Helper method to track an outbound link that would normally navigate away
 * from the page before the analytics calls were sent.
 *
 * BACKWARDS COMPATIBILITY: aliased to `trackClick`.
 *
 * @param {Element or Array} links
 * @param {String or Function} event
 * @param {Object or Function} properties (optional)
 * @return {Analytics}
 */

Analytics.prototype.trackClick =
Analytics.prototype.trackLink = function (links, event, properties) {
  if (!links) return this;
  if (is.element(links)) links = [links]; // always arrays, handles jquery

  var self = this;
  each(links, function (el) {
    on(el, 'click', function (e) {
      var ev = is.fn(event) ? event(el) : event;
      var props = is.fn(properties) ? properties(el) : properties;
      self.track(ev, props);

      if (el.href && el.target !== '_blank' && !isMeta(e)) {
        prevent(e);
        self._callback(function () {
          window.location.href = el.href;
        });
      }
    });
  });

  return this;
};


/**
 * Helper method to track an outbound form that would normally navigate away
 * from the page before the analytics calls were sent.
 *
 * BACKWARDS COMPATIBILITY: aliased to `trackSubmit`.
 *
 * @param {Element or Array} forms
 * @param {String or Function} event
 * @param {Object or Function} properties (optional)
 * @return {Analytics}
 */

Analytics.prototype.trackSubmit =
Analytics.prototype.trackForm = function (forms, event, properties) {
  if (!forms) return this;
  if (is.element(forms)) forms = [forms]; // always arrays, handles jquery

  var self = this;
  each(forms, function (el) {
    function handler (e) {
      prevent(e);

      var ev = is.fn(event) ? event(el) : event;
      var props = is.fn(properties) ? properties(el) : properties;
      self.track(ev, props);

      self._callback(function () {
        el.submit();
      });
    }

    // support the events happening through jQuery or Zepto instead of through
    // the normal DOM API, since `el.submit` doesn't bubble up events...
    var $ = window.jQuery || window.Zepto;
    if ($) {
      $(el).submit(handler);
    } else {
      on(el, 'submit', handler);
    }
  });

  return this;
};


/**
 * Trigger a pageview, labeling the current page with an optional `category`,
 * `name` and `properties`.
 *
 * @param {String} category (optional)
 * @param {String} name (optional)
 * @param {Object or String} properties (or path) (optional)
 * @param {Object} options (optional)
 * @param {Function} fn (optional)
 * @return {Analytics}
 */

Analytics.prototype.page = function (category, name, properties, options, fn) {
  if (is.fn(options)) fn = options, options = null;
  if (is.fn(properties)) fn = properties, options = properties = null;
  if (is.fn(name)) fn = name, options = properties = name = null;
  if (is.object(category)) options = name, properties = category, name = category = null;
  if (is.object(name)) options = properties, properties = name, name = null;
  if (is.string(category) && !is.string(name)) name = category, category = null;

  var defs = {
    path: canonicalPath(),
    referrer: document.referrer,
    title: document.title,
    search: location.search
  };

  if (name) defs.name = name;
  if (category) defs.category = category;

  properties = clone(properties) || {};
  defaults(properties, defs);
  properties.url = properties.url || canonicalUrl(properties.search);

  this._invoke('page', new Page({
    properties: properties,
    category: category,
    options: options,
    name: name
  }));

  this.emit('page', category, name, properties, options);
  this._callback(fn);
  return this;
};


/**
 * BACKWARDS COMPATIBILITY: convert an old `pageview` to a `page` call.
 *
 * @param {String} url (optional)
 * @param {Object} options (optional)
 * @return {Analytics}
 * @api private
 */

Analytics.prototype.pageview = function (url, options) {
  var properties = {};
  if (url) properties.path = url;
  this.page(properties);
  return this;
};


/**
 * Merge two previously unassociated user identities.
 *
 * @param {String} to
 * @param {String} from (optional)
 * @param {Object} options (optional)
 * @param {Function} fn (optional)
 * @return {Analytics}
 */

Analytics.prototype.alias = function (to, from, options, fn) {
  if (is.fn(options)) fn = options, options = null;
  if (is.fn(from)) fn = from, options = null, from = null;
  if (is.object(from)) options = from, from = null;

  this._invoke('alias', new Alias({
    options: options,
    from: from,
    to: to
  }));

  this.emit('alias', to, from, options);
  this._callback(fn);
  return this;
};


/**
 * Register a `fn` to be fired when all the analytics services are ready.
 *
 * @param {Function} fn
 * @return {Analytics}
 */

Analytics.prototype.ready = function (fn) {
  if (!is.fn(fn)) return this;
  this._readied
    ? callback.async(fn)
    : this.once('ready', fn);
  return this;
};


/**
 * Set the `timeout` (in milliseconds) used for callbacks.
 *
 * @param {Number} timeout
 */

Analytics.prototype.timeout = function (timeout) {
  this._timeout = timeout;
};


/**
 * Enable or disable debug.
 *
 * @param {String or Boolean} str
 */

Analytics.prototype.debug = function(str){
  if (0 == arguments.length || str) {
    debug.enable('analytics:' + (str || '*'));
  } else {
    debug.disable();
  }
};


/**
 * Apply options.
 *
 * @param {Object} options
 * @return {Analytics}
 * @api private
 */

Analytics.prototype._options = function (options) {
  options = options || {};
  cookie.options(options.cookie);
  store.options(options.localStorage);
  user.options(options.user);
  group.options(options.group);
  return this;
};


/**
 * Callback a `fn` after our defined timeout period.
 *
 * @param {Function} fn
 * @return {Analytics}
 * @api private
 */

Analytics.prototype._callback = function (fn) {
  callback.async(fn, this._timeout);
  return this;
};


/**
 * Call `method` with `facade` on all enabled integrations.
 *
 * @param {String} method
 * @param {Facade} facade
 * @return {Analytics}
 * @api private
 */

Analytics.prototype._invoke = function (method, facade) {
  var options = facade.options();

  this.emit('invoke', facade);

  each(this._integrations, function (name, integration) {
    if (!facade.enabled(name)) return;
    integration.invoke.call(integration, method, facade);
  });

  return this;
};

/**
 * Push `args`.
 *
 * @param {Array} args
 * @api private
 */

Analytics.prototype.push = function(args){
  var method = args.shift();
  if (!this[method]) return;
  this[method].apply(this, args);
};

/**
 * Parse the query string for callable methods.
 *
 * @return {Analytics}
 * @api private
 */

Analytics.prototype._parseQuery = function () {
  // Identify and track any `ajs_uid` and `ajs_event` parameters in the URL.
  var q = querystring.parse(window.location.search);
  if (q.ajs_uid) this.identify(q.ajs_uid);
  if (q.ajs_event) this.track(q.ajs_event);
  return this;
};


/**
 * Return the canonical path for the page.
 *
 * @return {String}
 */

function canonicalPath () {
  var canon = canonical();
  if (!canon) return window.location.pathname;
  var parsed = url.parse(canon);
  return parsed.pathname;
}

/**
 * Return the canonical URL for the page concat the given `search`
 * and strip the hash.
 *
 * @param {String} search
 * @return {String}
 */

function canonicalUrl (search) {
  var canon = canonical();
  if (canon) return ~canon.indexOf('?') ? canon : canon + search;
  var url = window.location.href;
  var i = url.indexOf('#');
  return -1 == i ? url : url.slice(0, i);
}

}, {"./cookie":6,"./group":7,"./store":8,"./user":9,"after":10,"bind":11,"callback":12,"canonical":13,"clone":14,"debug":15,"defaults":16,"each":5,"emitter":17,"is":18,"is-email":19,"is-meta":20,"new-date":21,"event":22,"prevent":23,"querystring":24,"object":25,"url":26,"facade":27}],
6: [function(require, module, exports) {

var bind = require('bind');
var cookie = require('cookie');
var clone = require('clone');
var defaults = require('defaults');
var json = require('json');
var topDomain = require('top-domain');


/**
 * Initialize a new `Cookie` with `options`.
 *
 * @param {Object} options
 */

function Cookie (options) {
  this.options(options);
}


/**
 * Get or set the cookie options.
 *
 * @param {Object} options
 *   @field {Number} maxage (1 year)
 *   @field {String} domain
 *   @field {String} path
 *   @field {Boolean} secure
 */

Cookie.prototype.options = function (options) {
  if (arguments.length === 0) return this._options;

  options = options || {};

  var domain = '.' + topDomain(window.location.href);

  // localhost cookies are special: http://curl.haxx.se/rfc/cookie_spec.html
  if ('.' == domain) domain = '';

  defaults(options, {
    maxage: 31536000000, // default to a year
    path: '/',
    domain: domain
  });

  this._options = options;
};


/**
 * Set a `key` and `value` in our cookie.
 *
 * @param {String} key
 * @param {Object} value
 * @return {Boolean} saved
 */

Cookie.prototype.set = function (key, value) {
  try {
    value = json.stringify(value);
    cookie(key, value, clone(this._options));
    return true;
  } catch (e) {
    return false;
  }
};


/**
 * Get a value from our cookie by `key`.
 *
 * @param {String} key
 * @return {Object} value
 */

Cookie.prototype.get = function (key) {
  try {
    var value = cookie(key);
    value = value ? json.parse(value) : null;
    return value;
  } catch (e) {
    return null;
  }
};


/**
 * Remove a value from our cookie by `key`.
 *
 * @param {String} key
 * @return {Boolean} removed
 */

Cookie.prototype.remove = function (key) {
  try {
    cookie(key, null, clone(this._options));
    return true;
  } catch (e) {
    return false;
  }
};


/**
 * Expose the cookie singleton.
 */

module.exports = bind.all(new Cookie());


/**
 * Expose the `Cookie` constructor.
 */

module.exports.Cookie = Cookie;

}, {"bind":11,"cookie":28,"clone":14,"defaults":16,"json":29,"top-domain":30}],
11: [function(require, module, exports) {

try {
  var bind = require('bind');
} catch (e) {
  var bind = require('bind-component');
}

var bindAll = require('bind-all');


/**
 * Expose `bind`.
 */

module.exports = exports = bind;


/**
 * Expose `bindAll`.
 */

exports.all = bindAll;


/**
 * Expose `bindMethods`.
 */

exports.methods = bindMethods;


/**
 * Bind `methods` on `obj` to always be called with the `obj` as context.
 *
 * @param {Object} obj
 * @param {String} methods...
 */

function bindMethods (obj, methods) {
  methods = [].slice.call(arguments, 1);
  for (var i = 0, method; method = methods[i]; i++) {
    obj[method] = bind(obj, obj[method]);
  }
  return obj;
}
}, {"bind":31,"bind-all":32}],
31: [function(require, module, exports) {
/**
 * Slice reference.
 */

var slice = [].slice;

/**
 * Bind `obj` to `fn`.
 *
 * @param {Object} obj
 * @param {Function|String} fn or string
 * @return {Function}
 * @api public
 */

module.exports = function(obj, fn){
  if ('string' == typeof fn) fn = obj[fn];
  if ('function' != typeof fn) throw new Error('bind() requires a function');
  var args = slice.call(arguments, 2);
  return function(){
    return fn.apply(obj, args.concat(slice.call(arguments)));
  }
};

}, {}],
32: [function(require, module, exports) {

try {
  var bind = require('bind');
  var type = require('type');
} catch (e) {
  var bind = require('bind-component');
  var type = require('type-component');
}

module.exports = function (obj) {
  for (var key in obj) {
    var val = obj[key];
    if (type(val) === 'function') obj[key] = bind(obj, obj[key]);
  }
  return obj;
};
}, {"bind":31,"type":33}],
33: [function(require, module, exports) {

/**
 * toString ref.
 */

var toString = Object.prototype.toString;

/**
 * Return the type of `val`.
 *
 * @param {Mixed} val
 * @return {String}
 * @api public
 */

module.exports = function(val){
  switch (toString.call(val)) {
    case '[object Function]': return 'function';
    case '[object Date]': return 'date';
    case '[object RegExp]': return 'regexp';
    case '[object Arguments]': return 'arguments';
    case '[object Array]': return 'array';
    case '[object String]': return 'string';
  }

  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (val && val.nodeType === 1) return 'element';
  if (val === Object(val)) return 'object';

  return typeof val;
};

}, {}],
28: [function(require, module, exports) {
/**
 * Encode.
 */

var encode = encodeURIComponent;

/**
 * Decode.
 */

var decode = decodeURIComponent;

/**
 * Set or get cookie `name` with `value` and `options` object.
 *
 * @param {String} name
 * @param {String} value
 * @param {Object} options
 * @return {Mixed}
 * @api public
 */

module.exports = function(name, value, options){
  switch (arguments.length) {
    case 3:
    case 2:
      return set(name, value, options);
    case 1:
      return get(name);
    default:
      return all();
  }
};

/**
 * Set cookie `name` to `value`.
 *
 * @param {String} name
 * @param {String} value
 * @param {Object} options
 * @api private
 */

function set(name, value, options) {
  options = options || {};
  var str = encode(name) + '=' + encode(value);

  if (null == value) options.maxage = -1;

  if (options.maxage) {
    options.expires = new Date(+new Date + options.maxage);
  }

  if (options.path) str += '; path=' + options.path;
  if (options.domain) str += '; domain=' + options.domain;
  if (options.expires) str += '; expires=' + options.expires.toGMTString();
  if (options.secure) str += '; secure';

  document.cookie = str;
}

/**
 * Return all cookies.
 *
 * @return {Object}
 * @api private
 */

function all() {
  return parse(document.cookie);
}

/**
 * Get cookie `name`.
 *
 * @param {String} name
 * @return {String}
 * @api private
 */

function get(name) {
  return all()[name];
}

/**
 * Parse cookie `str`.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parse(str) {
  var obj = {};
  var pairs = str.split(/ *; */);
  var pair;
  if ('' == pairs[0]) return obj;
  for (var i = 0; i < pairs.length; ++i) {
    pair = pairs[i].split('=');
    obj[decode(pair[0])] = decode(pair[1]);
  }
  return obj;
}

}, {}],
14: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var type;

try {
  type = require('type');
} catch(e){
  type = require('type-component');
}

/**
 * Module exports.
 */

module.exports = clone;

/**
 * Clones objects.
 *
 * @param {Mixed} any object
 * @api public
 */

function clone(obj){
  switch (type(obj)) {
    case 'object':
      var copy = {};
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
          copy[key] = clone(obj[key]);
        }
      }
      return copy;

    case 'array':
      var copy = new Array(obj.length);
      for (var i = 0, l = obj.length; i < l; i++) {
        copy[i] = clone(obj[i]);
      }
      return copy;

    case 'regexp':
      // from millermedeiros/amd-utils - MIT
      var flags = '';
      flags += obj.multiline ? 'm' : '';
      flags += obj.global ? 'g' : '';
      flags += obj.ignoreCase ? 'i' : '';
      return new RegExp(obj.source, flags);

    case 'date':
      return new Date(obj.getTime());

    default: // string, number, boolean, …
      return obj;
  }
}

}, {"type":33}],
16: [function(require, module, exports) {
'use strict';

/**
 * Merge default values.
 *
 * @param {Object} dest
 * @param {Object} defaults
 * @return {Object}
 * @api public
 */
var defaults = function (dest, src, recursive) {
  for (var prop in src) {
    if (recursive && dest[prop] instanceof Object && src[prop] instanceof Object) {
      dest[prop] = defaults(dest[prop], src[prop], true);
    } else if (! (prop in dest)) {
      dest[prop] = src[prop];
    }
  }

  return dest;
};

/**
 * Expose `defaults`.
 */
module.exports = defaults;

}, {}],
29: [function(require, module, exports) {

var json = window.JSON || {};
var stringify = json.stringify;
var parse = json.parse;

module.exports = parse && stringify
  ? JSON
  : require('json-fallback');

}, {"json-fallback":34}],
34: [function(require, module, exports) {
/*
    json2.js
    2014-02-04

    Public Domain.

    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

    See http://www.JSON.org/js.html


    This code should be minified before deployment.
    See http://javascript.crockford.com/jsmin.html

    USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
    NOT CONTROL.


    This file creates a global JSON object containing two methods: stringify
    and parse.

        JSON.stringify(value, replacer, space)
            value       any JavaScript value, usually an object or array.

            replacer    an optional parameter that determines how object
                        values are stringified for objects. It can be a
                        function or an array of strings.

            space       an optional parameter that specifies the indentation
                        of nested structures. If it is omitted, the text will
                        be packed without extra whitespace. If it is a number,
                        it will specify the number of spaces to indent at each
                        level. If it is a string (such as '\t' or '&nbsp;'),
                        it contains the characters used to indent at each level.

            This method produces a JSON text from a JavaScript value.

            When an object value is found, if the object contains a toJSON
            method, its toJSON method will be called and the result will be
            stringified. A toJSON method does not serialize: it returns the
            value represented by the name/value pair that should be serialized,
            or undefined if nothing should be serialized. The toJSON method
            will be passed the key associated with the value, and this will be
            bound to the value

            For example, this would serialize Dates as ISO strings.

                Date.prototype.toJSON = function (key) {
                    function f(n) {
                        // Format integers to have at least two digits.
                        return n < 10 ? '0' + n : n;
                    }

                    return this.getUTCFullYear()   + '-' +
                         f(this.getUTCMonth() + 1) + '-' +
                         f(this.getUTCDate())      + 'T' +
                         f(this.getUTCHours())     + ':' +
                         f(this.getUTCMinutes())   + ':' +
                         f(this.getUTCSeconds())   + 'Z';
                };

            You can provide an optional replacer method. It will be passed the
            key and value of each member, with this bound to the containing
            object. The value that is returned from your method will be
            serialized. If your method returns undefined, then the member will
            be excluded from the serialization.

            If the replacer parameter is an array of strings, then it will be
            used to select the members to be serialized. It filters the results
            such that only members with keys listed in the replacer array are
            stringified.

            Values that do not have JSON representations, such as undefined or
            functions, will not be serialized. Such values in objects will be
            dropped; in arrays they will be replaced with null. You can use
            a replacer function to replace those with JSON values.
            JSON.stringify(undefined) returns undefined.

            The optional space parameter produces a stringification of the
            value that is filled with line breaks and indentation to make it
            easier to read.

            If the space parameter is a non-empty string, then that string will
            be used for indentation. If the space parameter is a number, then
            the indentation will be that many spaces.

            Example:

            text = JSON.stringify(['e', {pluribus: 'unum'}]);
            // text is '["e",{"pluribus":"unum"}]'


            text = JSON.stringify(['e', {pluribus: 'unum'}], null, '\t');
            // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

            text = JSON.stringify([new Date()], function (key, value) {
                return this[key] instanceof Date ?
                    'Date(' + this[key] + ')' : value;
            });
            // text is '["Date(---current time---)"]'


        JSON.parse(text, reviver)
            This method parses a JSON text to produce an object or array.
            It can throw a SyntaxError exception.

            The optional reviver parameter is a function that can filter and
            transform the results. It receives each of the keys and values,
            and its return value is used instead of the original value.
            If it returns what it received, then the structure is not modified.
            If it returns undefined then the member is deleted.

            Example:

            // Parse the text. Values that look like ISO date strings will
            // be converted to Date objects.

            myData = JSON.parse(text, function (key, value) {
                var a;
                if (typeof value === 'string') {
                    a =
/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
                    if (a) {
                        return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
                            +a[5], +a[6]));
                    }
                }
                return value;
            });

            myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
                var d;
                if (typeof value === 'string' &&
                        value.slice(0, 5) === 'Date(' &&
                        value.slice(-1) === ')') {
                    d = new Date(value.slice(5, -1));
                    if (d) {
                        return d;
                    }
                }
                return value;
            });


    This is a reference implementation. You are free to copy, modify, or
    redistribute.
*/

/*jslint evil: true, regexp: true */

/*members "", "\b", "\t", "\n", "\f", "\r", "\"", JSON, "\\", apply,
    call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
    getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
    lastIndex, length, parse, prototype, push, replace, slice, stringify,
    test, toJSON, toString, valueOf
*/


// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

(function () {
    'use strict';

    var JSON = module.exports = {};

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function () {

            return isFinite(this.valueOf())
                ? this.getUTCFullYear()     + '-' +
                    f(this.getUTCMonth() + 1) + '-' +
                    f(this.getUTCDate())      + 'T' +
                    f(this.getUTCHours())     + ':' +
                    f(this.getUTCMinutes())   + ':' +
                    f(this.getUTCSeconds())   + 'Z'
                : null;
        };

        String.prototype.toJSON      =
            Number.prototype.toJSON  =
            Boolean.prototype.toJSON = function () {
                return this.valueOf();
            };
    }

    var cx,
        escapable,
        gap,
        indent,
        meta,
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string'
                ? c
                : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' &&
                typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case 'string':
            return quote(value);

        case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value) ? String(value) : 'null';

        case 'boolean':
        case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

        case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

            if (!value) {
                return 'null';
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0
                    ? '[]'
                    : gap
                    ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']'
                    : '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    if (typeof rep[i] === 'string') {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0
                ? '{}'
                : gap
                ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}'
                : '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== 'function') {
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === 'string') {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' &&
                    (typeof replacer !== 'object' ||
                    typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

            return str('', {'': value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/
                    .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                        .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                        .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function'
                    ? walk({'': j}, '')
                    : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
}());

}, {}],
30: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var parse = require('url').parse;

/**
 * Expose `domain`
 */

module.exports = domain;

/**
 * RegExp
 */

var regexp = /[a-z0-9][a-z0-9\-]*[a-z0-9]\.[a-z\.]{2,6}$/i;

/**
 * Get the top domain.
 * 
 * Official Grammar: http://tools.ietf.org/html/rfc883#page-56
 * Look for tlds with up to 2-6 characters.
 * 
 * Example:
 * 
 *      domain('http://localhost:3000/baz');
 *      // => ''
 *      domain('http://dev:3000/baz');
 *      // => ''
 *      domain('http://127.0.0.1:3000/baz');
 *      // => ''
 *      domain('http://segment.io/baz');
 *      // => 'segment.io'
 * 
 * @param {String} url
 * @return {String}
 * @api public
 */

function domain(url){
  var host = parse(url).hostname;
  var match = host.match(regexp);
  return match ? match[0] : '';
};

}, {"url":26}],
26: [function(require, module, exports) {

/**
 * Parse the given `url`.
 *
 * @param {String} str
 * @return {Object}
 * @api public
 */

exports.parse = function(url){
  var a = document.createElement('a');
  a.href = url;
  return {
    href: a.href,
    host: a.host,
    port: a.port,
    hash: a.hash,
    hostname: a.hostname,
    pathname: a.pathname,
    protocol: a.protocol,
    search: a.search,
    query: a.search.slice(1)
  }
};

/**
 * Check if `url` is absolute.
 *
 * @param {String} url
 * @return {Boolean}
 * @api public
 */

exports.isAbsolute = function(url){
  if (0 == url.indexOf('//')) return true;
  if (~url.indexOf('://')) return true;
  return false;
};

/**
 * Check if `url` is relative.
 *
 * @param {String} url
 * @return {Boolean}
 * @api public
 */

exports.isRelative = function(url){
  return ! exports.isAbsolute(url);
};

/**
 * Check if `url` is cross domain.
 *
 * @param {String} url
 * @return {Boolean}
 * @api public
 */

exports.isCrossDomain = function(url){
  url = exports.parse(url);
  return url.hostname != location.hostname
    || url.port != location.port
    || url.protocol != location.protocol;
};
}, {}],
7: [function(require, module, exports) {

var debug = require('debug')('analytics:group');
var Entity = require('./entity');
var inherit = require('inherit');
var bind = require('bind');


/**
 * Group defaults
 */

Group.defaults = {
  persist: true,
  cookie: {
    key: 'ajs_group_id'
  },
  localStorage: {
    key: 'ajs_group_properties'
  }
};


/**
 * Initialize a new `Group` with `options`.
 *
 * @param {Object} options
 */

function Group (options) {
  this.defaults = Group.defaults;
  this.debug = debug;
  Entity.call(this, options);
}


/**
 * Inherit `Entity`
 */

inherit(Group, Entity);


/**
 * Expose the group singleton.
 */

module.exports = bind.all(new Group());


/**
 * Expose the `Group` constructor.
 */

module.exports.Group = Group;

}, {"./entity":35,"debug":15,"inherit":36,"bind":11}],
35: [function(require, module, exports) {

var traverse = require('isodate-traverse');
var defaults = require('defaults');
var cookie = require('./cookie');
var store = require('./store');
var extend = require('extend');
var clone = require('clone');


/**
 * Expose `Entity`
 */

module.exports = Entity;


/**
 * Initialize new `Entity` with `options`.
 *
 * @param {Object} options
 */

function Entity(options){
  this.options(options);
}


/**
 * Get or set storage `options`.
 *
 * @param {Object} options
 *   @property {Object} cookie
 *   @property {Object} localStorage
 *   @property {Boolean} persist (default: `true`)
 */

Entity.prototype.options = function (options) {
  if (arguments.length === 0) return this._options;
  options || (options = {});
  defaults(options, this.defaults || {});
  this._options = options;
};


/**
 * Get or set the entity's `id`.
 *
 * @param {String} id
 */

Entity.prototype.id = function (id) {
  switch (arguments.length) {
    case 0: return this._getId();
    case 1: return this._setId(id);
  }
};


/**
 * Get the entity's id.
 *
 * @return {String}
 */

Entity.prototype._getId = function () {
  var ret = this._options.persist
    ? cookie.get(this._options.cookie.key)
    : this._id;
  return ret === undefined ? null : ret;
};


/**
 * Set the entity's `id`.
 *
 * @param {String} id
 */

Entity.prototype._setId = function (id) {
  if (this._options.persist) {
    cookie.set(this._options.cookie.key, id);
  } else {
    this._id = id;
  }
};


/**
 * Get or set the entity's `traits`.
 *
 * BACKWARDS COMPATIBILITY: aliased to `properties`
 *
 * @param {Object} traits
 */

Entity.prototype.properties =
Entity.prototype.traits = function (traits) {
  switch (arguments.length) {
    case 0: return this._getTraits();
    case 1: return this._setTraits(traits);
  }
};


/**
 * Get the entity's traits. Always convert ISO date strings into real dates,
 * since they aren't parsed back from local storage.
 *
 * @return {Object}
 */

Entity.prototype._getTraits = function () {
  var ret = this._options.persist
    ? store.get(this._options.localStorage.key)
    : this._traits;
  return ret ? traverse(clone(ret)) : {};
};


/**
 * Set the entity's `traits`.
 *
 * @param {Object} traits
 */

Entity.prototype._setTraits = function (traits) {
  traits || (traits = {});
  if (this._options.persist) {
    store.set(this._options.localStorage.key, traits);
  } else {
    this._traits = traits;
  }
};


/**
 * Identify the entity with an `id` and `traits`. If we it's the same entity,
 * extend the existing `traits` instead of overwriting.
 *
 * @param {String} id
 * @param {Object} traits
 */

Entity.prototype.identify = function (id, traits) {
  traits || (traits = {});
  var current = this.id();
  if (current === null || current === id) traits = extend(this.traits(), traits);
  if (id) this.id(id);
  this.debug('identify %o, %o', id, traits);
  this.traits(traits);
  this.save();
};


/**
 * Save the entity to local storage and the cookie.
 *
 * @return {Boolean}
 */

Entity.prototype.save = function () {
  if (!this._options.persist) return false;
  cookie.set(this._options.cookie.key, this.id());
  store.set(this._options.localStorage.key, this.traits());
  return true;
};


/**
 * Log the entity out, reseting `id` and `traits` to defaults.
 */

Entity.prototype.logout = function () {
  this.id(null);
  this.traits({});
  cookie.remove(this._options.cookie.key);
  store.remove(this._options.localStorage.key);
};


/**
 * Reset all entity state, logging out and returning options to defaults.
 */

Entity.prototype.reset = function () {
  this.logout();
  this.options({});
};


/**
 * Load saved entity `id` or `traits` from storage.
 */

Entity.prototype.load = function () {
  this.id(cookie.get(this._options.cookie.key));
  this.traits(store.get(this._options.localStorage.key));
};


}, {"./cookie":6,"./store":8,"isodate-traverse":37,"defaults":16,"extend":38,"clone":14}],
8: [function(require, module, exports) {

var bind = require('bind');
var defaults = require('defaults');
var store = require('store.js');


/**
 * Initialize a new `Store` with `options`.
 *
 * @param {Object} options
 */

function Store (options) {
  this.options(options);
}


/**
 * Set the `options` for the store.
 *
 * @param {Object} options
 *   @field {Boolean} enabled (true)
 */

Store.prototype.options = function (options) {
  if (arguments.length === 0) return this._options;

  options = options || {};
  defaults(options, { enabled : true });

  this.enabled  = options.enabled && store.enabled;
  this._options = options;
};


/**
 * Set a `key` and `value` in local storage.
 *
 * @param {String} key
 * @param {Object} value
 */

Store.prototype.set = function (key, value) {
  if (!this.enabled) return false;
  return store.set(key, value);
};


/**
 * Get a value from local storage by `key`.
 *
 * @param {String} key
 * @return {Object}
 */

Store.prototype.get = function (key) {
  if (!this.enabled) return null;
  return store.get(key);
};


/**
 * Remove a value from local storage by `key`.
 *
 * @param {String} key
 */

Store.prototype.remove = function (key) {
  if (!this.enabled) return false;
  return store.remove(key);
};


/**
 * Expose the store singleton.
 */

module.exports = bind.all(new Store());


/**
 * Expose the `Store` constructor.
 */

module.exports.Store = Store;

}, {"bind":11,"defaults":16,"store.js":39}],
39: [function(require, module, exports) {
var json             = require('json')
  , store            = {}
  , win              = window
	,	doc              = win.document
	,	localStorageName = 'localStorage'
	,	namespace        = '__storejs__'
	,	storage;

store.disabled = false
store.set = function(key, value) {}
store.get = function(key) {}
store.remove = function(key) {}
store.clear = function() {}
store.transact = function(key, defaultVal, transactionFn) {
	var val = store.get(key)
	if (transactionFn == null) {
		transactionFn = defaultVal
		defaultVal = null
	}
	if (typeof val == 'undefined') { val = defaultVal || {} }
	transactionFn(val)
	store.set(key, val)
}
store.getAll = function() {}

store.serialize = function(value) {
	return json.stringify(value)
}
store.deserialize = function(value) {
	if (typeof value != 'string') { return undefined }
	try { return json.parse(value) }
	catch(e) { return value || undefined }
}

// Functions to encapsulate questionable FireFox 3.6.13 behavior
// when about.config::dom.storage.enabled === false
// See https://github.com/marcuswestin/store.js/issues#issue/13
function isLocalStorageNameSupported() {
	try { return (localStorageName in win && win[localStorageName]) }
	catch(err) { return false }
}

if (isLocalStorageNameSupported()) {
	storage = win[localStorageName]
	store.set = function(key, val) {
		if (val === undefined) { return store.remove(key) }
		storage.setItem(key, store.serialize(val))
		return val
	}
	store.get = function(key) { return store.deserialize(storage.getItem(key)) }
	store.remove = function(key) { storage.removeItem(key) }
	store.clear = function() { storage.clear() }
	store.getAll = function() {
		var ret = {}
		for (var i=0; i<storage.length; ++i) {
			var key = storage.key(i)
			ret[key] = store.get(key)
		}
		return ret
	}
} else if (doc.documentElement.addBehavior) {
	var storageOwner,
		storageContainer
	// Since #userData storage applies only to specific paths, we need to
	// somehow link our data to a specific path.  We choose /favicon.ico
	// as a pretty safe option, since all browsers already make a request to
	// this URL anyway and being a 404 will not hurt us here.  We wrap an
	// iframe pointing to the favicon in an ActiveXObject(htmlfile) object
	// (see: http://msdn.microsoft.com/en-us/library/aa752574(v=VS.85).aspx)
	// since the iframe access rules appear to allow direct access and
	// manipulation of the document element, even for a 404 page.  This
	// document can be used instead of the current document (which would
	// have been limited to the current path) to perform #userData storage.
	try {
		storageContainer = new ActiveXObject('htmlfile')
		storageContainer.open()
		storageContainer.write('<s' + 'cript>document.w=window</s' + 'cript><iframe src="/favicon.ico"></iframe>')
		storageContainer.close()
		storageOwner = storageContainer.w.frames[0].document
		storage = storageOwner.createElement('div')
	} catch(e) {
		// somehow ActiveXObject instantiation failed (perhaps some special
		// security settings or otherwse), fall back to per-path storage
		storage = doc.createElement('div')
		storageOwner = doc.body
	}
	function withIEStorage(storeFunction) {
		return function() {
			var args = Array.prototype.slice.call(arguments, 0)
			args.unshift(storage)
			// See http://msdn.microsoft.com/en-us/library/ms531081(v=VS.85).aspx
			// and http://msdn.microsoft.com/en-us/library/ms531424(v=VS.85).aspx
			storageOwner.appendChild(storage)
			storage.addBehavior('#default#userData')
			storage.load(localStorageName)
			var result = storeFunction.apply(store, args)
			storageOwner.removeChild(storage)
			return result
		}
	}

	// In IE7, keys may not contain special chars. See all of https://github.com/marcuswestin/store.js/issues/40
	var forbiddenCharsRegex = new RegExp("[!\"#$%&'()*+,/\\\\:;<=>?@[\\]^`{|}~]", "g")
	function ieKeyFix(key) {
		return key.replace(forbiddenCharsRegex, '___')
	}
	store.set = withIEStorage(function(storage, key, val) {
		key = ieKeyFix(key)
		if (val === undefined) { return store.remove(key) }
		storage.setAttribute(key, store.serialize(val))
		storage.save(localStorageName)
		return val
	})
	store.get = withIEStorage(function(storage, key) {
		key = ieKeyFix(key)
		return store.deserialize(storage.getAttribute(key))
	})
	store.remove = withIEStorage(function(storage, key) {
		key = ieKeyFix(key)
		storage.removeAttribute(key)
		storage.save(localStorageName)
	})
	store.clear = withIEStorage(function(storage) {
		var attributes = storage.XMLDocument.documentElement.attributes
		storage.load(localStorageName)
		for (var i=0, attr; attr=attributes[i]; i++) {
			storage.removeAttribute(attr.name)
		}
		storage.save(localStorageName)
	})
	store.getAll = withIEStorage(function(storage) {
		var attributes = storage.XMLDocument.documentElement.attributes
		var ret = {}
		for (var i=0, attr; attr=attributes[i]; ++i) {
			var key = ieKeyFix(attr.name)
			ret[attr.name] = store.deserialize(storage.getAttribute(key))
		}
		return ret
	})
}

try {
	store.set(namespace, namespace)
	if (store.get(namespace) != namespace) { store.disabled = true }
	store.remove(namespace)
} catch(e) {
	store.disabled = true
}
store.enabled = !store.disabled

module.exports = store;
}, {"json":29}],
37: [function(require, module, exports) {

var is = require('is');
var isodate = require('isodate');
var each;

try {
  each = require('each');
} catch (err) {
  each = require('each-component');
}

/**
 * Expose `traverse`.
 */

module.exports = traverse;

/**
 * Traverse an object or array, and return a clone with all ISO strings parsed
 * into Date objects.
 *
 * @param {Object} obj
 * @return {Object}
 */

function traverse (input, strict) {
  if (strict === undefined) strict = true;

  if (is.object(input)) {
    return object(input, strict);
  } else if (is.array(input)) {
    return array(input, strict);
  }
}

/**
 * Object traverser.
 *
 * @param {Object} obj
 * @param {Boolean} strict
 * @return {Object}
 */

function object (obj, strict) {
  each(obj, function (key, val) {
    if (isodate.is(val, strict)) {
      obj[key] = isodate.parse(val);
    } else if (is.object(val) || is.array(val)) {
      traverse(val, strict);
    }
  });
  return obj;
}

/**
 * Array traverser.
 *
 * @param {Array} arr
 * @param {Boolean} strict
 * @return {Array}
 */

function array (arr, strict) {
  each(arr, function (val, x) {
    if (is.object(val)) {
      traverse(val, strict);
    } else if (isodate.is(val, strict)) {
      arr[x] = isodate.parse(val);
    }
  });
  return arr;
}

}, {"is":40,"isodate":41,"each":5}],
40: [function(require, module, exports) {

var isEmpty = require('is-empty')
  , typeOf = require('type');


/**
 * Types.
 */

var types = [
  'arguments',
  'array',
  'boolean',
  'date',
  'element',
  'function',
  'null',
  'number',
  'object',
  'regexp',
  'string',
  'undefined'
];


/**
 * Expose type checkers.
 *
 * @param {Mixed} value
 * @return {Boolean}
 */

for (var i = 0, type; type = types[i]; i++) exports[type] = generate(type);


/**
 * Add alias for `function` for old browsers.
 */

exports.fn = exports['function'];


/**
 * Expose `empty` check.
 */

exports.empty = isEmpty;


/**
 * Expose `nan` check.
 */

exports.nan = function (val) {
  return exports.number(val) && val != val;
};


/**
 * Generate a type checker.
 *
 * @param {String} type
 * @return {Function}
 */

function generate (type) {
  return function (value) {
    return type === typeOf(value);
  };
}
}, {"is-empty":42,"type":33}],
42: [function(require, module, exports) {

/**
 * Expose `isEmpty`.
 */

module.exports = isEmpty;


/**
 * Has.
 */

var has = Object.prototype.hasOwnProperty;


/**
 * Test whether a value is "empty".
 *
 * @param {Mixed} val
 * @return {Boolean}
 */

function isEmpty (val) {
  if (null == val) return true;
  if ('number' == typeof val) return 0 === val;
  if (undefined !== val.length) return 0 === val.length;
  for (var key in val) if (has.call(val, key)) return false;
  return true;
}
}, {}],
41: [function(require, module, exports) {

/**
 * Matcher, slightly modified from:
 *
 * https://github.com/csnover/js-iso8601/blob/lax/iso8601.js
 */

var matcher = /^(\d{4})(?:-?(\d{2})(?:-?(\d{2}))?)?(?:([ T])(\d{2}):?(\d{2})(?::?(\d{2})(?:[,\.](\d{1,}))?)?(?:(Z)|([+\-])(\d{2})(?::?(\d{2}))?)?)?$/;


/**
 * Convert an ISO date string to a date. Fallback to native `Date.parse`.
 *
 * https://github.com/csnover/js-iso8601/blob/lax/iso8601.js
 *
 * @param {String} iso
 * @return {Date}
 */

exports.parse = function (iso) {
  var numericKeys = [1, 5, 6, 7, 8, 11, 12];
  var arr = matcher.exec(iso);
  var offset = 0;

  // fallback to native parsing
  if (!arr) return new Date(iso);

  // remove undefined values
  for (var i = 0, val; val = numericKeys[i]; i++) {
    arr[val] = parseInt(arr[val], 10) || 0;
  }

  // allow undefined days and months
  arr[2] = parseInt(arr[2], 10) || 1;
  arr[3] = parseInt(arr[3], 10) || 1;

  // month is 0-11
  arr[2]--;

  // allow abitrary sub-second precision
  if (arr[8]) arr[8] = (arr[8] + '00').substring(0, 3);

  // apply timezone if one exists
  if (arr[4] == ' ') {
    offset = new Date().getTimezoneOffset();
  } else if (arr[9] !== 'Z' && arr[10]) {
    offset = arr[11] * 60 + arr[12];
    if ('+' == arr[10]) offset = 0 - offset;
  }

  var millis = Date.UTC(arr[1], arr[2], arr[3], arr[5], arr[6] + offset, arr[7], arr[8]);
  return new Date(millis);
};


/**
 * Checks whether a `string` is an ISO date string. `strict` mode requires that
 * the date string at least have a year, month and date.
 *
 * @param {String} string
 * @param {Boolean} strict
 * @return {Boolean}
 */

exports.is = function (string, strict) {
  if (strict && false === /^\d{4}-\d{2}-\d{2}/.test(string)) return false;
  return matcher.test(string);
};
}, {}],
5: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var type = require('type');

/**
 * HOP reference.
 */

var has = Object.prototype.hasOwnProperty;

/**
 * Iterate the given `obj` and invoke `fn(val, i)`.
 *
 * @param {String|Array|Object} obj
 * @param {Function} fn
 * @api public
 */

module.exports = function(obj, fn){
  switch (type(obj)) {
    case 'array':
      return array(obj, fn);
    case 'object':
      if ('number' == typeof obj.length) return array(obj, fn);
      return object(obj, fn);
    case 'string':
      return string(obj, fn);
  }
};

/**
 * Iterate string chars.
 *
 * @param {String} obj
 * @param {Function} fn
 * @api private
 */

function string(obj, fn) {
  for (var i = 0; i < obj.length; ++i) {
    fn(obj.charAt(i), i);
  }
}

/**
 * Iterate object keys.
 *
 * @param {Object} obj
 * @param {Function} fn
 * @api private
 */

function object(obj, fn) {
  for (var key in obj) {
    if (has.call(obj, key)) {
      fn(key, obj[key]);
    }
  }
}

/**
 * Iterate array-ish.
 *
 * @param {Array|Object} obj
 * @param {Function} fn
 * @api private
 */

function array(obj, fn) {
  for (var i = 0; i < obj.length; ++i) {
    fn(obj[i], i);
  }
}
}, {"type":33}],
38: [function(require, module, exports) {

module.exports = function extend (object) {
    // Takes an unlimited number of extenders.
    var args = Array.prototype.slice.call(arguments, 1);

    // For each extender, copy their properties on our object.
    for (var i = 0, source; source = args[i]; i++) {
        if (!source) continue;
        for (var property in source) {
            object[property] = source[property];
        }
    }

    return object;
};
}, {}],
15: [function(require, module, exports) {
if ('undefined' == typeof window) {
  module.exports = require('./lib/debug');
} else {
  module.exports = require('./debug');
}

}, {"./lib/debug":43,"./debug":44}],
43: [function(require, module, exports) {
/**
 * Module dependencies.
 */

var tty = require('tty');

/**
 * Expose `debug()` as the module.
 */

module.exports = debug;

/**
 * Enabled debuggers.
 */

var names = []
  , skips = [];

(process.env.DEBUG || '')
  .split(/[\s,]+/)
  .forEach(function(name){
    name = name.replace('*', '.*?');
    if (name[0] === '-') {
      skips.push(new RegExp('^' + name.substr(1) + '$'));
    } else {
      names.push(new RegExp('^' + name + '$'));
    }
  });

/**
 * Colors.
 */

var colors = [6, 2, 3, 4, 5, 1];

/**
 * Previous debug() call.
 */

var prev = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Is stdout a TTY? Colored output is disabled when `true`.
 */

var isatty = tty.isatty(2);

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function color() {
  return colors[prevColor++ % colors.length];
}

/**
 * Humanize the given `ms`.
 *
 * @param {Number} m
 * @return {String}
 * @api private
 */

function humanize(ms) {
  var sec = 1000
    , min = 60 * 1000
    , hour = 60 * min;

  if (ms >= hour) return (ms / hour).toFixed(1) + 'h';
  if (ms >= min) return (ms / min).toFixed(1) + 'm';
  if (ms >= sec) return (ms / sec | 0) + 's';
  return ms + 'ms';
}

/**
 * Create a debugger with the given `name`.
 *
 * @param {String} name
 * @return {Type}
 * @api public
 */

function debug(name) {
  function disabled(){}
  disabled.enabled = false;

  var match = skips.some(function(re){
    return re.test(name);
  });

  if (match) return disabled;

  match = names.some(function(re){
    return re.test(name);
  });

  if (!match) return disabled;
  var c = color();

  function colored(fmt) {
    fmt = coerce(fmt);

    var curr = new Date;
    var ms = curr - (prev[name] || curr);
    prev[name] = curr;

    fmt = '  \u001b[9' + c + 'm' + name + ' '
      + '\u001b[3' + c + 'm\u001b[90m'
      + fmt + '\u001b[3' + c + 'm'
      + ' +' + humanize(ms) + '\u001b[0m';

    console.error.apply(this, arguments);
  }

  function plain(fmt) {
    fmt = coerce(fmt);

    fmt = new Date().toUTCString()
      + ' ' + name + ' ' + fmt;
    console.error.apply(this, arguments);
  }

  colored.enabled = plain.enabled = true;

  return isatty || process.env.DEBUG_COLORS
    ? colored
    : plain;
}

/**
 * Coerce `val`.
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

}, {}],
44: [function(require, module, exports) {

/**
 * Expose `debug()` as the module.
 */

module.exports = debug;

/**
 * Create a debugger with the given `name`.
 *
 * @param {String} name
 * @return {Type}
 * @api public
 */

function debug(name) {
  if (!debug.enabled(name)) return function(){};

  return function(fmt){
    fmt = coerce(fmt);

    var curr = new Date;
    var ms = curr - (debug[name] || curr);
    debug[name] = curr;

    fmt = name
      + ' '
      + fmt
      + ' +' + debug.humanize(ms);

    // This hackery is required for IE8
    // where `console.log` doesn't have 'apply'
    window.console
      && console.log
      && Function.prototype.apply.call(console.log, console, arguments);
  }
}

/**
 * The currently active debug mode names.
 */

debug.names = [];
debug.skips = [];

/**
 * Enables a debug mode by name. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} name
 * @api public
 */

debug.enable = function(name) {
  try {
    localStorage.debug = name;
  } catch(e){}

  var split = (name || '').split(/[\s,]+/)
    , len = split.length;

  for (var i = 0; i < len; i++) {
    name = split[i].replace('*', '.*?');
    if (name[0] === '-') {
      debug.skips.push(new RegExp('^' + name.substr(1) + '$'));
    }
    else {
      debug.names.push(new RegExp('^' + name + '$'));
    }
  }
};

/**
 * Disable debug output.
 *
 * @api public
 */

debug.disable = function(){
  debug.enable('');
};

/**
 * Humanize the given `ms`.
 *
 * @param {Number} m
 * @return {String}
 * @api private
 */

debug.humanize = function(ms) {
  var sec = 1000
    , min = 60 * 1000
    , hour = 60 * min;

  if (ms >= hour) return (ms / hour).toFixed(1) + 'h';
  if (ms >= min) return (ms / min).toFixed(1) + 'm';
  if (ms >= sec) return (ms / sec | 0) + 's';
  return ms + 'ms';
};

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

debug.enabled = function(name) {
  for (var i = 0, len = debug.skips.length; i < len; i++) {
    if (debug.skips[i].test(name)) {
      return false;
    }
  }
  for (var i = 0, len = debug.names.length; i < len; i++) {
    if (debug.names[i].test(name)) {
      return true;
    }
  }
  return false;
};

/**
 * Coerce `val`.
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

// persist

try {
  if (window.localStorage) debug.enable(localStorage.debug);
} catch(e){}

}, {}],
36: [function(require, module, exports) {

module.exports = function(a, b){
  var fn = function(){};
  fn.prototype = b.prototype;
  a.prototype = new fn;
  a.prototype.constructor = a;
};
}, {}],
9: [function(require, module, exports) {

var debug = require('debug')('analytics:user');
var Entity = require('./entity');
var inherit = require('inherit');
var bind = require('bind');
var cookie = require('./cookie');


/**
 * User defaults
 */

User.defaults = {
  persist: true,
  cookie: {
    key: 'ajs_user_id',
    oldKey: 'ajs_user'
  },
  localStorage: {
    key: 'ajs_user_traits'
  }
};


/**
 * Initialize a new `User` with `options`.
 *
 * @param {Object} options
 */

function User (options) {
  this.defaults = User.defaults;
  this.debug = debug;
  Entity.call(this, options);
}


/**
 * Inherit `Entity`
 */

inherit(User, Entity);


/**
 * Load saved user `id` or `traits` from storage.
 */

User.prototype.load = function () {
  if (this._loadOldCookie()) return;
  Entity.prototype.load.call(this);
};


/**
 * BACKWARDS COMPATIBILITY: Load the old user from the cookie.
 *
 * @return {Boolean}
 * @api private
 */

User.prototype._loadOldCookie = function () {
  var user = cookie.get(this._options.cookie.oldKey);
  if (!user) return false;

  this.id(user.id);
  this.traits(user.traits);
  cookie.remove(this._options.cookie.oldKey);
  return true;
};


/**
 * Expose the user singleton.
 */

module.exports = bind.all(new User());


/**
 * Expose the `User` constructor.
 */

module.exports.User = User;

}, {"./entity":35,"./cookie":6,"debug":15,"inherit":36,"bind":11}],
10: [function(require, module, exports) {

module.exports = function after (times, func) {
  // After 0, really?
  if (times <= 0) return func();

  // That's more like it.
  return function() {
    if (--times < 1) {
      return func.apply(this, arguments);
    }
  };
};
}, {}],
12: [function(require, module, exports) {
var next = require('next-tick');


/**
 * Expose `callback`.
 */

module.exports = callback;


/**
 * Call an `fn` back synchronously if it exists.
 *
 * @param {Function} fn
 */

function callback (fn) {
  if ('function' === typeof fn) fn();
}


/**
 * Call an `fn` back asynchronously if it exists. If `wait` is ommitted, the
 * `fn` will be called on next tick.
 *
 * @param {Function} fn
 * @param {Number} wait (optional)
 */

callback.async = function (fn, wait) {
  if ('function' !== typeof fn) return;
  if (!wait) return next(fn);
  setTimeout(fn, wait);
};


/**
 * Symmetry.
 */

callback.sync = callback;

}, {"next-tick":45}],
45: [function(require, module, exports) {
"use strict"

if (typeof setImmediate == 'function') {
  module.exports = function(f){ setImmediate(f) }
}
// legacy node.js
else if (typeof process != 'undefined' && typeof process.nextTick == 'function') {
  module.exports = process.nextTick
}
// fallback for other environments / postMessage behaves badly on IE8
else if (typeof window == 'undefined' || window.ActiveXObject || !window.postMessage) {
  module.exports = function(f){ setTimeout(f) };
} else {
  var q = [];

  window.addEventListener('message', function(){
    var i = 0;
    while (i < q.length) {
      try { q[i++](); }
      catch (e) {
        q = q.slice(i);
        window.postMessage('tic!', '*');
        throw e;
      }
    }
    q.length = 0;
  }, true);

  module.exports = function(fn){
    if (!q.length) window.postMessage('tic!', '*');
    q.push(fn);
  }
}

}, {}],
13: [function(require, module, exports) {
module.exports = function canonical () {
  var tags = document.getElementsByTagName('link');
  for (var i = 0, tag; tag = tags[i]; i++) {
    if ('canonical' == tag.getAttribute('rel')) return tag.getAttribute('href');
  }
};
}, {}],
17: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var index = require('indexof');

/**
 * Expose `Emitter`.
 */

module.exports = Emitter;

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks[event] = this._callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;
  this._callbacks = this._callbacks || {};

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  fn._off = on;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks[event];
    return this;
  }

  // remove specific handler
  var i = index(callbacks, fn._off || fn);
  if (~i) callbacks.splice(i, 1);
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks[event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks[event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

}, {"indexof":46}],
46: [function(require, module, exports) {
module.exports = function(arr, obj){
  if (arr.indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
}, {}],
18: [function(require, module, exports) {

var isEmpty = require('is-empty');

try {
  var typeOf = require('type');
} catch (e) {
  var typeOf = require('component-type');
}


/**
 * Types.
 */

var types = [
  'arguments',
  'array',
  'boolean',
  'date',
  'element',
  'function',
  'null',
  'number',
  'object',
  'regexp',
  'string',
  'undefined'
];


/**
 * Expose type checkers.
 *
 * @param {Mixed} value
 * @return {Boolean}
 */

for (var i = 0, type; type = types[i]; i++) exports[type] = generate(type);


/**
 * Add alias for `function` for old browsers.
 */

exports.fn = exports['function'];


/**
 * Expose `empty` check.
 */

exports.empty = isEmpty;


/**
 * Expose `nan` check.
 */

exports.nan = function (val) {
  return exports.number(val) && val != val;
};


/**
 * Generate a type checker.
 *
 * @param {String} type
 * @return {Function}
 */

function generate (type) {
  return function (value) {
    return type === typeOf(value);
  };
}
}, {"is-empty":42,"type":33,"component-type":33}],
19: [function(require, module, exports) {

/**
 * Expose `isEmail`.
 */

module.exports = isEmail;


/**
 * Email address matcher.
 */

var matcher = /.+\@.+\..+/;


/**
 * Loosely validate an email address.
 *
 * @param {String} string
 * @return {Boolean}
 */

function isEmail (string) {
  return matcher.test(string);
}
}, {}],
20: [function(require, module, exports) {
module.exports = function isMeta (e) {
    if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return true;

    // Logic that handles checks for the middle mouse button, based
    // on [jQuery](https://github.com/jquery/jquery/blob/master/src/event.js#L466).
    var which = e.which, button = e.button;
    if (!which && button !== undefined) {
      return (!button & 1) && (!button & 2) && (button & 4);
    } else if (which === 2) {
      return true;
    }

    return false;
};
}, {}],
21: [function(require, module, exports) {

var is = require('is');
var isodate = require('isodate');
var milliseconds = require('./milliseconds');
var seconds = require('./seconds');


/**
 * Returns a new Javascript Date object, allowing a variety of extra input types
 * over the native Date constructor.
 *
 * @param {Date|String|Number} val
 */

module.exports = function newDate (val) {
  if (is.date(val)) return val;
  if (is.number(val)) return new Date(toMs(val));

  // date strings
  if (isodate.is(val)) return isodate.parse(val);
  if (milliseconds.is(val)) return milliseconds.parse(val);
  if (seconds.is(val)) return seconds.parse(val);

  // fallback to Date.parse
  return new Date(val);
};


/**
 * If the number passed val is seconds from the epoch, turn it into milliseconds.
 * Milliseconds would be greater than 31557600000 (December 31, 1970).
 *
 * @param {Number} num
 */

function toMs (num) {
  if (num < 31557600000) return num * 1000;
  return num;
}
}, {"./milliseconds":47,"./seconds":48,"is":40,"isodate":41}],
47: [function(require, module, exports) {

/**
 * Matcher.
 */

var matcher = /\d{13}/;


/**
 * Check whether a string is a millisecond date string.
 *
 * @param {String} string
 * @return {Boolean}
 */

exports.is = function (string) {
  return matcher.test(string);
};


/**
 * Convert a millisecond string to a date.
 *
 * @param {String} millis
 * @return {Date}
 */

exports.parse = function (millis) {
  millis = parseInt(millis, 10);
  return new Date(millis);
};
}, {}],
48: [function(require, module, exports) {

/**
 * Matcher.
 */

var matcher = /\d{10}/;


/**
 * Check whether a string is a second date string.
 *
 * @param {String} string
 * @return {Boolean}
 */

exports.is = function (string) {
  return matcher.test(string);
};


/**
 * Convert a second string to a date.
 *
 * @param {String} seconds
 * @return {Date}
 */

exports.parse = function (seconds) {
  var millis = parseInt(seconds, 10) * 1000;
  return new Date(millis);
};
}, {}],
22: [function(require, module, exports) {

/**
 * Bind `el` event `type` to `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

exports.bind = function(el, type, fn, capture){
  if (el.addEventListener) {
    el.addEventListener(type, fn, capture || false);
  } else {
    el.attachEvent('on' + type, fn);
  }
  return fn;
};

/**
 * Unbind `el` event `type`'s callback `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

exports.unbind = function(el, type, fn, capture){
  if (el.removeEventListener) {
    el.removeEventListener(type, fn, capture || false);
  } else {
    el.detachEvent('on' + type, fn);
  }
  return fn;
};

}, {}],
23: [function(require, module, exports) {

/**
 * prevent default on the given `e`.
 * 
 * examples:
 * 
 *      anchor.onclick = prevent;
 *      anchor.onclick = function(e){
 *        if (something) return prevent(e);
 *      };
 * 
 * @param {Event} e
 */

module.exports = function(e){
  e = e || window.event
  return e.preventDefault
    ? e.preventDefault()
    : e.returnValue = false;
};

}, {}],
24: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var encode = encodeURIComponent;
var decode = decodeURIComponent;
var trim = require('trim');
var type = require('type');

/**
 * Parse the given query `str`.
 *
 * @param {String} str
 * @return {Object}
 * @api public
 */

exports.parse = function(str){
  if ('string' != typeof str) return {};

  str = trim(str);
  if ('' == str) return {};
  if ('?' == str.charAt(0)) str = str.slice(1);

  var obj = {};
  var pairs = str.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var parts = pairs[i].split('=');
    var key = decode(parts[0]);
    var m;

    if (m = /(\w+)\[(\d+)\]/.exec(key)) {
      obj[m[1]] = obj[m[1]] || [];
      obj[m[1]][m[2]] = decode(parts[1]);
      continue;
    }

    obj[parts[0]] = null == parts[1]
      ? ''
      : decode(parts[1]);
  }

  return obj;
};

/**
 * Stringify the given `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api public
 */

exports.stringify = function(obj){
  if (!obj) return '';
  var pairs = [];

  for (var key in obj) {
    var value = obj[key];

    if ('array' == type(value)) {
      for (var i = 0; i < value.length; ++i) {
        pairs.push(encode(key + '[' + i + ']') + '=' + encode(value[i]));
      }
      continue;
    }

    pairs.push(encode(key) + '=' + encode(obj[key]));
  }

  return pairs.join('&');
};

}, {"trim":49,"type":33}],
49: [function(require, module, exports) {

exports = module.exports = trim;

function trim(str){
  if (str.trim) return str.trim();
  return str.replace(/^\s*|\s*$/g, '');
}

exports.left = function(str){
  if (str.trimLeft) return str.trimLeft();
  return str.replace(/^\s*/, '');
};

exports.right = function(str){
  if (str.trimRight) return str.trimRight();
  return str.replace(/\s*$/, '');
};

}, {}],
25: [function(require, module, exports) {

/**
 * HOP ref.
 */

var has = Object.prototype.hasOwnProperty;

/**
 * Return own keys in `obj`.
 *
 * @param {Object} obj
 * @return {Array}
 * @api public
 */

exports.keys = Object.keys || function(obj){
  var keys = [];
  for (var key in obj) {
    if (has.call(obj, key)) {
      keys.push(key);
    }
  }
  return keys;
};

/**
 * Return own values in `obj`.
 *
 * @param {Object} obj
 * @return {Array}
 * @api public
 */

exports.values = function(obj){
  var vals = [];
  for (var key in obj) {
    if (has.call(obj, key)) {
      vals.push(obj[key]);
    }
  }
  return vals;
};

/**
 * Merge `b` into `a`.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 * @api public
 */

exports.merge = function(a, b){
  for (var key in b) {
    if (has.call(b, key)) {
      a[key] = b[key];
    }
  }
  return a;
};

/**
 * Return length of `obj`.
 *
 * @param {Object} obj
 * @return {Number}
 * @api public
 */

exports.length = function(obj){
  return exports.keys(obj).length;
};

/**
 * Check if `obj` is empty.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api public
 */

exports.isEmpty = function(obj){
  return 0 == exports.length(obj);
};
}, {}],
27: [function(require, module, exports) {

var Facade = require('./facade');

/**
 * Expose `Facade` facade.
 */

module.exports = Facade;

/**
 * Expose specific-method facades.
 */

Facade.Alias = require('./alias');
Facade.Group = require('./group');
Facade.Identify = require('./identify');
Facade.Track = require('./track');
Facade.Page = require('./page');
Facade.Screen = require('./screen');

}, {"./facade":50,"./alias":51,"./group":52,"./identify":53,"./track":54,"./page":55,"./screen":56}],
50: [function(require, module, exports) {

var clone = require('./utils').clone;
var isEnabled = require('./is-enabled');
var objCase = require('obj-case');
var traverse = require('isodate-traverse');

/**
 * Expose `Facade`.
 */

module.exports = Facade;

/**
 * Initialize a new `Facade` with an `obj` of arguments.
 *
 * @param {Object} obj
 */

function Facade (obj) {
  if (!obj.hasOwnProperty('timestamp')) obj.timestamp = new Date();
  else obj.timestamp = new Date(obj.timestamp);
  this.obj = obj;
}

/**
 * Return a proxy function for a `field` that will attempt to first use methods,
 * and fallback to accessing the underlying object directly. You can specify
 * deeply nested fields too like:
 *
 *   this.proxy('options.Librato');
 *
 * @param {String} field
 */

Facade.prototype.proxy = function (field) {
  var fields = field.split('.');
  field = fields.shift();

  // Call a function at the beginning to take advantage of facaded fields
  var obj = this[field] || this.field(field);
  if (!obj) return obj;
  if (typeof obj === 'function') obj = obj.call(this) || {};
  if (fields.length === 0) return transform(obj);

  obj = objCase(obj, fields.join('.'));
  return transform(obj);
};

/**
 * Directly access a specific `field` from the underlying object, returning a
 * clone so outsiders don't mess with stuff.
 *
 * @param {String} field
 * @return {Mixed}
 */

Facade.prototype.field = function (field) {
  var obj = this.obj[field];
  return transform(obj);
};

/**
 * Utility method to always proxy a particular `field`. You can specify deeply
 * nested fields too like:
 *
 *   Facade.proxy('options.Librato');
 *
 * @param {String} field
 * @return {Function}
 */

Facade.proxy = function (field) {
  return function () {
    return this.proxy(field);
  };
};

/**
 * Utility method to directly access a `field`.
 *
 * @param {String} field
 * @return {Function}
 */

Facade.field = function (field) {
  return function () {
    return this.field(field);
  };
};

/**
 * Get the basic json object of this facade.
 *
 * @return {Object}
 */

Facade.prototype.json = function () {
  var ret = clone(this.obj);
  if (this.type) ret.type = this.type();
  return ret;
};

/**
 * Get the options of a call (formerly called "context"). If you pass an
 * integration name, it will get the options for that specific integration, or
 * undefined if the integration is not enabled.
 *
 * @param {String} integration (optional)
 * @return {Object or Null}
 */

Facade.prototype.context =
Facade.prototype.options = function (integration) {
  var options = clone(this.obj.options || this.obj.context) || {};
  if (!integration) return clone(options);
  if (!this.enabled(integration)) return;
  var integrations = this.integrations();
  var value = integrations[integration] || objCase(integrations, integration);
  if ('boolean' == typeof value) value = {};
  return value || {};
};

/**
 * Check whether an integration is enabled.
 *
 * @param {String} integration
 * @return {Boolean}
 */

Facade.prototype.enabled = function (integration) {
  var allEnabled = this.proxy('options.providers.all');
  if (typeof allEnabled !== 'boolean') allEnabled = this.proxy('options.all');
  if (typeof allEnabled !== 'boolean') allEnabled = this.proxy('integrations.all');
  if (typeof allEnabled !== 'boolean') allEnabled = true;

  var enabled = allEnabled && isEnabled(integration);
  var options = this.integrations();

  // If the integration is explicitly enabled or disabled, use that
  // First, check options.providers for backwards compatibility
  if (options.providers && options.providers.hasOwnProperty(integration)) {
    enabled = options.providers[integration];
  }

  // Next, check for the integration's existence in 'options' to enable it.
  // If the settings are a boolean, use that, otherwise it should be enabled.
  if (options.hasOwnProperty(integration)) {
    var settings = options[integration];
    if (typeof settings === 'boolean') {
      enabled = settings;
    } else {
      enabled = true;
    }
  }

  return enabled ? true : false;
};

/**
 * Get all `integration` options.
 *
 * @param {String} integration
 * @return {Object}
 * @api private
 */

Facade.prototype.integrations = function(){
  return this.obj.integrations
    || this.proxy('options.providers')
    || this.options();
};

/**
 * Check whether the user is active.
 *
 * @return {Boolean}
 */

Facade.prototype.active = function () {
  var active = this.proxy('options.active');
  if (active === null || active === undefined) active = true;
  return active;
};

/**
 * Get `sessionId / anonymousId`.
 *
 * @return {Mixed}
 * @api public
 */

Facade.prototype.sessionId =
Facade.prototype.anonymousId = function(){
  return this.field('anonymousId')
    || this.field('sessionId');
};

/**
 * Get `groupId` from `context.groupId`.
 *
 * @return {String}
 * @api public
 */

Facade.prototype.groupId = Facade.proxy('options.groupId');

/**
 * Add a convenient way to get the library name and version
 */

Facade.prototype.library = function(){
  var library = this.proxy('options.library');
  if (!library) return { name: 'unknown', version: null };
  if (typeof library === 'string') return { name: library, version: null };
  return library;
};

/**
 * Setup some basic proxies.
 */

Facade.prototype.userId = Facade.field('userId');
Facade.prototype.channel = Facade.field('channel');
Facade.prototype.timestamp = Facade.field('timestamp');
Facade.prototype.userAgent = Facade.proxy('options.userAgent');
Facade.prototype.ip = Facade.proxy('options.ip');

/**
 * Return the cloned and traversed object
 *
 * @param {Mixed} obj
 * @return {Mixed}
 */

function transform(obj){
  var cloned = clone(obj);
  traverse(cloned);
  return cloned;
}

}, {"./utils":57,"./is-enabled":58,"obj-case":59,"isodate-traverse":60}],
57: [function(require, module, exports) {

/**
 * TODO: use component symlink, everywhere ?
 */

try {
  exports.inherit = require('inherit');
  exports.clone = require('clone');
} catch (e) {
  exports.inherit = require('inherit-component');
  exports.clone = require('clone-component');
}

}, {"inherit":61,"clone":62}],
61: [function(require, module, exports) {

module.exports = function(a, b){
  var fn = function(){};
  fn.prototype = b.prototype;
  a.prototype = new fn;
  a.prototype.constructor = a;
};
}, {}],
62: [function(require, module, exports) {
/**
 * Module dependencies.
 */

var type;
try {
  type = require('component-type');
} catch (_) {
  type = require('type');
}

/**
 * Module exports.
 */

module.exports = clone;

/**
 * Clones objects.
 *
 * @param {Mixed} any object
 * @api public
 */

function clone(obj){
  switch (type(obj)) {
    case 'object':
      var copy = {};
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
          copy[key] = clone(obj[key]);
        }
      }
      return copy;

    case 'array':
      var copy = new Array(obj.length);
      for (var i = 0, l = obj.length; i < l; i++) {
        copy[i] = clone(obj[i]);
      }
      return copy;

    case 'regexp':
      // from millermedeiros/amd-utils - MIT
      var flags = '';
      flags += obj.multiline ? 'm' : '';
      flags += obj.global ? 'g' : '';
      flags += obj.ignoreCase ? 'i' : '';
      return new RegExp(obj.source, flags);

    case 'date':
      return new Date(obj.getTime());

    default: // string, number, boolean, …
      return obj;
  }
}

}, {"component-type":33,"type":33}],
58: [function(require, module, exports) {

/**
 * A few integrations are disabled by default. They must be explicitly
 * enabled by setting options[Provider] = true.
 */

var disabled = {
  Salesforce: true,
  Marketo: true
};

/**
 * Check whether an integration should be enabled by default.
 *
 * @param {String} integration
 * @return {Boolean}
 */

module.exports = function (integration) {
  return ! disabled[integration];
};
}, {}],
59: [function(require, module, exports) {

var Case = require('case');
var identity = function(_){ return _; };


/**
 * Cases
 */

var cases = [
  identity,
  Case.upper,
  Case.lower,
  Case.snake,
  Case.pascal,
  Case.camel,
  Case.constant,
  Case.title,
  Case.capital,
  Case.sentence
];


/**
 * Module exports, export
 */

module.exports = module.exports.find = multiple(find);


/**
 * Export the replacement function, return the modified object
 */

module.exports.replace = function (obj, key, val) {
  multiple(replace).apply(this, arguments);
  return obj;
};


/**
 * Export the delete function, return the modified object
 */

module.exports.del = function (obj, key) {
  multiple(del).apply(this, arguments);
  return obj;
};


/**
 * Compose applying the function to a nested key
 */

function multiple (fn) {
  return function (obj, key, val) {
    var keys = key.split('.');
    if (keys.length === 0) return;

    while (keys.length > 1) {
      key = keys.shift();
      obj = find(obj, key);

      if (obj === null || obj === undefined) return;
    }

    key = keys.shift();
    return fn(obj, key, val);
  };
}


/**
 * Find an object by its key
 *
 * find({ first_name : 'Calvin' }, 'firstName')
 */

function find (obj, key) {
  for (var i = 0; i < cases.length; i++) {
    var cased = cases[i](key);
    if (obj.hasOwnProperty(cased)) return obj[cased];
  }
}


/**
 * Delete a value for a given key
 *
 * del({ a : 'b', x : 'y' }, 'X' }) -> { a : 'b' }
 */

function del (obj, key) {
  for (var i = 0; i < cases.length; i++) {
    var cased = cases[i](key);
    if (obj.hasOwnProperty(cased)) delete obj[cased];
  }
  return obj;
}


/**
 * Replace an objects existing value with a new one
 *
 * replace({ a : 'b' }, 'a', 'c') -> { a : 'c' }
 */

function replace (obj, key, val) {
  for (var i = 0; i < cases.length; i++) {
    var cased = cases[i](key);
    if (obj.hasOwnProperty(cased)) obj[cased] = val;
  }
  return obj;
}

}, {"case":63}],
63: [function(require, module, exports) {

var cases = require('./cases');


/**
 * Expose `determineCase`.
 */

module.exports = exports = determineCase;


/**
 * Determine the case of a `string`.
 *
 * @param {String} string
 * @return {String|Null}
 */

function determineCase (string) {
  for (var key in cases) {
    if (key == 'none') continue;
    var convert = cases[key];
    if (convert(string) == string) return key;
  }
  return null;
}


/**
 * Define a case by `name` with a `convert` function.
 *
 * @param {String} name
 * @param {Object} convert
 */

exports.add = function (name, convert) {
  exports[name] = cases[name] = convert;
};


/**
 * Add all the `cases`.
 */

for (var key in cases) {
  exports.add(key, cases[key]);
}
}, {"./cases":64}],
64: [function(require, module, exports) {

var camel = require('to-camel-case')
  , capital = require('to-capital-case')
  , constant = require('to-constant-case')
  , dot = require('to-dot-case')
  , none = require('to-no-case')
  , pascal = require('to-pascal-case')
  , sentence = require('to-sentence-case')
  , slug = require('to-slug-case')
  , snake = require('to-snake-case')
  , space = require('to-space-case')
  , title = require('to-title-case');


/**
 * Camel.
 */

exports.camel = camel;


/**
 * Pascal.
 */

exports.pascal = pascal;


/**
 * Dot. Should precede lowercase.
 */

exports.dot = dot;


/**
 * Slug. Should precede lowercase.
 */

exports.slug = slug;


/**
 * Snake. Should precede lowercase.
 */

exports.snake = snake;


/**
 * Space. Should precede lowercase.
 */

exports.space = space;


/**
 * Constant. Should precede uppercase.
 */

exports.constant = constant;


/**
 * Capital. Should precede sentence and title.
 */

exports.capital = capital;


/**
 * Title.
 */

exports.title = title;


/**
 * Sentence.
 */

exports.sentence = sentence;


/**
 * Convert a `string` to lower case from camel, slug, etc. Different that the
 * usual `toLowerCase` in that it will try to break apart the input first.
 *
 * @param {String} string
 * @return {String}
 */

exports.lower = function (string) {
  return none(string).toLowerCase();
};


/**
 * Convert a `string` to upper case from camel, slug, etc. Different that the
 * usual `toUpperCase` in that it will try to break apart the input first.
 *
 * @param {String} string
 * @return {String}
 */

exports.upper = function (string) {
  return none(string).toUpperCase();
};


/**
 * Invert each character in a `string` from upper to lower and vice versa.
 *
 * @param {String} string
 * @return {String}
 */

exports.inverse = function (string) {
  for (var i = 0, char; char = string[i]; i++) {
    if (!/[a-z]/i.test(char)) continue;
    var upper = char.toUpperCase();
    var lower = char.toLowerCase();
    string[i] = char == upper ? lower : upper;
  }
  return string;
};


/**
 * None.
 */

exports.none = none;
}, {"to-camel-case":65,"to-capital-case":66,"to-constant-case":67,"to-dot-case":68,"to-no-case":69,"to-pascal-case":70,"to-sentence-case":71,"to-slug-case":72,"to-snake-case":73,"to-space-case":74,"to-title-case":75}],
65: [function(require, module, exports) {

var toSpace = require('to-space-case');


/**
 * Expose `toCamelCase`.
 */

module.exports = toCamelCase;


/**
 * Convert a `string` to camel case.
 *
 * @param {String} string
 * @return {String}
 */


function toCamelCase (string) {
  return toSpace(string).replace(/\s(\w)/g, function (matches, letter) {
    return letter.toUpperCase();
  });
}
}, {"to-space-case":74}],
74: [function(require, module, exports) {

var clean = require('to-no-case');


/**
 * Expose `toSpaceCase`.
 */

module.exports = toSpaceCase;


/**
 * Convert a `string` to space case.
 *
 * @param {String} string
 * @return {String}
 */


function toSpaceCase (string) {
  return clean(string).replace(/[\W_]+(.|$)/g, function (matches, match) {
    return match ? ' ' + match : '';
  });
}
}, {"to-no-case":69}],
69: [function(require, module, exports) {

/**
 * Expose `toNoCase`.
 */

module.exports = toNoCase;


/**
 * Test whether a string is camel-case.
 */

var hasSpace = /\s/;
var hasCamel = /[a-z][A-Z]/;
var hasSeparator = /[\W_]/;


/**
 * Remove any starting case from a `string`, like camel or snake, but keep
 * spaces and punctuation that may be important otherwise.
 *
 * @param {String} string
 * @return {String}
 */

function toNoCase (string) {
  if (hasSpace.test(string)) return string.toLowerCase();

  if (hasSeparator.test(string)) string = unseparate(string);
  if (hasCamel.test(string)) string = uncamelize(string);
  return string.toLowerCase();
}


/**
 * Separator splitter.
 */

var separatorSplitter = /[\W_]+(.|$)/g;


/**
 * Un-separate a `string`.
 *
 * @param {String} string
 * @return {String}
 */

function unseparate (string) {
  return string.replace(separatorSplitter, function (m, next) {
    return next ? ' ' + next : '';
  });
}


/**
 * Camelcase splitter.
 */

var camelSplitter = /(.)([A-Z]+)/g;


/**
 * Un-camelcase a `string`.
 *
 * @param {String} string
 * @return {String}
 */

function uncamelize (string) {
  return string.replace(camelSplitter, function (m, previous, uppers) {
    return previous + ' ' + uppers.toLowerCase().split('').join(' ');
  });
}
}, {}],
66: [function(require, module, exports) {

var clean = require('to-no-case');


/**
 * Expose `toCapitalCase`.
 */

module.exports = toCapitalCase;


/**
 * Convert a `string` to capital case.
 *
 * @param {String} string
 * @return {String}
 */


function toCapitalCase (string) {
  return clean(string).replace(/(^|\s)(\w)/g, function (matches, previous, letter) {
    return previous + letter.toUpperCase();
  });
}
}, {"to-no-case":69}],
67: [function(require, module, exports) {

var snake = require('to-snake-case');


/**
 * Expose `toConstantCase`.
 */

module.exports = toConstantCase;


/**
 * Convert a `string` to constant case.
 *
 * @param {String} string
 * @return {String}
 */


function toConstantCase (string) {
  return snake(string).toUpperCase();
}
}, {"to-snake-case":73}],
73: [function(require, module, exports) {
var toSpace = require('to-space-case');


/**
 * Expose `toSnakeCase`.
 */

module.exports = toSnakeCase;


/**
 * Convert a `string` to snake case.
 *
 * @param {String} string
 * @return {String}
 */


function toSnakeCase (string) {
  return toSpace(string).replace(/\s/g, '_');
}

}, {"to-space-case":74}],
68: [function(require, module, exports) {

var toSpace = require('to-space-case');


/**
 * Expose `toDotCase`.
 */

module.exports = toDotCase;


/**
 * Convert a `string` to slug case.
 *
 * @param {String} string
 * @return {String}
 */


function toDotCase (string) {
  return toSpace(string).replace(/\s/g, '.');
}
}, {"to-space-case":74}],
70: [function(require, module, exports) {

var toSpace = require('to-space-case');


/**
 * Expose `toPascalCase`.
 */

module.exports = toPascalCase;


/**
 * Convert a `string` to pascal case.
 *
 * @param {String} string
 * @return {String}
 */


function toPascalCase (string) {
  return toSpace(string).replace(/(?:^|\s)(\w)/g, function (matches, letter) {
    return letter.toUpperCase();
  });
}
}, {"to-space-case":74}],
71: [function(require, module, exports) {

var clean = require('to-no-case');


/**
 * Expose `toSentenceCase`.
 */

module.exports = toSentenceCase;


/**
 * Convert a `string` to camel case.
 *
 * @param {String} string
 * @return {String}
 */


function toSentenceCase (string) {
  return clean(string).replace(/[a-z]/i, function (letter) {
    return letter.toUpperCase();
  });
}
}, {"to-no-case":69}],
72: [function(require, module, exports) {

var toSpace = require('to-space-case');


/**
 * Expose `toSlugCase`.
 */

module.exports = toSlugCase;


/**
 * Convert a `string` to slug case.
 *
 * @param {String} string
 * @return {String}
 */


function toSlugCase (string) {
  return toSpace(string).replace(/\s/g, '-');
}
}, {"to-space-case":74}],
75: [function(require, module, exports) {

var capital = require('to-capital-case')
  , escape = require('escape-regexp')
  , map = require('map')
  , minors = require('title-case-minors');


/**
 * Expose `toTitleCase`.
 */

module.exports = toTitleCase;


/**
 * Minors.
 */

var escaped = map(minors, escape);
var minorMatcher = new RegExp('[^^]\\b(' + escaped.join('|') + ')\\b', 'ig');
var colonMatcher = /:\s*(\w)/g;


/**
 * Convert a `string` to camel case.
 *
 * @param {String} string
 * @return {String}
 */


function toTitleCase (string) {
  return capital(string)
    .replace(minorMatcher, function (minor) {
      return minor.toLowerCase();
    })
    .replace(colonMatcher, function (letter) {
      return letter.toUpperCase();
    });
}
}, {"to-capital-case":66,"escape-regexp":76,"map":77,"title-case-minors":78}],
76: [function(require, module, exports) {

/**
 * Escape regexp special characters in `str`.
 *
 * @param {String} str
 * @return {String}
 * @api public
 */

module.exports = function(str){
  return String(str).replace(/([.*+?=^!:${}()|[\]\/\\])/g, '\\$1');
};
}, {}],
77: [function(require, module, exports) {

var each = require('each');


/**
 * Map an array or object.
 *
 * @param {Array|Object} obj
 * @param {Function} iterator
 * @return {Mixed}
 */

module.exports = function map (obj, iterator) {
  var arr = [];
  each(obj, function (o) {
    arr.push(iterator.apply(null, arguments));
  });
  return arr;
};
}, {"each":79}],
79: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var type = require('type');
var toFunction = require('to-function');

/**
 * HOP reference.
 */

var has = Object.prototype.hasOwnProperty;

/**
 * Iterate the given `obj` and invoke `fn(val, i)`
 * in optional context `ctx`.
 *
 * @param {String|Array|Object} obj
 * @param {Function} fn
 * @param {Object} [ctx]
 * @api public
 */

module.exports = function(obj, fn, ctx){
  fn = toFunction(fn);
  ctx = ctx || this;
  switch (type(obj)) {
    case 'array':
      return array(obj, fn, ctx);
    case 'object':
      if ('number' == typeof obj.length) return array(obj, fn, ctx);
      return object(obj, fn, ctx);
    case 'string':
      return string(obj, fn, ctx);
  }
};

/**
 * Iterate string chars.
 *
 * @param {String} obj
 * @param {Function} fn
 * @param {Object} ctx
 * @api private
 */

function string(obj, fn, ctx) {
  for (var i = 0; i < obj.length; ++i) {
    fn.call(ctx, obj.charAt(i), i);
  }
}

/**
 * Iterate object keys.
 *
 * @param {Object} obj
 * @param {Function} fn
 * @param {Object} ctx
 * @api private
 */

function object(obj, fn, ctx) {
  for (var key in obj) {
    if (has.call(obj, key)) {
      fn.call(ctx, key, obj[key]);
    }
  }
}

/**
 * Iterate array-ish.
 *
 * @param {Array|Object} obj
 * @param {Function} fn
 * @param {Object} ctx
 * @api private
 */

function array(obj, fn, ctx) {
  for (var i = 0; i < obj.length; ++i) {
    fn.call(ctx, obj[i], i);
  }
}

}, {"type":33,"to-function":80}],
80: [function(require, module, exports) {

/**
 * Module Dependencies
 */

var expr;
try {
  expr = require('props');
} catch(e) {
  expr = require('component-props');
}

/**
 * Expose `toFunction()`.
 */

module.exports = toFunction;

/**
 * Convert `obj` to a `Function`.
 *
 * @param {Mixed} obj
 * @return {Function}
 * @api private
 */

function toFunction(obj) {
  switch ({}.toString.call(obj)) {
    case '[object Object]':
      return objectToFunction(obj);
    case '[object Function]':
      return obj;
    case '[object String]':
      return stringToFunction(obj);
    case '[object RegExp]':
      return regexpToFunction(obj);
    default:
      return defaultToFunction(obj);
  }
}

/**
 * Default to strict equality.
 *
 * @param {Mixed} val
 * @return {Function}
 * @api private
 */

function defaultToFunction(val) {
  return function(obj){
    return val === obj;
  };
}

/**
 * Convert `re` to a function.
 *
 * @param {RegExp} re
 * @return {Function}
 * @api private
 */

function regexpToFunction(re) {
  return function(obj){
    return re.test(obj);
  };
}

/**
 * Convert property `str` to a function.
 *
 * @param {String} str
 * @return {Function}
 * @api private
 */

function stringToFunction(str) {
  // immediate such as "> 20"
  if (/^ *\W+/.test(str)) return new Function('_', 'return _ ' + str);

  // properties such as "name.first" or "age > 18" or "age > 18 && age < 36"
  return new Function('_', 'return ' + get(str));
}

/**
 * Convert `object` to a function.
 *
 * @param {Object} object
 * @return {Function}
 * @api private
 */

function objectToFunction(obj) {
  var match = {};
  for (var key in obj) {
    match[key] = typeof obj[key] === 'string'
      ? defaultToFunction(obj[key])
      : toFunction(obj[key]);
  }
  return function(val){
    if (typeof val !== 'object') return false;
    for (var key in match) {
      if (!(key in val)) return false;
      if (!match[key](val[key])) return false;
    }
    return true;
  };
}

/**
 * Built the getter function. Supports getter style functions
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function get(str) {
  var props = expr(str);
  if (!props.length) return '_.' + str;

  var val, i, prop;
  for (i = 0; i < props.length; i++) {
    prop = props[i];
    val = '_.' + prop;
    val = "('function' == typeof " + val + " ? " + val + "() : " + val + ")";

    // mimic negative lookbehind to avoid problems with nested properties
    str = stripNested(prop, str, val);
  }

  return str;
}

/**
 * Mimic negative lookbehind to avoid problems with nested properties.
 *
 * See: http://blog.stevenlevithan.com/archives/mimic-lookbehind-javascript
 *
 * @param {String} prop
 * @param {String} str
 * @param {String} val
 * @return {String}
 * @api private
 */

function stripNested (prop, str, val) {
  return str.replace(new RegExp('(\\.)?' + prop, 'g'), function($0, $1) {
    return $1 ? $0 : val;
  });
}

}, {"props":81,"component-props":81}],
81: [function(require, module, exports) {
/**
 * Global Names
 */

var globals = /\b(this|Array|Date|Object|Math|JSON)\b/g;

/**
 * Return immediate identifiers parsed from `str`.
 *
 * @param {String} str
 * @param {String|Function} map function or prefix
 * @return {Array}
 * @api public
 */

module.exports = function(str, fn){
  var p = unique(props(str));
  if (fn && 'string' == typeof fn) fn = prefixed(fn);
  if (fn) return map(str, p, fn);
  return p;
};

/**
 * Return immediate identifiers in `str`.
 *
 * @param {String} str
 * @return {Array}
 * @api private
 */

function props(str) {
  return str
    .replace(/\.\w+|\w+ *\(|"[^"]*"|'[^']*'|\/([^/]+)\//g, '')
    .replace(globals, '')
    .match(/[$a-zA-Z_]\w*/g)
    || [];
}

/**
 * Return `str` with `props` mapped with `fn`.
 *
 * @param {String} str
 * @param {Array} props
 * @param {Function} fn
 * @return {String}
 * @api private
 */

function map(str, props, fn) {
  var re = /\.\w+|\w+ *\(|"[^"]*"|'[^']*'|\/([^/]+)\/|[a-zA-Z_]\w*/g;
  return str.replace(re, function(_){
    if ('(' == _[_.length - 1]) return fn(_);
    if (!~props.indexOf(_)) return _;
    return fn(_);
  });
}

/**
 * Return unique array.
 *
 * @param {Array} arr
 * @return {Array}
 * @api private
 */

function unique(arr) {
  var ret = [];

  for (var i = 0; i < arr.length; i++) {
    if (~ret.indexOf(arr[i])) continue;
    ret.push(arr[i]);
  }

  return ret;
}

/**
 * Map with prefix `str`.
 */

function prefixed(str) {
  return function(_){
    return str + _;
  };
}

}, {}],
78: [function(require, module, exports) {

module.exports = [
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'en',
  'for',
  'from',
  'how',
  'if',
  'in',
  'neither',
  'nor',
  'of',
  'on',
  'only',
  'onto',
  'out',
  'or',
  'per',
  'so',
  'than',
  'that',
  'the',
  'to',
  'until',
  'up',
  'upon',
  'v',
  'v.',
  'versus',
  'vs',
  'vs.',
  'via',
  'when',
  'with',
  'without',
  'yet'
];
}, {}],
60: [function(require, module, exports) {

var is = require('is');
var isodate = require('isodate');
var each;

try {
  each = require('each');
} catch (err) {
  each = require('each-component');
}

/**
 * Expose `traverse`.
 */

module.exports = traverse;

/**
 * Traverse an object or array, and return a clone with all ISO strings parsed
 * into Date objects.
 *
 * @param {Object} obj
 * @return {Object}
 */

function traverse (input, strict) {
  if (strict === undefined) strict = true;

  if (is.object(input)) return object(input, strict);
  if (is.array(input)) return array(input, strict);
  return input;
}

/**
 * Object traverser.
 *
 * @param {Object} obj
 * @param {Boolean} strict
 * @return {Object}
 */

function object (obj, strict) {
  each(obj, function (key, val) {
    if (isodate.is(val, strict)) {
      obj[key] = isodate.parse(val);
    } else if (is.object(val) || is.array(val)) {
      traverse(val, strict);
    }
  });
  return obj;
}

/**
 * Array traverser.
 *
 * @param {Array} arr
 * @param {Boolean} strict
 * @return {Array}
 */

function array (arr, strict) {
  each(arr, function (val, x) {
    if (is.object(val)) {
      traverse(val, strict);
    } else if (isodate.is(val, strict)) {
      arr[x] = isodate.parse(val);
    }
  });
  return arr;
}

}, {"is":82,"isodate":83,"each":5}],
82: [function(require, module, exports) {

var isEmpty = require('is-empty');

try {
  var typeOf = require('type');
} catch (e) {
  var typeOf = require('component-type');
}


/**
 * Types.
 */

var types = [
  'arguments',
  'array',
  'boolean',
  'date',
  'element',
  'function',
  'null',
  'number',
  'object',
  'regexp',
  'string',
  'undefined'
];


/**
 * Expose type checkers.
 *
 * @param {Mixed} value
 * @return {Boolean}
 */

for (var i = 0, type; type = types[i]; i++) exports[type] = generate(type);


/**
 * Add alias for `function` for old browsers.
 */

exports.fn = exports['function'];


/**
 * Expose `empty` check.
 */

exports.empty = isEmpty;


/**
 * Expose `nan` check.
 */

exports.nan = function (val) {
  return exports.number(val) && val != val;
};


/**
 * Generate a type checker.
 *
 * @param {String} type
 * @return {Function}
 */

function generate (type) {
  return function (value) {
    return type === typeOf(value);
  };
}
}, {"is-empty":42,"type":33,"component-type":33}],
83: [function(require, module, exports) {

/**
 * Matcher, slightly modified from:
 *
 * https://github.com/csnover/js-iso8601/blob/lax/iso8601.js
 */

var matcher = /^(\d{4})(?:-?(\d{2})(?:-?(\d{2}))?)?(?:([ T])(\d{2}):?(\d{2})(?::?(\d{2})(?:[,\.](\d{1,}))?)?(?:(Z)|([+\-])(\d{2})(?::?(\d{2}))?)?)?$/;


/**
 * Convert an ISO date string to a date. Fallback to native `Date.parse`.
 *
 * https://github.com/csnover/js-iso8601/blob/lax/iso8601.js
 *
 * @param {String} iso
 * @return {Date}
 */

exports.parse = function (iso) {
  var numericKeys = [1, 5, 6, 7, 11, 12];
  var arr = matcher.exec(iso);
  var offset = 0;

  // fallback to native parsing
  if (!arr) return new Date(iso);

  // remove undefined values
  for (var i = 0, val; val = numericKeys[i]; i++) {
    arr[val] = parseInt(arr[val], 10) || 0;
  }

  // allow undefined days and months
  arr[2] = parseInt(arr[2], 10) || 1;
  arr[3] = parseInt(arr[3], 10) || 1;

  // month is 0-11
  arr[2]--;

  // allow abitrary sub-second precision
  arr[8] = arr[8]
    ? (arr[8] + '00').substring(0, 3)
    : 0;

  // apply timezone if one exists
  if (arr[4] == ' ') {
    offset = new Date().getTimezoneOffset();
  } else if (arr[9] !== 'Z' && arr[10]) {
    offset = arr[11] * 60 + arr[12];
    if ('+' == arr[10]) offset = 0 - offset;
  }

  var millis = Date.UTC(arr[1], arr[2], arr[3], arr[5], arr[6] + offset, arr[7], arr[8]);
  return new Date(millis);
};


/**
 * Checks whether a `string` is an ISO date string. `strict` mode requires that
 * the date string at least have a year, month and date.
 *
 * @param {String} string
 * @param {Boolean} strict
 * @return {Boolean}
 */

exports.is = function (string, strict) {
  if (strict && false === /^\d{4}-\d{2}-\d{2}/.test(string)) return false;
  return matcher.test(string);
};
}, {}],
51: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var inherit = require('./utils').inherit;
var Facade = require('./facade');

/**
 * Expose `Alias` facade.
 */

module.exports = Alias;

/**
 * Initialize a new `Alias` facade with a `dictionary` of arguments.
 *
 * @param {Object} dictionary
 *   @property {String} from
 *   @property {String} to
 *   @property {Object} options
 */

function Alias (dictionary) {
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`.
 */

inherit(Alias, Facade);

/**
 * Return type of facade.
 *
 * @return {String}
 */

Alias.prototype.type =
Alias.prototype.action = function () {
  return 'alias';
};

/**
 * Get `previousId`.
 *
 * @return {Mixed}
 * @api public
 */

Alias.prototype.from =
Alias.prototype.previousId = function(){
  return this.field('previousId')
    || this.field('from');
};

/**
 * Get `userId`.
 *
 * @return {String}
 * @api public
 */

Alias.prototype.to =
Alias.prototype.userId = function(){
  return this.field('userId')
    || this.field('to');
};

}, {"./utils":57,"./facade":50}],
52: [function(require, module, exports) {

var inherit = require('./utils').inherit;
var Facade = require('./facade');
var newDate = require('new-date');

/**
 * Expose `Group` facade.
 */

module.exports = Group;

/**
 * Initialize a new `Group` facade with a `dictionary` of arguments.
 *
 * @param {Object} dictionary
 *   @param {String} userId
 *   @param {String} groupId
 *   @param {Object} properties
 *   @param {Object} options
 */

function Group (dictionary) {
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`
 */

inherit(Group, Facade);

/**
 * Get the facade's action.
 */

Group.prototype.type =
Group.prototype.action = function () {
  return 'group';
};

/**
 * Setup some basic proxies.
 */

Group.prototype.groupId = Facade.field('groupId');

/**
 * Get created or createdAt.
 *
 * @return {Date}
 */

Group.prototype.created = function(){
  var created = this.proxy('traits.createdAt')
    || this.proxy('traits.created')
    || this.proxy('properties.createdAt')
    || this.proxy('properties.created');

  if (created) return newDate(created);
};

/**
 * Get the group's traits.
 *
 * @param {Object} aliases
 * @return {Object}
 */

Group.prototype.traits = function (aliases) {
  var ret = this.properties();
  var id = this.groupId();
  aliases = aliases || {};

  if (id) ret.id = id;

  for (var alias in aliases) {
    var value = null == this[alias]
      ? this.proxy('traits.' + alias)
      : this[alias]();
    if (null == value) continue;
    ret[aliases[alias]] = value;
    delete ret[alias];
  }

  return ret;
};

/**
 * Get traits or properties.
 *
 * TODO: remove me
 *
 * @return {Object}
 */

Group.prototype.properties = function(){
  return this.field('traits')
    || this.field('properties')
    || {};
};

}, {"./utils":57,"./facade":50,"new-date":21}],
53: [function(require, module, exports) {

var Facade = require('./facade');
var isEmail = require('is-email');
var newDate = require('new-date');
var utils = require('./utils');
var trim = require('trim');
var inherit = utils.inherit;
var clone = utils.clone;

/**
 * Expose `Idenfity` facade.
 */

module.exports = Identify;

/**
 * Initialize a new `Identify` facade with a `dictionary` of arguments.
 *
 * @param {Object} dictionary
 *   @param {String} userId
 *   @param {String} sessionId
 *   @param {Object} traits
 *   @param {Object} options
 */

function Identify (dictionary) {
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`.
 */

inherit(Identify, Facade);

/**
 * Get the facade's action.
 */

Identify.prototype.type =
Identify.prototype.action = function () {
  return 'identify';
};

/**
 * Get the user's traits.
 *
 * @param {Object} aliases
 * @return {Object}
 */

Identify.prototype.traits = function (aliases) {
  var ret = this.field('traits') || {};
  var id = this.userId();
  aliases = aliases || {};

  if (id) ret.id = id;

  for (var alias in aliases) {
    var value = null == this[alias]
      ? this.proxy('traits.' + alias)
      : this[alias]();
    if (null == value) continue;
    ret[aliases[alias]] = value;
    delete ret[alias];
  }

  return ret;
};

/**
 * Get the user's email, falling back to their user ID if it's a valid email.
 *
 * @return {String}
 */

Identify.prototype.email = function () {
  var email = this.proxy('traits.email');
  if (email) return email;

  var userId = this.userId();
  if (isEmail(userId)) return userId;
};

/**
 * Get the user's created date, optionally looking for `createdAt` since lots of
 * people do that instead.
 *
 * @return {Date or Undefined}
 */

Identify.prototype.created = function () {
  var created = this.proxy('traits.created') || this.proxy('traits.createdAt');
  if (created) return newDate(created);
};

/**
 * Get the company created date.
 *
 * @return {Date or undefined}
 */

Identify.prototype.companyCreated = function(){
  var created = this.proxy('traits.company.created')
    || this.proxy('traits.company.createdAt');

  if (created) return newDate(created);
};

/**
 * Get the user's name, optionally combining a first and last name if that's all
 * that was provided.
 *
 * @return {String or Undefined}
 */

Identify.prototype.name = function () {
  var name = this.proxy('traits.name');
  if (typeof name === 'string') return trim(name);

  var firstName = this.firstName();
  var lastName = this.lastName();
  if (firstName && lastName) return trim(firstName + ' ' + lastName);
};

/**
 * Get the user's first name, optionally splitting it out of a single name if
 * that's all that was provided.
 *
 * @return {String or Undefined}
 */

Identify.prototype.firstName = function () {
  var firstName = this.proxy('traits.firstName');
  if (typeof firstName === 'string') return trim(firstName);

  var name = this.proxy('traits.name');
  if (typeof name === 'string') return trim(name).split(' ')[0];
};

/**
 * Get the user's last name, optionally splitting it out of a single name if
 * that's all that was provided.
 *
 * @return {String or Undefined}
 */

Identify.prototype.lastName = function () {
  var lastName = this.proxy('traits.lastName');
  if (typeof lastName === 'string') return trim(lastName);

  var name = this.proxy('traits.name');
  if (typeof name !== 'string') return;

  var space = trim(name).indexOf(' ');
  if (space === -1) return;

  return trim(name.substr(space + 1));
};

/**
 * Get the user's unique id.
 *
 * @return {String or undefined}
 */

Identify.prototype.uid = function(){
  return this.userId()
    || this.username()
    || this.email();
};

/**
 * Get description.
 *
 * @return {String}
 */

Identify.prototype.description = function(){
  return this.proxy('traits.description')
    || this.proxy('traits.background');
};

/**
 * Setup sme basic "special" trait proxies.
 */

Identify.prototype.username = Facade.proxy('traits.username');
Identify.prototype.website = Facade.proxy('traits.website');
Identify.prototype.phone = Facade.proxy('traits.phone');
Identify.prototype.address = Facade.proxy('traits.address');
Identify.prototype.avatar = Facade.proxy('traits.avatar');

}, {"./facade":50,"./utils":57,"is-email":19,"new-date":21,"trim":49}],
54: [function(require, module, exports) {

var inherit = require('./utils').inherit;
var clone = require('./utils').clone;
var Facade = require('./facade');
var Identify = require('./identify');
var isEmail = require('is-email');

/**
 * Expose `Track` facade.
 */

module.exports = Track;

/**
 * Initialize a new `Track` facade with a `dictionary` of arguments.
 *
 * @param {object} dictionary
 *   @property {String} event
 *   @property {String} userId
 *   @property {String} sessionId
 *   @property {Object} properties
 *   @property {Object} options
 */

function Track (dictionary) {
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`.
 */

inherit(Track, Facade);

/**
 * Return the facade's action.
 *
 * @return {String}
 */

Track.prototype.type =
Track.prototype.action = function () {
  return 'track';
};

/**
 * Setup some basic proxies.
 */

Track.prototype.event = Facade.field('event');
Track.prototype.value = Facade.proxy('properties.value');

/**
 * Misc
 */

Track.prototype.category = Facade.proxy('properties.category');
Track.prototype.country = Facade.proxy('properties.country');
Track.prototype.state = Facade.proxy('properties.state');
Track.prototype.city = Facade.proxy('properties.city');
Track.prototype.zip = Facade.proxy('properties.zip');

/**
 * Ecommerce
 */

Track.prototype.id = Facade.proxy('properties.id');
Track.prototype.sku = Facade.proxy('properties.sku');
Track.prototype.tax = Facade.proxy('properties.tax');
Track.prototype.name = Facade.proxy('properties.name');
Track.prototype.price = Facade.proxy('properties.price');
Track.prototype.total = Facade.proxy('properties.total');
Track.prototype.coupon = Facade.proxy('properties.coupon');
Track.prototype.shipping = Facade.proxy('properties.shipping');

/**
 * Order id.
 *
 * @return {String}
 * @api public
 */

Track.prototype.orderId = function(){
  return this.proxy('properties.id')
    || this.proxy('properties.orderId');
};

/**
 * Get subtotal.
 *
 * @return {Number}
 */

Track.prototype.subtotal = function(){
  var subtotal = this.obj.properties.subtotal;
  var total = this.total();
  var n;

  if (subtotal) return subtotal;
  if (!total) return 0;
  if (n = this.tax()) total -= n;
  if (n = this.shipping()) total -= n;

  return total;
};

/**
 * Get products.
 *
 * @return {Array}
 */

Track.prototype.products = function(){
  var props = this.obj.properties || {};
  return props.products || [];
};

/**
 * Get quantity.
 *
 * @return {Number}
 */

Track.prototype.quantity = function(){
  var props = this.obj.properties || {};
  return props.quantity || 1;
};

/**
 * Get currency.
 *
 * @return {String}
 */

Track.prototype.currency = function(){
  var props = this.obj.properties || {};
  return props.currency || 'USD';
};

/**
 * BACKWARDS COMPATIBILITY: should probably re-examine where these come from.
 */

Track.prototype.referrer = Facade.proxy('properties.referrer');
Track.prototype.query = Facade.proxy('options.query');

/**
 * Get the call's properties.
 *
 * @param {Object} aliases
 * @return {Object}
 */

Track.prototype.properties = function (aliases) {
  var ret = this.field('properties') || {};
  aliases = aliases || {};

  for (var alias in aliases) {
    var value = null == this[alias]
      ? this.proxy('properties.' + alias)
      : this[alias]();
    if (null == value) continue;
    ret[aliases[alias]] = value;
    delete ret[alias];
  }

  return ret;
};

/**
 * Get the call's "super properties" which are just traits that have been
 * passed in as if from an identify call.
 *
 * @return {Object}
 */

Track.prototype.traits = function () {
  return this.proxy('options.traits') || {};
};

/**
 * Get the call's username.
 *
 * @return {String or Undefined}
 */

Track.prototype.username = function () {
  return this.proxy('traits.username') ||
         this.proxy('properties.username') ||
         this.userId() ||
         this.sessionId();
};

/**
 * Get the call's email, using an the user ID if it's a valid email.
 *
 * @return {String or Undefined}
 */

Track.prototype.email = function () {
  var email = this.proxy('traits.email');
  email = email || this.proxy('properties.email');
  if (email) return email;

  var userId = this.userId();
  if (isEmail(userId)) return userId;
};

/**
 * Get the call's revenue, parsing it from a string with an optional leading
 * dollar sign.
 *
 * For products/services that don't have shipping and are not directly taxed,
 * they only care about tracking `revenue`. These are things like
 * SaaS companies, who sell monthly subscriptions. The subscriptions aren't
 * taxed directly, and since it's a digital product, it has no shipping.
 *
 * The only case where there's a difference between `revenue` and `total`
 * (in the context of analytics) is on ecommerce platforms, where they want
 * the `revenue` function to actually return the `total` (which includes
 * tax and shipping, total = subtotal + tax + shipping). This is probably
 * because on their backend they assume tax and shipping has been applied to
 * the value, and so can get the revenue on their own.
 *
 * @return {Number}
 */

Track.prototype.revenue = function () {
  var revenue = this.proxy('properties.revenue');
  var event = this.event();

  // it's always revenue, unless it's called during an order completion.
  if (!revenue && event && event.match(/completed ?order/i)) {
    revenue = this.proxy('properties.total');
  }

  return currency(revenue);
};

/**
 * Get cents.
 *
 * @return {Number}
 */

Track.prototype.cents = function(){
  var revenue = this.revenue();
  return 'number' != typeof revenue
    ? this.value() || 0
    : revenue * 100;
};

/**
 * A utility to turn the pieces of a track call into an identify. Used for
 * integrations with super properties or rate limits.
 *
 * TODO: remove me.
 *
 * @return {Facade}
 */

Track.prototype.identify = function () {
  var json = this.json();
  json.traits = this.traits();
  return new Identify(json);
};

/**
 * Get float from currency value.
 *
 * @param {Mixed} val
 * @return {Number}
 */

function currency(val) {
  if (!val) return;
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return;

  val = val.replace(/\$/g, '');
  val = parseFloat(val);

  if (!isNaN(val)) return val;
}

}, {"./utils":57,"./facade":50,"./identify":53,"is-email":19}],
55: [function(require, module, exports) {

var inherit = require('./utils').inherit;
var Facade = require('./facade');
var Track = require('./track');

/**
 * Expose `Page` facade
 */

module.exports = Page;

/**
 * Initialize new `Page` facade with `dictionary`.
 *
 * @param {Object} dictionary
 *   @param {String} category
 *   @param {String} name
 *   @param {Object} traits
 *   @param {Object} options
 */

function Page(dictionary){
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`
 */

inherit(Page, Facade);

/**
 * Get the facade's action.
 *
 * @return {String}
 */

Page.prototype.type =
Page.prototype.action = function(){
  return 'page';
};

/**
 * Proxies
 */

Page.prototype.category = Facade.field('category');
Page.prototype.name = Facade.field('name');

/**
 * Get the page properties mixing `category` and `name`.
 *
 * @return {Object}
 */

Page.prototype.properties = function(){
  var props = this.field('properties') || {};
  var category = this.category();
  var name = this.name();
  if (category) props.category = category;
  if (name) props.name = name;
  return props;
};

/**
 * Get the page fullName.
 *
 * @return {String}
 */

Page.prototype.fullName = function(){
  var category = this.category();
  var name = this.name();
  return name && category
    ? category + ' ' + name
    : name;
};

/**
 * Get event with `name`.
 *
 * @return {String}
 */

Page.prototype.event = function(name){
  return name
    ? 'Viewed ' + name + ' Page'
    : 'Loaded a Page';
};

/**
 * Convert this Page to a Track facade with `name`.
 *
 * @param {String} name
 * @return {Track}
 */

Page.prototype.track = function(name){
  var props = this.properties();
  return new Track({
    event: this.event(name),
    properties: props
  });
};

}, {"./utils":57,"./facade":50,"./track":54}],
56: [function(require, module, exports) {

var inherit = require('./utils').inherit;
var Page = require('./page');
var Track = require('./track');

/**
 * Expose `Screen` facade
 */

module.exports = Screen;

/**
 * Initialize new `Screen` facade with `dictionary`.
 *
 * @param {Object} dictionary
 *   @param {String} category
 *   @param {String} name
 *   @param {Object} traits
 *   @param {Object} options
 */

function Screen(dictionary){
  Page.call(this, dictionary);
}

/**
 * Inherit from `Page`
 */

inherit(Screen, Page);

/**
 * Get the facade's action.
 *
 * @return {String}
 * @api public
 */

Screen.prototype.type =
Screen.prototype.action = function(){
  return 'screen';
};

/**
 * Get event with `name`.
 *
 * @param {String} name
 * @return {String}
 * @api public
 */

Screen.prototype.event = function(name){
  return name
    ? 'Viewed ' + name + ' Screen'
    : 'Loaded a Screen';
};

/**
 * Convert this Screen.
 *
 * @param {String} name
 * @return {Track}
 * @api public
 */

Screen.prototype.track = function(name){
  var props = this.properties();
  return new Track({
    event: this.event(name),
    properties: props
  });
};

}, {"./utils":57,"./page":55,"./track":54}],
3: [function(require, module, exports) {

module.exports = '2.0.1';

}, {}],
4: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var each = require('each');
var plugins = require('./integrations.js');

/**
 * Expose the integrations, using their own `name` from their `prototype`.
 */

each(plugins, function(plugin){
  var name = plugin.Integration.prototype.name;
  exports[name] = plugin;
});

}, {"./integrations.js":84,"each":5}],
84: [function(require, module, exports) {

/**
 * DON'T EDIT THIS FILE. It's automatically generated!
 */

module.exports = [
  require('./lib/adwords'),
  require('./lib/bing-ads'),
  require('./lib/facebook-ads'),
  require('./lib/google-analytics'),
  require('./lib/twitter-ads')
];

}, {"./lib/adwords":85,"./lib/bing-ads":86,"./lib/facebook-ads":87,"./lib/google-analytics":88,"./lib/twitter-ads":89}],
85: [function(require, module, exports) {
/**
 * Module dependencies.
 */

var onbody = require('on-body');
var integration = require('integration');
var load = require('load-script');
var domify = require('domify');
var Queue = require('queue');

/**
 * Expose plugin
 */

module.exports = exports = function(analytics){
  analytics.addIntegration(AdWords);
};

/**
 * HOP
 */

var has = Object.prototype.hasOwnProperty;

/**
 * Script loader queue.
 */

var q = new Queue({ concurrency: 1, timeout: 2000 });

/**
 * Expose `AdWords`
 */

var AdWords = exports.Integration = integration('AdWords')
  .readyOnLoad()
  .option('conversionId', '')
  .option('remarketing', false)
  .option('events', {});

/**
 * Load
 *
 * @param {Function} fn
 * @api public
 */

AdWords.prototype.load = function(fn){
  onbody(fn);
};

/**
 * Loaded.
 *
 * @return {Boolean}
 * @api public
 */

AdWords.prototype.loaded = function(){
  return !! document.body;
};

/**
 * Page.
 *
 * https://support.google.com/adwords/answer/3111920#standard_parameters
 *
 * @param {Page} page
 */

AdWords.prototype.page = function(page){
  var remarketing = this.options.remarketing;
  var props = page.properties();
  var id = this.options.conversionId;

  this.googleTagParams = props.googleTagParams || {};
  this.rlsaLabels = props.rlsaLabels;
  if (remarketing) this.remarketing(id);
};

/**
 * Track.
 *
 * @param {Track}
 * @api public
 */

AdWords.prototype.track = function(track){
  var id = this.options.conversionId;
  var events = this.options.events;
  var event = track.event();
  if (!has.call(events, event)) return;
  return this.conversion({
    value: track.revenue() || 0,
    label: events[event],
    conversionId: id
  });
};

/**
 * Report AdWords conversion.
 *
 * @param {Object} obj
 * @param {Function} [fn]
 * @api private
 */

AdWords.prototype.conversion = function(obj, fn){
  this.queued({
    google_conversion_id: obj.conversionId,
    google_conversion_language: 'en',
    google_conversion_format: '3',
    google_conversion_color: 'ffffff',
    google_conversion_label: obj.label,
    google_conversion_value: obj.value,
    google_remarketing_only: false
  }, fn);
};

/**
 * Add remarketing.
 *
 * @param {String} id Conversion ID
 * @api private
 */

AdWords.prototype.remarketing = function(id){
  // Call for each label but at least once
  var labels = this.rlsaLabels || [''];
  for(var l in labels) {
    this.queued({
      google_conversion_id: id,
      google_remarketing_only: true,
      google_conversion_label: labels[l],
      google_custom_params: this.googleTagParams
    });
  }
};

/**
 * Queue external call.
 *
 * @param {Object} obj
 * @param {Function} [fn]
 */

AdWords.prototype.queued = function(obj, fn){
  this.debug('sending %o', obj);
  var self = this;

  q.push(function(next){
    self.globalize(obj);
    self.shim();

    load('//www.googleadservices.com/pagead/conversion.js', function(){
      if (fn) fn();
      next();
    });
  });
};

/**
 * Set global variables.
 *
 * @param {Object} obj
 */

AdWords.prototype.globalize = function(obj){
  for (var name in obj) {
    if (obj.hasOwnProperty(name)) {
      window[name] = obj[name];
    }
  }
};

/**
 * Shim for `document.write`.
 *
 * @api private
 */

AdWords.prototype.shim = function(){
  var self = this;
  var write = document.write;
  document.write = append;

  function append(str){
    var el = domify(str);
    if (!el.src) return write(str);
    if (!/googleadservices/.test(el.src)) return write(str);
    self.debug('append %o', el);
    document.body.appendChild(el);
    document.write = write;
  }
};

}, {"on-body":90,"integration":91,"load-script":92,"domify":93,"queue":94}],
90: [function(require, module, exports) {
var each = require('each');


/**
 * Cache whether `<body>` exists.
 */

var body = false;


/**
 * Callbacks to call when the body exists.
 */

var callbacks = [];


/**
 * Export a way to add handlers to be invoked once the body exists.
 *
 * @param {Function} callback  A function to call when the body exists.
 */

module.exports = function onBody (callback) {
  if (body) {
    call(callback);
  } else {
    callbacks.push(callback);
  }
};


/**
 * Set an interval to check for `document.body`.
 */

var interval = setInterval(function () {
  if (!document.body) return;
  body = true;
  each(callbacks, call);
  clearInterval(interval);
}, 5);


/**
 * Call a callback, passing it the body.
 *
 * @param {Function} callback  The callback to call.
 */

function call (callback) {
  callback(document.body);
}
}, {"each":79}],
91: [function(require, module, exports) {

var bind = require('bind');
var callback = require('callback');
var clone = require('clone');
var debug = require('debug');
var defaults = require('defaults');
var protos = require('./protos');
var slug = require('slug');
var statics = require('./statics');


/**
 * Expose `createIntegration`.
 */

module.exports = createIntegration;


/**
 * Create a new Integration constructor.
 *
 * @param {String} name
 */

function createIntegration (name) {

  /**
   * Initialize a new `Integration`.
   *
   * @param {Object} options
   */

  function Integration (options) {
    this.debug = debug('analytics:integration:' + slug(name));
    this.options = defaults(clone(options) || {}, this.defaults);
    this._queue = [];
    this.once('ready', bind(this, this.flush));

    Integration.emit('construct', this);
    this._wrapInitialize();
    this._wrapLoad();
    this._wrapPage();
    this._wrapTrack();
  }

  Integration.prototype.defaults = {};
  Integration.prototype.globals = [];
  Integration.prototype.name = name;
  for (var key in statics) Integration[key] = statics[key];
  for (var key in protos) Integration.prototype[key] = protos[key];
  return Integration;
}

}, {"./protos":95,"./statics":96,"bind":97,"callback":12,"clone":14,"debug":98,"defaults":16,"slug":99}],
95: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var normalize = require('to-no-case');
var after = require('after');
var callback = require('callback');
var Emitter = require('emitter');
var tick = require('next-tick');
var events = require('./events');
var type = require('type');

/**
 * Window defaults.
 */

var setTimeout = window.setTimeout;
var setInterval = window.setInterval;
var onerror = null;
var onload = null;

/**
 * Mixin emitter.
 */

Emitter(exports);

/**
 * Initialize.
 */

exports.initialize = function () {
  this.load();
};


/**
 * Loaded?
 *
 * @return {Boolean}
 * @api private
 */

exports.loaded = function () {
  return false;
};


/**
 * Load.
 *
 * @param {Function} cb
 */

exports.load = function (cb) {
  callback.async(cb);
};


/**
 * Page.
 *
 * @param {Page} page
 */

exports.page = function(page){};

/**
 * Track.
 *
 * @param {Track} track
 */

exports.track = function(track){};

/**
 * Get events that match `str`.
 * 
 * Examples:
 * 
 *    events = { my_event: 'a4991b88' }
 *    .map(events, 'My Event');
 *    // => ["a4991b88"]
 *    .map(events, 'whatever');
 *    // => []
 * 
 *    events = [{ key: 'my event', value: '9b5eb1fa' }]
 *    .map(events, 'my_event');
 *    // => ["9b5eb1fa"]
 *    .map(events, 'whatever');
 *    // => []
 * 
 * @param {String} str
 * @return {Array}
 * @api public
 */

exports.map = function(obj, str){
  var a = normalize(str);
  var ret = [];

  // noop
  if (!obj) return ret;

  // object
  if ('object' == type(obj)) {
    for (var k in obj) {
      var item = obj[k];
      var b = normalize(k);
      if (b == a) ret.push(item);
    }
  }

  // array
  if ('array' == type(obj)) {
    if (!obj.length) return ret;
    if (!obj[0].key) return ret;

    for (var i = 0; i < obj.length; ++i) {
      var item = obj[i];
      var b = normalize(item.key);
      if (b == a) ret.push(item.value);
    }
  }

  return ret;
};

/**
 * Invoke a `method` that may or may not exist on the prototype with `args`,
 * queueing or not depending on whether the integration is "ready". Don't
 * trust the method call, since it contains integration party code.
 *
 * @param {String} method
 * @param {Mixed} args...
 * @api private
 */

exports.invoke = function (method) {
  if (!this[method]) return;
  var args = [].slice.call(arguments, 1);
  if (!this._ready) return this.queue(method, args);
  var ret;

  try {
    this.debug('%s with %o', method, args);
    ret = this[method].apply(this, args);
  } catch (e) {
    this.debug('error %o calling %s with %o', e, method, args);
  }

  return ret;
};


/**
 * Queue a `method` with `args`. If the integration assumes an initial
 * pageview, then let the first call to `page` pass through.
 *
 * @param {String} method
 * @param {Array} args
 * @api private
 */

exports.queue = function (method, args) {
  if ('page' == method && this._assumesPageview && !this._initialized) {
    return this.page.apply(this, args);
  }

  this._queue.push({ method: method, args: args });
};


/**
 * Flush the internal queue.
 *
 * @api private
 */

exports.flush = function () {
  this._ready = true;
  var call;
  while (call = this._queue.shift()) this[call.method].apply(this, call.args);
};


/**
 * Reset the integration, removing its global variables.
 *
 * @api private
 */

exports.reset = function () {
  for (var i = 0, key; key = this.globals[i]; i++) window[key] = undefined;
  window.setTimeout = setTimeout;
  window.setInterval = setInterval;
  window.onerror = onerror;
  window.onload = onload;
};

/**
 * Wrap the initialize method in an exists check, so we don't have to do it for
 * every single integration.
 *
 * @api private
 */

exports._wrapInitialize = function () {
  var initialize = this.initialize;
  this.initialize = function () {
    this.debug('initialize');
    this._initialized = true;
    var ret = initialize.apply(this, arguments);
    this.emit('initialize');

    var self = this;
    if (this._readyOnInitialize) {
      tick(function () {
        self.emit('ready');
      });
    }
    
    return ret;
  };

  if (this._assumesPageview) this.initialize = after(2, this.initialize);
};


/**
 * Wrap the load method in `debug` calls, so every integration gets them
 * automatically.
 *
 * @api private
 */

exports._wrapLoad = function () {
  var load = this.load;
  this.load = function (callback) {
    var self = this;
    this.debug('loading');

    if (this.loaded()) {
      this.debug('already loaded');
      tick(function () {
        if (self._readyOnLoad) self.emit('ready');
        callback && callback();
      });
      return;
    }

    return load.call(this, function (err, e) {
      self.debug('loaded');
      self.emit('load');
      if (self._readyOnLoad) self.emit('ready');
      callback && callback(err, e);
    });
  };
};


/**
 * Wrap the page method to call `initialize` instead if the integration assumes
 * a pageview.
 *
 * @api private
 */

exports._wrapPage = function () {
  var page = this.page;
  this.page = function () {
    if (this._assumesPageview && !this._initialized) {
      return this.initialize.apply(this, arguments);
    }
    
    return page.apply(this, arguments);
  };
};

/**
 * Wrap the track method to call other ecommerce methods if
 * available depending on the `track.event()`.
 *
 * @api private
 */

exports._wrapTrack = function(){
  var t = this.track;
  this.track = function(track){
    var event = track.event();
    var called;
    var ret;

    for (var method in events) {
      var regexp = events[method];
      if (!this[method]) continue;
      if (!regexp.test(event)) continue;
      ret = this[method].apply(this, arguments);
      called = true;
      break;
    }

    if (!called) ret = t.apply(this, arguments);
    return ret;
  };
};

}, {"./events":100,"to-no-case":101,"after":10,"callback":12,"emitter":17,"next-tick":45,"type":33}],
100: [function(require, module, exports) {

/**
 * Expose `events`
 */

module.exports = {
  removedProduct: /removed[ _]?product/i,
  viewedProduct: /viewed[ _]?product/i,
  addedProduct: /added[ _]?product/i,
  completedOrder: /completed[ _]?order/i
};

}, {}],
101: [function(require, module, exports) {

/**
 * Expose `toNoCase`.
 */

module.exports = toNoCase;


/**
 * Test whether a string is camel-case.
 */

var hasSpace = /\s/;
var hasSeparator = /[\W_]/;


/**
 * Remove any starting case from a `string`, like camel or snake, but keep
 * spaces and punctuation that may be important otherwise.
 *
 * @param {String} string
 * @return {String}
 */

function toNoCase (string) {
  if (hasSpace.test(string)) return string.toLowerCase();
  if (hasSeparator.test(string)) return unseparate(string).toLowerCase();
  return uncamelize(string).toLowerCase();
}


/**
 * Separator splitter.
 */

var separatorSplitter = /[\W_]+(.|$)/g;


/**
 * Un-separate a `string`.
 *
 * @param {String} string
 * @return {String}
 */

function unseparate (string) {
  return string.replace(separatorSplitter, function (m, next) {
    return next ? ' ' + next : '';
  });
}


/**
 * Camelcase splitter.
 */

var camelSplitter = /(.)([A-Z]+)/g;


/**
 * Un-camelcase a `string`.
 *
 * @param {String} string
 * @return {String}
 */

function uncamelize (string) {
  return string.replace(camelSplitter, function (m, previous, uppers) {
    return previous + ' ' + uppers.toLowerCase().split('').join(' ');
  });
}
}, {}],
96: [function(require, module, exports) {

var after = require('after');
var Emitter = require('emitter');


/**
 * Mixin emitter.
 */

Emitter(exports);


/**
 * Add a new option to the integration by `key` with default `value`.
 *
 * @param {String} key
 * @param {Mixed} value
 * @return {Integration}
 */

exports.option = function (key, value) {
  this.prototype.defaults[key] = value;
  return this;
};

/**
 * Add a new mapping option.
 *
 * This will create a method `name` that will return a mapping
 * for you to use.
 *
 * Example:
 *
 *    Integration('My Integration')
 *      .mapping('events');
 *
 *    new MyIntegration().track('My Event');
 *
 *    .track = function(track){
  *      var events = this.events(track.event());
  *      each(events, send);
 *     };
 *
 * @param {String} name
 * @return {Integration}
 */

exports.mapping = function(name){
  this.option(name, []);
  this.prototype[name] = function(str){
    return this.map(this.options[name], str);
  };
  return this;
};

/**
 * Register a new global variable `key` owned by the integration, which will be
 * used to test whether the integration is already on the page.
 *
 * @param {String} global
 * @return {Integration}
 */

exports.global = function (key) {
  this.prototype.globals.push(key);
  return this;
};


/**
 * Mark the integration as assuming an initial pageview, so to defer loading
 * the script until the first `page` call, noop the first `initialize`.
 *
 * @return {Integration}
 */

exports.assumesPageview = function () {
  this.prototype._assumesPageview = true;
  return this;
};


/**
 * Mark the integration as being "ready" once `load` is called.
 *
 * @return {Integration}
 */

exports.readyOnLoad = function () {
  this.prototype._readyOnLoad = true;
  return this;
};


/**
 * Mark the integration as being "ready" once `initialize` is called.
 *
 * @return {Integration}
 */

exports.readyOnInitialize = function () {
  this.prototype._readyOnInitialize = true;
  return this;
};

}, {"after":10,"emitter":17}],
97: [function(require, module, exports) {

var bind = require('bind')
  , bindAll = require('bind-all');


/**
 * Expose `bind`.
 */

module.exports = exports = bind;


/**
 * Expose `bindAll`.
 */

exports.all = bindAll;


/**
 * Expose `bindMethods`.
 */

exports.methods = bindMethods;


/**
 * Bind `methods` on `obj` to always be called with the `obj` as context.
 *
 * @param {Object} obj
 * @param {String} methods...
 */

function bindMethods (obj, methods) {
  methods = [].slice.call(arguments, 1);
  for (var i = 0, method; method = methods[i]; i++) {
    obj[method] = bind(obj, obj[method]);
  }
  return obj;
}
}, {"bind":31,"bind-all":32}],
98: [function(require, module, exports) {
if ('undefined' == typeof window) {
  module.exports = require('./lib/debug');
} else {
  module.exports = require('./debug');
}

}, {"./lib/debug":102,"./debug":103}],
102: [function(require, module, exports) {
/**
 * Module dependencies.
 */

var tty = require('tty');

/**
 * Expose `debug()` as the module.
 */

module.exports = debug;

/**
 * Enabled debuggers.
 */

var names = []
  , skips = [];

(process.env.DEBUG || '')
  .split(/[\s,]+/)
  .forEach(function(name){
    name = name.replace('*', '.*?');
    if (name[0] === '-') {
      skips.push(new RegExp('^' + name.substr(1) + '$'));
    } else {
      names.push(new RegExp('^' + name + '$'));
    }
  });

/**
 * Colors.
 */

var colors = [6, 2, 3, 4, 5, 1];

/**
 * Previous debug() call.
 */

var prev = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Is stdout a TTY? Colored output is disabled when `true`.
 */

var isatty = tty.isatty(2);

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function color() {
  return colors[prevColor++ % colors.length];
}

/**
 * Humanize the given `ms`.
 *
 * @param {Number} m
 * @return {String}
 * @api private
 */

function humanize(ms) {
  var sec = 1000
    , min = 60 * 1000
    , hour = 60 * min;

  if (ms >= hour) return (ms / hour).toFixed(1) + 'h';
  if (ms >= min) return (ms / min).toFixed(1) + 'm';
  if (ms >= sec) return (ms / sec | 0) + 's';
  return ms + 'ms';
}

/**
 * Create a debugger with the given `name`.
 *
 * @param {String} name
 * @return {Type}
 * @api public
 */

function debug(name) {
  function disabled(){}
  disabled.enabled = false;

  var match = skips.some(function(re){
    return re.test(name);
  });

  if (match) return disabled;

  match = names.some(function(re){
    return re.test(name);
  });

  if (!match) return disabled;
  var c = color();

  function colored(fmt) {
    fmt = coerce(fmt);

    var curr = new Date;
    var ms = curr - (prev[name] || curr);
    prev[name] = curr;

    fmt = '  \u001b[9' + c + 'm' + name + ' '
      + '\u001b[3' + c + 'm\u001b[90m'
      + fmt + '\u001b[3' + c + 'm'
      + ' +' + humanize(ms) + '\u001b[0m';

    console.error.apply(this, arguments);
  }

  function plain(fmt) {
    fmt = coerce(fmt);

    fmt = new Date().toUTCString()
      + ' ' + name + ' ' + fmt;
    console.error.apply(this, arguments);
  }

  colored.enabled = plain.enabled = true;

  return isatty || process.env.DEBUG_COLORS
    ? colored
    : plain;
}

/**
 * Coerce `val`.
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

}, {}],
103: [function(require, module, exports) {

/**
 * Expose `debug()` as the module.
 */

module.exports = debug;

/**
 * Create a debugger with the given `name`.
 *
 * @param {String} name
 * @return {Type}
 * @api public
 */

function debug(name) {
  if (!debug.enabled(name)) return function(){};

  return function(fmt){
    fmt = coerce(fmt);

    var curr = new Date;
    var ms = curr - (debug[name] || curr);
    debug[name] = curr;

    fmt = name
      + ' '
      + fmt
      + ' +' + debug.humanize(ms);

    // This hackery is required for IE8
    // where `console.log` doesn't have 'apply'
    window.console
      && console.log
      && Function.prototype.apply.call(console.log, console, arguments);
  }
}

/**
 * The currently active debug mode names.
 */

debug.names = [];
debug.skips = [];

/**
 * Enables a debug mode by name. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} name
 * @api public
 */

debug.enable = function(name) {
  try {
    localStorage.debug = name;
  } catch(e){}

  var split = (name || '').split(/[\s,]+/)
    , len = split.length;

  for (var i = 0; i < len; i++) {
    name = split[i].replace('*', '.*?');
    if (name[0] === '-') {
      debug.skips.push(new RegExp('^' + name.substr(1) + '$'));
    }
    else {
      debug.names.push(new RegExp('^' + name + '$'));
    }
  }
};

/**
 * Disable debug output.
 *
 * @api public
 */

debug.disable = function(){
  debug.enable('');
};

/**
 * Humanize the given `ms`.
 *
 * @param {Number} m
 * @return {String}
 * @api private
 */

debug.humanize = function(ms) {
  var sec = 1000
    , min = 60 * 1000
    , hour = 60 * min;

  if (ms >= hour) return (ms / hour).toFixed(1) + 'h';
  if (ms >= min) return (ms / min).toFixed(1) + 'm';
  if (ms >= sec) return (ms / sec | 0) + 's';
  return ms + 'ms';
};

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

debug.enabled = function(name) {
  for (var i = 0, len = debug.skips.length; i < len; i++) {
    if (debug.skips[i].test(name)) {
      return false;
    }
  }
  for (var i = 0, len = debug.names.length; i < len; i++) {
    if (debug.names[i].test(name)) {
      return true;
    }
  }
  return false;
};

/**
 * Coerce `val`.
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

// persist

try {
  if (window.localStorage) debug.enable(localStorage.debug);
} catch(e){}

}, {}],
99: [function(require, module, exports) {

/**
 * Generate a slug from the given `str`.
 *
 * example:
 *
 *        generate('foo bar');
 *        // > foo-bar
 *
 * @param {String} str
 * @param {Object} options
 * @config {String|RegExp} [replace] characters to replace, defaulted to `/[^a-z0-9]/g`
 * @config {String} [separator] separator to insert, defaulted to `-`
 * @return {String}
 */

module.exports = function (str, options) {
  options || (options = {});
  return str.toLowerCase()
    .replace(options.replace || /[^a-z0-9]/g, ' ')
    .replace(/^ +| +$/g, '')
    .replace(/ +/g, options.separator || '-')
};

}, {}],
92: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var onload = require('script-onload');
var tick = require('next-tick');
var type = require('type');

/**
 * Expose `loadScript`.
 *
 * @param {Object} options
 * @param {Function} fn
 * @api public
 */

module.exports = function loadScript(options, fn){
  if (!options) throw new Error('Cant load nothing...');

  // Allow for the simplest case, just passing a `src` string.
  if ('string' == type(options)) options = { src : options };

  var https = document.location.protocol === 'https:' ||
              document.location.protocol === 'chrome-extension:';

  // If you use protocol relative URLs, third-party scripts like Google
  // Analytics break when testing with `file:` so this fixes that.
  if (options.src && options.src.indexOf('//') === 0) {
    options.src = https ? 'https:' + options.src : 'http:' + options.src;
  }

  // Allow them to pass in different URLs depending on the protocol.
  if (https && options.https) options.src = options.https;
  else if (!https && options.http) options.src = options.http;

  // Make the `<script>` element and insert it before the first script on the
  // page, which is guaranteed to exist since this Javascript is running.
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.async = true;
  script.src = options.src;

  // If we have a fn, attach event handlers, even in IE. Based off of
  // the Third-Party Javascript script loading example:
  // https://github.com/thirdpartyjs/thirdpartyjs-code/blob/master/examples/templates/02/loading-files/index.html
  if ('function' == type(fn)) {
    onload(script, fn);
  }

  tick(function(){
    // Append after event listeners are attached for IE.
    var firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  });

  // Return the script element in case they want to do anything special, like
  // give it an ID or attributes.
  return script;
};
}, {"script-onload":104,"next-tick":45,"type":33}],
104: [function(require, module, exports) {

// https://github.com/thirdpartyjs/thirdpartyjs-code/blob/master/examples/templates/02/loading-files/index.html

/**
 * Invoke `fn(err)` when the given `el` script loads.
 *
 * @param {Element} el
 * @param {Function} fn
 * @api public
 */

module.exports = function(el, fn){
  return el.addEventListener
    ? add(el, fn)
    : attach(el, fn);
};

/**
 * Add event listener to `el`, `fn()`.
 *
 * @param {Element} el
 * @param {Function} fn
 * @api private
 */

function add(el, fn){
  el.addEventListener('load', function(_, e){ fn(null, e); }, false);
  el.addEventListener('error', function(e){
    var err = new Error('failed to load the script "' + el.src + '"');
    err.event = e;
    fn(err);
  }, false);
}

/**
 * Attach evnet.
 *
 * @param {Element} el
 * @param {Function} fn
 * @api private
 */

function attach(el, fn){
  el.attachEvent('onreadystatechange', function(e){
    if (!/complete|loaded/.test(el.readyState)) return;
    fn(null, e);
  });
}

}, {}],
93: [function(require, module, exports) {

/**
 * Expose `parse`.
 */

module.exports = parse;

/**
 * Wrap map from jquery.
 */

var map = {
  legend: [1, '<fieldset>', '</fieldset>'],
  tr: [2, '<table><tbody>', '</tbody></table>'],
  col: [2, '<table><tbody></tbody><colgroup>', '</colgroup></table>'],
  _default: [0, '', '']
};

map.td =
map.th = [3, '<table><tbody><tr>', '</tr></tbody></table>'];

map.option =
map.optgroup = [1, '<select multiple="multiple">', '</select>'];

map.thead =
map.tbody =
map.colgroup =
map.caption =
map.tfoot = [1, '<table>', '</table>'];

map.text =
map.circle =
map.ellipse =
map.line =
map.path =
map.polygon =
map.polyline =
map.rect = [1, '<svg xmlns="http://www.w3.org/2000/svg" version="1.1">','</svg>'];

/**
 * Parse `html` and return the children.
 *
 * @param {String} html
 * @return {Array}
 * @api private
 */

function parse(html) {
  if ('string' != typeof html) throw new TypeError('String expected');

  html = html.replace(/^\s+|\s+$/g, ''); // Remove leading/trailing whitespace

  // tag name
  var m = /<([\w:]+)/.exec(html);
  if (!m) return document.createTextNode(html);
  var tag = m[1];

  // body support
  if (tag == 'body') {
    var el = document.createElement('html');
    el.innerHTML = html;
    return el.removeChild(el.lastChild);
  }

  // wrap map
  var wrap = map[tag] || map._default;
  var depth = wrap[0];
  var prefix = wrap[1];
  var suffix = wrap[2];
  var el = document.createElement('div');
  el.innerHTML = prefix + html + suffix;
  while (depth--) el = el.lastChild;

  // one element
  if (el.firstChild == el.lastChild) {
    return el.removeChild(el.firstChild);
  }

  // several elements
  var fragment = document.createDocumentFragment();
  while (el.firstChild) {
    fragment.appendChild(el.removeChild(el.firstChild));
  }

  return fragment;
}

}, {}],
94: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var Emitter;
var bind;

try {
  Emitter = require('emitter');
  bind = require('bind');
} catch (err) {
  Emitter = require('component-emitter');
  bind = require('component-bind');
}

/**
 * Expose `Queue`.
 */

module.exports = Queue;

/**
 * Initialize a `Queue` with the given options:
 *
 *  - `concurrency` [1]
 *  - `timeout` [0]
 *
 * @param {Object} options
 * @api public
 */

function Queue(options) {
  options = options || {};
  this.timeout = options.timeout || 0;
  this.concurrency = options.concurrency || 1;
  this.pending = 0;
  this.jobs = [];
}

/**
 * Mixin emitter.
 */

Emitter(Queue.prototype);

/**
 * Return queue length.
 *
 * @return {Number}
 * @api public
 */

Queue.prototype.length = function(){
  return this.pending + this.jobs.length;
};

/**
 * Queue `fn` for execution.
 *
 * @param {Function} fn
 * @param {Function} [cb]
 * @api public
 */

Queue.prototype.push = function(fn, cb){
  this.jobs.push([fn, cb]);
  setTimeout(bind(this, this.run), 0);
};

/**
 * Run jobs at the specified concurrency.
 *
 * @api private
 */

Queue.prototype.run = function(){
  while (this.pending < this.concurrency) {
    var job = this.jobs.shift();
    if (!job) break;
    this.exec(job);
  }
};

/**
 * Execute `job`.
 *
 * @param {Array} job
 * @api private
 */

Queue.prototype.exec = function(job){
  var self = this;
  var ms = this.timeout;

  var fn = job[0];
  var cb = job[1];
  if (ms) fn = timeout(fn, ms);

  this.pending++;
  fn(function(err, res){
    cb && cb(err, res);
    self.pending--;
    self.run();
  });
};

/**
 * Decorate `fn` with a timeout of `ms`.
 *
 * @param {Function} fn
 * @param {Function} ms
 * @return {Function}
 * @api private
 */

function timeout(fn, ms) {
  return function(cb){
    var done;

    var id = setTimeout(function(){
      done = true;
      var err = new Error('Timeout of ' + ms + 'ms exceeded');
      err.timeout = timeout;
      cb(err);
    }, ms);

    fn(function(err, res){
      if (done) return;
      clearTimeout(id);
      cb(err, res);
    });
  }
}

}, {"emitter":105,"bind":31,"component-emitter":105,"component-bind":31}],
105: [function(require, module, exports) {

/**
 * Expose `Emitter`.
 */

module.exports = Emitter;

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks[event] = this._callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;
  this._callbacks = this._callbacks || {};

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks[event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks[event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks[event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

}, {}],
86: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var integration = require('analytics.js-integration');
var load = require('load-script');
var onbody = require('on-body');
var domify = require('domify');
var extend = require('extend');
var bind = require('bind');
var when = require('when');

/**
 * Expose plugin.
 */

module.exports = exports = function(analytics){
  analytics.addIntegration(Bing);
};

/**
 * HOP.
 */

var has = Object.prototype.hasOwnProperty;

/**
 *
 */

var noop = function(){};

/**
 * Expose `Bing`.
 *
 * https://bingads.microsoft.com/campaign/signup
 */

var Bing = exports.Integration = integration('Bing Ads')
  .readyOnLoad()
  .option('siteId', '')
  .option('domainId', '')
  .option('events', {});

/**
 * Initialize.
 *
 * http://msdn.microsoft.com/en-us/library/bing-ads-campaign-management-campaign-analytics-scripts.aspx
 *
 * @param {Object} page
 */

Bing.prototype.initialize = function(page){
  if (!window.mstag) {
    window.mstag = {
      loadTag: noop,
      time: (new Date()).getTime(),
      // they use document.write, which doesn't work when loaded async.
      // they provide a way to override it.
      // the first time it is called, load the script,
      // and only when that script is done, is "loading" done.
      _write: writeToAppend
    };
  };
  var self = this;
  onbody(function(){
    self.load();
  });
};

/**
 * Load the Microsoft library.
 *
 * @param {Function} fn
 */

Bing.prototype.load = function(fn){
  var id = this.options.siteId;
  var url = '//flex.msn.com/mstag/site/' + id + '/mstag.js';
  var el = load(url);
  el.setAttribute('id', 'mstag_tops');
  var loaded = bind(this, this.loaded);

  // poll until this.loaded() is true.
  // have to do a weird hack like this because
  // the first script loads a second script,
  // and only after the second script is it actually loaded.
  when(loaded, fn);
};

/**
 * Loaded?
 *
 * @return {Boolean}
 */

Bing.prototype.loaded = function(){
  return !! (window.mstag && window.mstag.loadTag !== noop);
};

/**
 * Track.
 *
 * @param {Track} track
 */

Bing.prototype.track = function(track){
  var events = this.options.events;
  var traits = track.traits();
  var event = track.event();
  if (!has.call(events, event)) return;
  var goal = events[event];
  var revenue = track.revenue() || 0;
  window.mstag.loadTag('analytics', {
    domainId: this.options.domainId,
    revenue: revenue,
    dedup: '1',
    type: '1',
    actionid: goal
  });
};

/**
 * Convert `document.write` to `document.appendChild`.
 *
 * TODO: make into a component.
 *
 * @param {String} str
 */

function writeToAppend(str) {
  var first = document.getElementsByTagName('script')[0];
  var el = domify(str);
  // https://github.com/component/domify/issues/14
  if ('script' == el.tagName.toLowerCase() && el.getAttribute('src')) {
    var tmp = document.createElement('script');
    tmp.src = el.getAttribute('src');
    tmp.async = true;
    el = tmp;
  }
  document.body.appendChild(el);
}

}, {"analytics.js-integration":91,"load-script":92,"on-body":90,"domify":93,"extend":38,"bind":31,"when":106}],
106: [function(require, module, exports) {

var callback = require('callback');


/**
 * Expose `when`.
 */

module.exports = when;


/**
 * Loop on a short interval until `condition()` is true, then call `fn`.
 *
 * @param {Function} condition
 * @param {Function} fn
 * @param {Number} interval (optional)
 */

function when (condition, fn, interval) {
  if (condition()) return callback.async(fn);

  var ref = setInterval(function () {
    if (!condition()) return;
    callback(fn);
    clearInterval(ref);
  }, interval || 10);
}
}, {"callback":12}],
87: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var integration = require('analytics.js-integration');
var push = require('global-queue')('_fbq');
var load = require('load-script');

/**
 * Expose plugin
 */

module.exports = exports = function(analytics){
  analytics.addIntegration(Facebook);
};

/**
 * HOP
 */

var has = Object.prototype.hasOwnProperty;

/**
 * Expose `Facebook`
 */

var Facebook = exports.Integration = integration('Facebook Ads')
  .readyOnInitialize()
  .global('_fbq')
  .option('currency', 'USD')
  .option('events', {})
  .option('pixelId', '');

/**
 * Initialize Facebook Ads.
 *
 * https://developers.facebook.com/docs/ads-for-websites/conversion-pixel-code-migration
 *
 * @param {Object} page
 */

Facebook.prototype.initialize = function(page){
  window._fbq = window._fbq || [];
  this.load();
};

/**
 * Load the Facebook Ads library.
 *
 * @param {Function} fn
 */

Facebook.prototype.load = function(fn){
  load('//connect.facebook.net/en_US/fbds.js', fn);
  window._fbq.loaded = true;
};

/**
 * Loaded?
 *
 * @return {Boolean}
 */

Facebook.prototype.loaded = function(){
  return !! (window._fbq && window._fbq.loaded);
};

/**
 * Page.
 *
 * https://developers.facebook.com/docs/reference/ads-api/custom-audience-website-faq/#fbpixel
 */

Facebook.prototype.page = function(){
  if (this.options.pixelId) {
    this.debug('pixel loaded');
    push('addPixelId', this.options.pixelId);
    push('PixelInitialized');
  }
};

/**
 * Track.
 *
 * https://developers.facebook.com/docs/reference/ads-api/custom-audience-website-faq/#fbpixel
 *
 * @param {Track} track
 */

Facebook.prototype.track = function(track){
  var events = this.options.events;
  var traits = track.traits();
  var event = track.event();
  var revenue = track.revenue() || 0;
  var data = track.properties();
  if (has.call(events, event)) {
    // conversion flow
    event = events[event];
    data = {
      value: String(revenue.toFixed(2)),
      currency: this.options.currency
    };
  }
  push('track', event, data);
};

}, {"analytics.js-integration":91,"global-queue":107,"load-script":92}],
107: [function(require, module, exports) {

/**
 * Expose `generate`.
 */

module.exports = generate;


/**
 * Generate a global queue pushing method with `name`.
 *
 * @param {String} name
 * @param {Object} options
 *   @property {Boolean} wrap
 * @return {Function}
 */

function generate (name, options) {
  options = options || {};

  return function (args) {
    args = [].slice.call(arguments);
    window[name] || (window[name] = []);
    options.wrap === false
      ? window[name].push.apply(window[name], args)
      : window[name].push(args);
  };
}
}, {}],
88: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var integration = require('analytics.js-integration');
var push = require('global-queue')('_gaq');
var length = require('object').length;
var canonical = require('canonical');
var Track = require('facade').Track;
var callback = require('callback');
var load = require('load-script');
var keys = require('object').keys;
var dot = require('obj-case');
var each = require('each');
var type = require('type');
var url = require('url');
var is = require('is');
var group;
var user;

/**
 * Expose plugin.
 */

module.exports = exports = function(analytics){
  analytics.addIntegration(GA);
  group = analytics.group();
  user = analytics.user();
};

/**
 * Expose `GA` integration.
 *
 * http://support.google.com/analytics/bin/answer.py?hl=en&answer=2558867
 * https://developers.google.com/analytics/devguides/collection/gajs/methods/gaJSApiBasicConfiguration#_gat.GA_Tracker_._setSiteSpeedSampleRate
 */

var GA = exports.Integration = integration('Google Analytics')
  .readyOnLoad()
  .global('ga')
  .global('gaplugins')
  .global('_gaq')
  .global('GoogleAnalyticsObject')
  .option('anonymizeIp', false)
  .option('classic', false)
  .option('domain', 'none')
  .option('doubleClick', false)
  .option('enhancedLinkAttribution', false)
  .option('ignoredReferrers', null)
  .option('includeSearch', false)
  .option('siteSpeedSampleRate', 1)
  .option('trackingId', '')
  .option('trackNamedPages', true)
  .option('trackCategorizedPages', true)
  .option('sendUserId', false)
  .option('metrics', {})
  .option('dimensions', {});

/**
 * When in "classic" mode, on `construct` swap all of the method to point to
 * their classic counterparts.
 */

GA.on('construct', function(integration){
  if (!integration.options.classic) return;
  integration.initialize = integration.initializeClassic;
  integration.load = integration.loadClassic;
  integration.loaded = integration.loadedClassic;
  integration.page = integration.pageClassic;
  integration.track = integration.trackClassic;
  integration.completedOrder = integration.completedOrderClassic;
});

/**
 * Initialize.
 *
 * https://developers.google.com/analytics/devguides/collection/analyticsjs/advanced
 */

GA.prototype.initialize = function(){
  var opts = this.options;

  // setup the tracker globals
  window.GoogleAnalyticsObject = 'ga';
  window.ga = window.ga || function(){
    window.ga.q = window.ga.q || [];
    window.ga.q.push(arguments);
  };
  window.ga.l = new Date().getTime();

  // Mod to allow custom params
  var params = {
    cookieDomain: opts.domain || GA.prototype.defaults.domain, // to protect against empty string
    siteSpeedSampleRate: opts.siteSpeedSampleRate,
    allowLinker: true,
  };

  // add extra params
  if (opts.params) {
    for (var option in opts.params) {
      params[option] = opts.params[option];
    }
  }
  // End custom mods

  window.ga('create', opts.trackingId, params);

  window.ga('create', opts.trackingId, {
    cookieDomain: opts.domain || GA.prototype.defaults.domain, // to protect against empty string
    siteSpeedSampleRate: opts.siteSpeedSampleRate,
    allowLinker: true
  });

  // display advertising
  if (opts.doubleClick) {
    window.ga('require', 'displayfeatures');
  }

  // send global id
  if (opts.sendUserId && user.id()) {
    window.ga('set', '&uid', user.id());
  }

  // anonymize after initializing, otherwise a warning is shown
  // in google analytics debugger
  if (opts.anonymizeIp) window.ga('set', 'anonymizeIp', true);

  // custom dimensions & metrics
  var custom = metrics(user.traits(), opts);
  if (length(custom)) window.ga('set', custom);

  this.load();
};

/**
 * Loaded?
 *
 * @return {Boolean}
 */

GA.prototype.loaded = function(){
  return !! window.gaplugins;
};

/**
 * Load the Google Analytics library.
 *
 * @param {Function} callback
 */

GA.prototype.load = function(callback){
  load('//www.google-analytics.com/analytics.js', callback);
};

/**
 * Page.
 *
 * https://developers.google.com/analytics/devguides/collection/analyticsjs/pages
 *
 * @param {Page} page
 */

GA.prototype.page = function(page){
  var category = page.category();
  var props = page.properties();
  var name = page.fullName();
  var pageview = {};
  var track;

  this._category = category; // store for later

  // send
  window.ga('send', 'pageview', {
    page: path(props, this.options),
    title: name || props.title,
    location: props.url
  });

  // categorized pages
  if (category && this.options.trackCategorizedPages) {
    track = page.track(category);
    this.track(track, { noninteraction: true });
  }

  // named pages
  if (name && this.options.trackNamedPages) {
    track = page.track(name);
    this.track(track, { noninteraction: true });
  }
};

/**
 * Track.
 *
 * https://developers.google.com/analytics/devguides/collection/analyticsjs/events
 * https://developers.google.com/analytics/devguides/collection/analyticsjs/field-reference
 *
 * @param {Track} event
 */

GA.prototype.track = function(track, options){
  var opts = options || track.options(this.name);
  var props = track.properties();
  window.ga('send', 'event', {
    eventAction: track.event(),
    eventCategory: props.category || this._category || 'All',
    eventLabel: props.label,
    eventValue: formatValue(props.value || track.revenue()),
    nonInteraction: props.noninteraction || opts.noninteraction
  });
};

/**
 * Completed order.
 *
 * https://developers.google.com/analytics/devguides/collection/analyticsjs/ecommerce
 *
 * @param {Track} track
 * @api private
 */

GA.prototype.completedOrder = function(track){
  var total = track.total() || track.revenue() || 0;
  var orderId = track.orderId();
  var products = track.products();
  var props = track.properties();

  // orderId is required.
  if (!orderId) return;

  // require ecommerce
  if (!this.ecommerce) {
    window.ga('require', 'ecommerce', 'ecommerce.js');
    this.ecommerce = true;
  }

  // add transaction
  window.ga('ecommerce:addTransaction', {
    affiliation: props.affiliation,
    shipping: track.shipping(),
    revenue: total,
    tax: track.tax(),
    id: orderId
  });

  // add products
  each(products, function(product){
    var track = new Track({ properties: product });
    window.ga('ecommerce:addItem', {
      category: track.category(),
      quantity: track.quantity(),
      price: track.price(),
      name: track.name(),
      sku: track.sku(),
      id: orderId
    });
  });

  // send
  window.ga('ecommerce:send');
};

/**
 * Initialize (classic).
 *
 * https://developers.google.com/analytics/devguides/collection/gajs/methods/gaJSApiBasicConfiguration
 */

GA.prototype.initializeClassic = function(){
  var opts = this.options;
  var anonymize = opts.anonymizeIp;
  var db = opts.doubleClick;
  var domain = opts.domain;
  var enhanced = opts.enhancedLinkAttribution;
  var ignore = opts.ignoredReferrers;
  var sample = opts.siteSpeedSampleRate;

  window._gaq = window._gaq || [];
  push('_setAccount', opts.trackingId);
  push('_setAllowLinker', true);

  if (anonymize) push('_gat._anonymizeIp');
  if (domain) push('_setDomainName', domain);
  if (sample) push('_setSiteSpeedSampleRate', sample);

  if (enhanced) {
    var protocol = 'https:' === document.location.protocol ? 'https:' : 'http:';
    var pluginUrl = protocol + '//www.google-analytics.com/plugins/ga/inpage_linkid.js';
    push('_require', 'inpage_linkid', pluginUrl);
  }

  if (ignore) {
    if (!is.array(ignore)) ignore = [ignore];
    each(ignore, function (domain) {
      push('_addIgnoredRef', domain);
    });
  }

  this.load();
};

/**
 * Loaded? (classic)
 *
 * @return {Boolean}
 */

GA.prototype.loadedClassic = function(){
  return !! (window._gaq && window._gaq.push !== Array.prototype.push);
};


/**
 * Load the classic Google Analytics library.
 *
 * @param {Function} callback
 */

GA.prototype.loadClassic = function(callback){
  if (this.options.doubleClick) {
    load('//stats.g.doubleclick.net/dc.js', callback);
  } else {
    load({
      http: 'http://www.google-analytics.com/ga.js',
      https: 'https://ssl.google-analytics.com/ga.js'
    }, callback);
  }
};

/**
 * Page (classic).
 *
 * https://developers.google.com/analytics/devguides/collection/gajs/methods/gaJSApiBasicConfiguration
 *
 * @param {Page} page
 */

GA.prototype.pageClassic = function(page){
  var opts = page.options(this.name);
  var category = page.category();
  var props = page.properties();
  var name = page.fullName();
  var track;

  push('_trackPageview', path(props, this.options));

  // categorized pages
  if (category && this.options.trackCategorizedPages) {
    track = page.track(category);
    this.track(track, { noninteraction: true });
  }

  // named pages
  if (name && this.options.trackNamedPages) {
    track = page.track(name);
    this.track(track, { noninteraction: true });
  }
};

/**
 * Track (classic).
 *
 * https://developers.google.com/analytics/devguides/collection/gajs/methods/gaJSApiEventTracking
 *
 * @param {Track} track
 */

GA.prototype.trackClassic = function(track, options){
  var opts = options || track.options(this.name);
  var props = track.properties();
  var revenue = track.revenue();
  var event = track.event();
  var category = this._category || props.category || 'All';
  var label = props.label;
  var value = formatValue(revenue || props.value);
  var noninteraction = props.noninteraction || opts.noninteraction;
  push('_trackEvent', category, event, label, value, noninteraction);
};

/**
 * Completed order.
 *
 * https://developers.google.com/analytics/devguides/collection/gajs/gaTrackingEcommerce
 *
 * @param {Track} track
 * @api private
 */

GA.prototype.completedOrderClassic = function(track){
  var total = track.total() || track.revenue() || 0;
  var orderId = track.orderId();
  var products = track.products() || [];
  var props = track.properties();

  // required
  if (!orderId) return;

  // add transaction
  push('_addTrans'
    , orderId
    , props.affiliation
    , total
    , track.tax()
    , track.shipping()
    , track.city()
    , track.state()
    , track.country());

  // add items
  each(products, function(product){
    var track = new Track({ properties: product });
    push('_addItem'
      , orderId
      , track.sku()
      , track.name()
      , track.category()
      , track.price()
      , track.quantity());
  })

  // send
  push('_trackTrans');
};

/**
 * Return the path based on `properties` and `options`.
 *
 * @param {Object} properties
 * @param {Object} options
 */

function path(properties, options) {
  if (!properties) return;
  var str = properties.path;
  if (options.includeSearch && properties.search) str += properties.search;
  return str;
}

/**
 * Format the value property to Google's liking.
 *
 * @param {Number} value
 * @return {Number}
 */

function formatValue(value) {
  if (!value || value < 0) return 0;
  return Math.round(value);
}

/**
 * Map google's custom dimensions & metrics with `obj`.
 *
 * Example:
 *
 *      metrics({ revenue: 1.9 }, { { metrics : { metric8: 'revenue' } });
 *      // => { metric8: 1.9 }
 *
 *      metrics({ revenue: 1.9 }, {});
 *      // => {}
 *
 * @param {Object} obj
 * @param {Object} data
 * @return {Object|null}
 * @api private
 */

function metrics(obj, data){
  var dimensions = data.dimensions;
  var metrics = data.metrics;
  var names = keys(metrics).concat(keys(dimensions));
  var ret = {};

  for (var i = 0; i < names.length; ++i) {
    var name = names[i];
    var key = metrics[name] || dimensions[name];
    var value = dot(obj, name);
    if (null == value) continue;
    ret[key] = value;
  }

  return ret;
}

}, {"analytics.js-integration":91,"global-queue":107,"object":25,"canonical":13,"facade":108,"callback":12,"load-script":92,"obj-case":59,"each":5,"type":33,"url":26,"is":18}],
108: [function(require, module, exports) {

var Facade = require('./facade');

/**
 * Expose `Facade` facade.
 */

module.exports = Facade;

/**
 * Expose specific-method facades.
 */

Facade.Alias = require('./alias');
Facade.Group = require('./group');
Facade.Identify = require('./identify');
Facade.Track = require('./track');
Facade.Page = require('./page');
Facade.Screen = require('./screen');

}, {"./facade":109,"./alias":110,"./group":111,"./identify":112,"./track":113,"./page":114,"./screen":115}],
109: [function(require, module, exports) {

var clone = require('./utils').clone;
var isEnabled = require('./is-enabled');
var objCase = require('obj-case');
var traverse = require('isodate-traverse');

/**
 * Expose `Facade`.
 */

module.exports = Facade;

/**
 * Initialize a new `Facade` with an `obj` of arguments.
 *
 * @param {Object} obj
 */

function Facade (obj) {
  if (!obj.hasOwnProperty('timestamp')) obj.timestamp = new Date();
  else obj.timestamp = new Date(obj.timestamp);
  this.obj = obj;
}

/**
 * Return a proxy function for a `field` that will attempt to first use methods,
 * and fallback to accessing the underlying object directly. You can specify
 * deeply nested fields too like:
 *
 *   this.proxy('options.Librato');
 *
 * @param {String} field
 */

Facade.prototype.proxy = function (field) {
  var fields = field.split('.');
  field = fields.shift();

  // Call a function at the beginning to take advantage of facaded fields
  var obj = this[field] || this.field(field);
  if (!obj) return obj;
  if (typeof obj === 'function') obj = obj.call(this) || {};
  if (fields.length === 0) return transform(obj);

  obj = objCase(obj, fields.join('.'));
  return transform(obj);
};

/**
 * Directly access a specific `field` from the underlying object, returning a
 * clone so outsiders don't mess with stuff.
 *
 * @param {String} field
 * @return {Mixed}
 */

Facade.prototype.field = function (field) {
  var obj = this.obj[field];
  return transform(obj);
};

/**
 * Utility method to always proxy a particular `field`. You can specify deeply
 * nested fields too like:
 *
 *   Facade.proxy('options.Librato');
 *
 * @param {String} field
 * @return {Function}
 */

Facade.proxy = function (field) {
  return function () {
    return this.proxy(field);
  };
};

/**
 * Utility method to directly access a `field`.
 *
 * @param {String} field
 * @return {Function}
 */

Facade.field = function (field) {
  return function () {
    return this.field(field);
  };
};

/**
 * Get the basic json object of this facade.
 *
 * @return {Object}
 */

Facade.prototype.json = function () {
  var ret = clone(this.obj);
  if (this.type) ret.type = this.type();
  return ret;
};

/**
 * Get the options of a call (formerly called "context"). If you pass an
 * integration name, it will get the options for that specific integration, or
 * undefined if the integration is not enabled.
 *
 * @param {String} integration (optional)
 * @return {Object or Null}
 */

Facade.prototype.context =
Facade.prototype.options = function (integration) {
  var options = clone(this.obj.options || this.obj.context) || {};
  if (!integration) return clone(options);
  if (!this.enabled(integration)) return;
  var integrations = this.integrations();
  var value = integrations[integration] || objCase(integrations, integration);
  if ('boolean' == typeof value) value = {};
  return value || {};
};

/**
 * Check whether an integration is enabled.
 *
 * @param {String} integration
 * @return {Boolean}
 */

Facade.prototype.enabled = function (integration) {
  var allEnabled = this.proxy('options.providers.all');
  if (typeof allEnabled !== 'boolean') allEnabled = this.proxy('options.all');
  if (typeof allEnabled !== 'boolean') allEnabled = this.proxy('integrations.all');
  if (typeof allEnabled !== 'boolean') allEnabled = true;

  var enabled = allEnabled && isEnabled(integration);
  var options = this.integrations();

  // If the integration is explicitly enabled or disabled, use that
  // First, check options.providers for backwards compatibility
  if (options.providers && options.providers.hasOwnProperty(integration)) {
    enabled = options.providers[integration];
  }

  // Next, check for the integration's existence in 'options' to enable it.
  // If the settings are a boolean, use that, otherwise it should be enabled.
  if (options.hasOwnProperty(integration)) {
    var settings = options[integration];
    if (typeof settings === 'boolean') {
      enabled = settings;
    } else {
      enabled = true;
    }
  }

  return enabled ? true : false;
};

/**
 * Get all `integration` options.
 *
 * @param {String} integration
 * @return {Object}
 * @api private
 */

Facade.prototype.integrations = function(){
  return this.obj.integrations
    || this.proxy('options.providers')
    || this.options();
};

/**
 * Check whether the user is active.
 *
 * @return {Boolean}
 */

Facade.prototype.active = function () {
  var active = this.proxy('options.active');
  if (active === null || active === undefined) active = true;
  return active;
};

/**
 * Get `sessionId / anonymousId`.
 *
 * @return {Mixed}
 * @api public
 */

Facade.prototype.sessionId =
Facade.prototype.anonymousId = function(){
  return this.field('anonymousId')
    || this.field('sessionId');
};

/**
 * Get `groupId` from `context.groupId`.
 *
 * @return {String}
 * @api public
 */

Facade.prototype.groupId = Facade.proxy('options.groupId');

/**
 * Get the call's "super properties" which are just traits that have been
 * passed in as if from an identify call.
 *
 * @param {Object} aliases
 * @return {Object}
 */

Facade.prototype.traits = function (aliases) {
  var ret = this.proxy('options.traits') || {};
  var id = this.userId();
  aliases = aliases || {};

  if (id) ret.id = id;

  for (var alias in aliases) {
    var value = null == this[alias]
      ? this.proxy('options.traits.' + alias)
      : this[alias]();
    if (null == value) continue;
    ret[aliases[alias]] = value;
    delete ret[alias];
  }

  return ret;
};

/**
 * Add a convenient way to get the library name and version
 */

Facade.prototype.library = function(){
  var library = this.proxy('options.library');
  if (!library) return { name: 'unknown', version: null };
  if (typeof library === 'string') return { name: library, version: null };
  return library;
};

/**
 * Setup some basic proxies.
 */

Facade.prototype.userId = Facade.field('userId');
Facade.prototype.channel = Facade.field('channel');
Facade.prototype.timestamp = Facade.field('timestamp');
Facade.prototype.userAgent = Facade.proxy('options.userAgent');
Facade.prototype.ip = Facade.proxy('options.ip');

/**
 * Return the cloned and traversed object
 *
 * @param {Mixed} obj
 * @return {Mixed}
 */

function transform(obj){
  var cloned = clone(obj);
  traverse(cloned);
  return cloned;
}

}, {"./utils":116,"./is-enabled":117,"obj-case":59,"isodate-traverse":60}],
116: [function(require, module, exports) {

/**
 * TODO: use component symlink, everywhere ?
 */

try {
  exports.inherit = require('inherit');
  exports.clone = require('clone');
} catch (e) {
  exports.inherit = require('inherit-component');
  exports.clone = require('clone-component');
}

}, {"inherit":61,"clone":62}],
117: [function(require, module, exports) {

/**
 * A few integrations are disabled by default. They must be explicitly
 * enabled by setting options[Provider] = true.
 */

var disabled = {
  Salesforce: true,
  Marketo: true
};

/**
 * Check whether an integration should be enabled by default.
 *
 * @param {String} integration
 * @return {Boolean}
 */

module.exports = function (integration) {
  return ! disabled[integration];
};
}, {}],
110: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var inherit = require('./utils').inherit;
var Facade = require('./facade');

/**
 * Expose `Alias` facade.
 */

module.exports = Alias;

/**
 * Initialize a new `Alias` facade with a `dictionary` of arguments.
 *
 * @param {Object} dictionary
 *   @property {String} from
 *   @property {String} to
 *   @property {Object} options
 */

function Alias (dictionary) {
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`.
 */

inherit(Alias, Facade);

/**
 * Return type of facade.
 *
 * @return {String}
 */

Alias.prototype.type =
Alias.prototype.action = function () {
  return 'alias';
};

/**
 * Get `previousId`.
 *
 * @return {Mixed}
 * @api public
 */

Alias.prototype.from =
Alias.prototype.previousId = function(){
  return this.field('previousId')
    || this.field('from');
};

/**
 * Get `userId`.
 *
 * @return {String}
 * @api public
 */

Alias.prototype.to =
Alias.prototype.userId = function(){
  return this.field('userId')
    || this.field('to');
};

}, {"./utils":116,"./facade":109}],
111: [function(require, module, exports) {

var inherit = require('./utils').inherit;
var Facade = require('./facade');
var newDate = require('new-date');

/**
 * Expose `Group` facade.
 */

module.exports = Group;

/**
 * Initialize a new `Group` facade with a `dictionary` of arguments.
 *
 * @param {Object} dictionary
 *   @param {String} userId
 *   @param {String} groupId
 *   @param {Object} properties
 *   @param {Object} options
 */

function Group (dictionary) {
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`
 */

inherit(Group, Facade);

/**
 * Get the facade's action.
 */

Group.prototype.type =
Group.prototype.action = function () {
  return 'group';
};

/**
 * Setup some basic proxies.
 */

Group.prototype.groupId = Facade.field('groupId');

/**
 * Get created or createdAt.
 *
 * @return {Date}
 */

Group.prototype.created = function(){
  var created = this.proxy('traits.createdAt')
    || this.proxy('traits.created')
    || this.proxy('properties.createdAt')
    || this.proxy('properties.created');

  if (created) return newDate(created);
};

/**
 * Get the group's traits.
 *
 * @param {Object} aliases
 * @return {Object}
 */

Group.prototype.traits = function (aliases) {
  var ret = this.properties();
  var id = this.groupId();
  aliases = aliases || {};

  if (id) ret.id = id;

  for (var alias in aliases) {
    var value = null == this[alias]
      ? this.proxy('traits.' + alias)
      : this[alias]();
    if (null == value) continue;
    ret[aliases[alias]] = value;
    delete ret[alias];
  }

  return ret;
};

/**
 * Get traits or properties.
 *
 * TODO: remove me
 *
 * @return {Object}
 */

Group.prototype.properties = function(){
  return this.field('traits')
    || this.field('properties')
    || {};
};

}, {"./utils":116,"./facade":109,"new-date":21}],
112: [function(require, module, exports) {

var Facade = require('./facade');
var isEmail = require('is-email');
var newDate = require('new-date');
var utils = require('./utils');
var trim = require('trim');
var inherit = utils.inherit;
var clone = utils.clone;

/**
 * Expose `Idenfity` facade.
 */

module.exports = Identify;

/**
 * Initialize a new `Identify` facade with a `dictionary` of arguments.
 *
 * @param {Object} dictionary
 *   @param {String} userId
 *   @param {String} sessionId
 *   @param {Object} traits
 *   @param {Object} options
 */

function Identify (dictionary) {
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`.
 */

inherit(Identify, Facade);

/**
 * Get the facade's action.
 */

Identify.prototype.type =
Identify.prototype.action = function () {
  return 'identify';
};

/**
 * Get the user's traits.
 *
 * @param {Object} aliases
 * @return {Object}
 */

Identify.prototype.traits = function (aliases) {
  var ret = this.field('traits') || {};
  var id = this.userId();
  aliases = aliases || {};

  if (id) ret.id = id;

  for (var alias in aliases) {
    var value = null == this[alias]
      ? this.proxy('traits.' + alias)
      : this[alias]();
    if (null == value) continue;
    ret[aliases[alias]] = value;
    delete ret[alias];
  }

  return ret;
};

/**
 * Get the user's email, falling back to their user ID if it's a valid email.
 *
 * @return {String}
 */

Identify.prototype.email = function () {
  var email = this.proxy('traits.email');
  if (email) return email;

  var userId = this.userId();
  if (isEmail(userId)) return userId;
};

/**
 * Get the user's created date, optionally looking for `createdAt` since lots of
 * people do that instead.
 *
 * @return {Date or Undefined}
 */

Identify.prototype.created = function () {
  var created = this.proxy('traits.created') || this.proxy('traits.createdAt');
  if (created) return newDate(created);
};

/**
 * Get the company created date.
 *
 * @return {Date or undefined}
 */

Identify.prototype.companyCreated = function(){
  var created = this.proxy('traits.company.created')
    || this.proxy('traits.company.createdAt');

  if (created) return newDate(created);
};

/**
 * Get the user's name, optionally combining a first and last name if that's all
 * that was provided.
 *
 * @return {String or Undefined}
 */

Identify.prototype.name = function () {
  var name = this.proxy('traits.name');
  if (typeof name === 'string') return trim(name);

  var firstName = this.firstName();
  var lastName = this.lastName();
  if (firstName && lastName) return trim(firstName + ' ' + lastName);
};

/**
 * Get the user's first name, optionally splitting it out of a single name if
 * that's all that was provided.
 *
 * @return {String or Undefined}
 */

Identify.prototype.firstName = function () {
  var firstName = this.proxy('traits.firstName');
  if (typeof firstName === 'string') return trim(firstName);

  var name = this.proxy('traits.name');
  if (typeof name === 'string') return trim(name).split(' ')[0];
};

/**
 * Get the user's last name, optionally splitting it out of a single name if
 * that's all that was provided.
 *
 * @return {String or Undefined}
 */

Identify.prototype.lastName = function () {
  var lastName = this.proxy('traits.lastName');
  if (typeof lastName === 'string') return trim(lastName);

  var name = this.proxy('traits.name');
  if (typeof name !== 'string') return;

  var space = trim(name).indexOf(' ');
  if (space === -1) return;

  return trim(name.substr(space + 1));
};

/**
 * Get the user's unique id.
 *
 * @return {String or undefined}
 */

Identify.prototype.uid = function(){
  return this.userId()
    || this.username()
    || this.email();
};

/**
 * Get description.
 *
 * @return {String}
 */

Identify.prototype.description = function(){
  return this.proxy('traits.description')
    || this.proxy('traits.background');
};

/**
 * Setup sme basic "special" trait proxies.
 */

Identify.prototype.username = Facade.proxy('traits.username');
Identify.prototype.website = Facade.proxy('traits.website');
Identify.prototype.phone = Facade.proxy('traits.phone');
Identify.prototype.address = Facade.proxy('traits.address');
Identify.prototype.avatar = Facade.proxy('traits.avatar');

}, {"./facade":109,"./utils":116,"is-email":19,"new-date":21,"trim":49}],
113: [function(require, module, exports) {

var inherit = require('./utils').inherit;
var clone = require('./utils').clone;
var Facade = require('./facade');
var Identify = require('./identify');
var isEmail = require('is-email');

/**
 * Expose `Track` facade.
 */

module.exports = Track;

/**
 * Initialize a new `Track` facade with a `dictionary` of arguments.
 *
 * @param {object} dictionary
 *   @property {String} event
 *   @property {String} userId
 *   @property {String} sessionId
 *   @property {Object} properties
 *   @property {Object} options
 */

function Track (dictionary) {
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`.
 */

inherit(Track, Facade);

/**
 * Return the facade's action.
 *
 * @return {String}
 */

Track.prototype.type =
Track.prototype.action = function () {
  return 'track';
};

/**
 * Setup some basic proxies.
 */

Track.prototype.event = Facade.field('event');
Track.prototype.value = Facade.proxy('properties.value');

/**
 * Misc
 */

Track.prototype.category = Facade.proxy('properties.category');
Track.prototype.country = Facade.proxy('properties.country');
Track.prototype.state = Facade.proxy('properties.state');
Track.prototype.city = Facade.proxy('properties.city');
Track.prototype.zip = Facade.proxy('properties.zip');

/**
 * Ecommerce
 */

Track.prototype.id = Facade.proxy('properties.id');
Track.prototype.sku = Facade.proxy('properties.sku');
Track.prototype.tax = Facade.proxy('properties.tax');
Track.prototype.name = Facade.proxy('properties.name');
Track.prototype.price = Facade.proxy('properties.price');
Track.prototype.total = Facade.proxy('properties.total');
Track.prototype.coupon = Facade.proxy('properties.coupon');
Track.prototype.shipping = Facade.proxy('properties.shipping');

/**
 * Order id.
 *
 * @return {String}
 * @api public
 */

Track.prototype.orderId = function(){
  return this.proxy('properties.id')
    || this.proxy('properties.orderId');
};

/**
 * Get subtotal.
 *
 * @return {Number}
 */

Track.prototype.subtotal = function(){
  var subtotal = this.obj.properties.subtotal;
  var total = this.total();
  var n;

  if (subtotal) return subtotal;
  if (!total) return 0;
  if (n = this.tax()) total -= n;
  if (n = this.shipping()) total -= n;

  return total;
};

/**
 * Get products.
 *
 * @return {Array}
 */

Track.prototype.products = function(){
  var props = this.obj.properties || {};
  return props.products || [];
};

/**
 * Get quantity.
 *
 * @return {Number}
 */

Track.prototype.quantity = function(){
  var props = this.obj.properties || {};
  return props.quantity || 1;
};

/**
 * Get currency.
 *
 * @return {String}
 */

Track.prototype.currency = function(){
  var props = this.obj.properties || {};
  return props.currency || 'USD';
};

/**
 * BACKWARDS COMPATIBILITY: should probably re-examine where these come from.
 */

Track.prototype.referrer = Facade.proxy('properties.referrer');
Track.prototype.query = Facade.proxy('options.query');

/**
 * Get the call's properties.
 *
 * @param {Object} aliases
 * @return {Object}
 */

Track.prototype.properties = function (aliases) {
  var ret = this.field('properties') || {};
  aliases = aliases || {};

  for (var alias in aliases) {
    var value = null == this[alias]
      ? this.proxy('properties.' + alias)
      : this[alias]();
    if (null == value) continue;
    ret[aliases[alias]] = value;
    delete ret[alias];
  }

  return ret;
};

/**
 * Get the call's username.
 *
 * @return {String or Undefined}
 */

Track.prototype.username = function () {
  return this.proxy('traits.username') ||
         this.proxy('properties.username') ||
         this.userId() ||
         this.sessionId();
};

/**
 * Get the call's email, using an the user ID if it's a valid email.
 *
 * @return {String or Undefined}
 */

Track.prototype.email = function () {
  var email = this.proxy('traits.email');
  email = email || this.proxy('properties.email');
  if (email) return email;

  var userId = this.userId();
  if (isEmail(userId)) return userId;
};

/**
 * Get the call's revenue, parsing it from a string with an optional leading
 * dollar sign.
 *
 * For products/services that don't have shipping and are not directly taxed,
 * they only care about tracking `revenue`. These are things like
 * SaaS companies, who sell monthly subscriptions. The subscriptions aren't
 * taxed directly, and since it's a digital product, it has no shipping.
 *
 * The only case where there's a difference between `revenue` and `total`
 * (in the context of analytics) is on ecommerce platforms, where they want
 * the `revenue` function to actually return the `total` (which includes
 * tax and shipping, total = subtotal + tax + shipping). This is probably
 * because on their backend they assume tax and shipping has been applied to
 * the value, and so can get the revenue on their own.
 *
 * @return {Number}
 */

Track.prototype.revenue = function () {
  var revenue = this.proxy('properties.revenue');
  var event = this.event();

  // it's always revenue, unless it's called during an order completion.
  if (!revenue && event && event.match(/completed ?order/i)) {
    revenue = this.proxy('properties.total');
  }

  return currency(revenue);
};

/**
 * Get cents.
 *
 * @return {Number}
 */

Track.prototype.cents = function(){
  var revenue = this.revenue();
  return 'number' != typeof revenue
    ? this.value() || 0
    : revenue * 100;
};

/**
 * A utility to turn the pieces of a track call into an identify. Used for
 * integrations with super properties or rate limits.
 *
 * TODO: remove me.
 *
 * @return {Facade}
 */

Track.prototype.identify = function () {
  var json = this.json();
  json.traits = this.traits();
  return new Identify(json);
};

/**
 * Get float from currency value.
 *
 * @param {Mixed} val
 * @return {Number}
 */

function currency(val) {
  if (!val) return;
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return;

  val = val.replace(/\$/g, '');
  val = parseFloat(val);

  if (!isNaN(val)) return val;
}

}, {"./utils":116,"./facade":109,"./identify":112,"is-email":19}],
114: [function(require, module, exports) {

var inherit = require('./utils').inherit;
var Facade = require('./facade');
var Track = require('./track');

/**
 * Expose `Page` facade
 */

module.exports = Page;

/**
 * Initialize new `Page` facade with `dictionary`.
 *
 * @param {Object} dictionary
 *   @param {String} category
 *   @param {String} name
 *   @param {Object} traits
 *   @param {Object} options
 */

function Page(dictionary){
  Facade.call(this, dictionary);
}

/**
 * Inherit from `Facade`
 */

inherit(Page, Facade);

/**
 * Get the facade's action.
 *
 * @return {String}
 */

Page.prototype.type =
Page.prototype.action = function(){
  return 'page';
};

/**
 * Proxies
 */

Page.prototype.category = Facade.field('category');
Page.prototype.name = Facade.field('name');

/**
 * Get the page properties mixing `category` and `name`.
 *
 * @return {Object}
 */

Page.prototype.properties = function(){
  var props = this.field('properties') || {};
  var category = this.category();
  var name = this.name();
  if (category) props.category = category;
  if (name) props.name = name;
  return props;
};

/**
 * Get the page fullName.
 *
 * @return {String}
 */

Page.prototype.fullName = function(){
  var category = this.category();
  var name = this.name();
  return name && category
    ? category + ' ' + name
    : name;
};

/**
 * Get event with `name`.
 *
 * @return {String}
 */

Page.prototype.event = function(name){
  return name
    ? 'Viewed ' + name + ' Page'
    : 'Loaded a Page';
};

/**
 * Convert this Page to a Track facade with `name`.
 *
 * @param {String} name
 * @return {Track}
 */

Page.prototype.track = function(name){
  var props = this.properties();
  return new Track({
    event: this.event(name),
    properties: props
  });
};

}, {"./utils":116,"./facade":109,"./track":113}],
115: [function(require, module, exports) {

var inherit = require('./utils').inherit;
var Page = require('./page');
var Track = require('./track');

/**
 * Expose `Screen` facade
 */

module.exports = Screen;

/**
 * Initialize new `Screen` facade with `dictionary`.
 *
 * @param {Object} dictionary
 *   @param {String} category
 *   @param {String} name
 *   @param {Object} traits
 *   @param {Object} options
 */

function Screen(dictionary){
  Page.call(this, dictionary);
}

/**
 * Inherit from `Page`
 */

inherit(Screen, Page);

/**
 * Get the facade's action.
 *
 * @return {String}
 * @api public
 */

Screen.prototype.type =
Screen.prototype.action = function(){
  return 'screen';
};

/**
 * Get event with `name`.
 *
 * @param {String} name
 * @return {String}
 * @api public
 */

Screen.prototype.event = function(name){
  return name
    ? 'Viewed ' + name + ' Screen'
    : 'Loaded a Screen';
};

/**
 * Convert this Screen.
 *
 * @param {String} name
 * @return {Track}
 * @api public
 */

Screen.prototype.track = function(name){
  var props = this.properties();
  return new Track({
    event: this.event(name),
    properties: props
  });
};

}, {"./utils":116,"./page":114,"./track":113}],
89: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var pixel = require('load-pixel')('//analytics.twitter.com/i/adsct');
var integration = require('analytics.js-integration');

/**
 * Expose plugin.
 */

module.exports = exports = function(analytics){
  analytics.addIntegration(TwitterAds);
};

/**
 * HOP.
 */

var has = Object.prototype.hasOwnProperty;

/**
 * Expose `TwitterAds`.
 */

var TwitterAds = exports.Integration = integration('Twitter Ads')
  .readyOnLoad()
  .option('events', {});

/**
 * Track.
 *
 * @param {Track} track
 */

TwitterAds.prototype.track = function(track){
  var events = this.options.events;
  var event = track.event();
  if (!has.call(events, event)) return;
  var img = new Image();
  img.src = '//analytics.twitter.com/i/adsct'
    + '?txn_id=' + events[event]
    + '&p_id=Twitter';
  img.width = 1;
  img.height = 1;
  return img;
};

}, {"load-pixel":118,"analytics.js-integration":91}],
118: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var stringify = require('querystring').stringify;
var sub = require('substitute');

/**
 * Factory function to create a pixel loader.
 *
 * @param {String} path
 * @return {Function}
 * @api public
 */

module.exports = function(path){
  return function(query, obj, fn){
    if ('function' == typeof obj) fn = obj, obj = {};
    obj = obj || {};
    fn = fn || function(){};
    var url = sub(path, obj);
    var img = new Image;
    img.onerror = error(fn, 'failed to load pixel', img);
    img.onload = function(){ fn(); };
    query = stringify(query);
    if (query) query = '?' + query;
    img.src = url + query;
    img.width = 1;
    img.height = 1;
    return img;
  };
};

/**
 * Create an error handler.
 *
 * @param {Fucntion} fn
 * @param {String} message
 * @param {Image} img
 * @return {Function}
 * @api private
 */

function error(fn, message, img){
  return function(e){
    e = e || window.event;
    var err = new Error(message);
    err.event = e;
    err.source = img;
    fn(err);
  };
}

}, {"querystring":119,"substitute":120}],
119: [function(require, module, exports) {

/**
 * Module dependencies.
 */

var encode = encodeURIComponent;
var decode = decodeURIComponent;
var trim = require('trim');
var type = require('type');

/**
 * Parse the given query `str`.
 *
 * @param {String} str
 * @return {Object}
 * @api public
 */

exports.parse = function(str){
  if ('string' != typeof str) return {};

  str = trim(str);
  if ('' == str) return {};
  if ('?' == str.charAt(0)) str = str.slice(1);

  var obj = {};
  var pairs = str.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var parts = pairs[i].split('=');
    var key = decode(parts[0]);
    var m;

    if (m = /(\w+)\[(\d+)\]/.exec(key)) {
      obj[m[1]] = obj[m[1]] || [];
      obj[m[1]][m[2]] = decode(parts[1]);
      continue;
    }

    obj[parts[0]] = null == parts[1]
      ? ''
      : decode(parts[1]);
  }

  return obj;
};

/**
 * Stringify the given `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api public
 */

exports.stringify = function(obj){
  if (!obj) return '';
  var pairs = [];

  for (var key in obj) {
    var value = obj[key];

    if ('array' == type(value)) {
      for (var i = 0; i < value.length; ++i) {
        pairs.push(encode(key + '[' + i + ']') + '=' + encode(value[i]));
      }
      continue;
    }

    pairs.push(encode(key) + '=' + encode(obj[key]));
  }

  return pairs.join('&');
};

}, {"trim":49,"type":33}],
120: [function(require, module, exports) {

/**
 * Expose `substitute`
 */

module.exports = substitute;

/**
 * Substitute `:prop` with the given `obj` in `str`
 *
 * @param {String} str
 * @param {Object} obj
 * @param {RegExp} expr
 * @return {String}
 * @api public
 */

function substitute(str, obj, expr){
  if (!obj) throw new TypeError('expected an object');
  expr = expr || /:(\w+)/g;
  return str.replace(expr, function(_, prop){
    return null != obj[prop]
      ? obj[prop]
      : _;
  });
}

}, {}]}, {}, {"1":"analytics"})
