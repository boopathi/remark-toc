(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.mdastTOC = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
'use strict';

/*
 * Dependencies.
 */

var repeat = require('repeat-string');

var slugg = null;
var fs = {};
var path = {};
var proc = {};

try {
    slugg = require('slugg');
} catch (exception) {/* empty */}

try {
    fs = require('fs');
} catch (exception) {/* empty */}

try {
    path = require('path');
} catch (exception) {/* empty */}

/*
 * Hide process use from browserify and component.
 */

/* istanbul ignore else */
if (typeof global !== 'undefined' && global.process) {
    proc = global.process;
}

/*
 * Methods.
 */

var exists = fs.existsSync;
var resolve = path.resolve;

/*
 * Constants.
 */

var MODULES = 'node_modules';
var EMPTY = '';
var HEADING = 'heading';
var LIST = 'list';
var LIST_ITEM = 'listItem';
var PARAGRAPH = 'paragraph';
var LINK = 'link';
var TEXT = 'text';
var EXTENSION = '.js';
var NPM = 'npm';
var GITHUB = 'github';
var SLUGG = 'slugg';
var DASH = '-';

var DEFAULT_HEADING = 'toc|table[ -]of[ -]contents?';
var DEFAULT_LIBRARY = GITHUB;

/**
 * Transform a string into an applicable expression.
 *
 * @param {string} value
 * @return {RegExp}
 */
function toExpression(value) {
    return new RegExp('^(' + value + ')$', 'i');
}

/**
 * Get the value of `node`.
 *
 * @param {Node} node
 * @return {string}
 */
function getValue(node) {
    return node &&
        (node.value ? node.value :
        (node.alt ? node.alt : node.title)) || EMPTY;
}

/**
 * Returns the text content of a node.
 * Checks `alt` or `title` when no value or children
 * exist.
 *
 * @param {Node} node
 * @return {string}
 */
function toString(node) {
    return getValue(node) ||
        (node.children && node.children.map(toString).join(EMPTY)) ||
        EMPTY;
}

/**
 * Check if `node` is the main heading.
 *
 * @param {Node} node
 * @return {boolean}
 */
function isOpeningHeading(node, depth, expression) {
    return depth === null && node && node.type === HEADING &&
        expression.test(toString(node));
}

/**
 * Check if `node` is the next heading.
 *
 * @param {Node} node
 * @param {number} depth
 * @return {boolean}
 */
function isClosingHeading(node, depth) {
    return depth && node && node.type === HEADING && node.depth <= depth;
}

/**
 * Search a node for a location.
 *
 * @param {Node} root
 * @return {Object}
 */
function search(root, expression) {
    var index = -1;
    var length = root.children.length;
    var depth = null;
    var lookingForToc = true;
    var map = [];
    var child;
    var headingIndex;
    var closingIndex;
    var value;

    while (++index < length) {
        child = root.children[index];

        if (lookingForToc) {
            if (isClosingHeading(child, depth)) {
                closingIndex = index;
                lookingForToc = false;
            }

            if (isOpeningHeading(child, depth, expression)) {
                headingIndex = index + 1;
                depth = child.depth;
            }
        }

        if (!lookingForToc && child.type === HEADING) {
            value = toString(child);

            if (value) {
                map.push({
                    'depth': child.depth,
                    'value': value
                });
            }
        }
    }

    if (headingIndex) {
        if (!closingIndex) {
            closingIndex = length + 1;
        }

        /*
         * Remove current TOC.
         */

        root.children.splice(headingIndex, closingIndex - headingIndex);
    }

    return {
        'index': headingIndex || null,
        'map': map
    };
}

/**
 * Create a list.
 *
 * @return {Object}
 */
function list() {
    return {
        'type': LIST,
        'ordered': false,
        'children': []
    };
}

/**
 * Create a list item.
 *
 * @return {Object}
 */
function listItem() {
    return {
        'type': LIST_ITEM,
        'loose': false,
        'children': []
    };
}

/**
 * Insert a `node` into a `parent`.
 *
 * @param {Object} node
 * @param {Object} parent
 */
function insert(node, parent, library) {
    var children = parent.children;
    var last = children[children.length - 1];
    var item;

    if (node.depth === 1) {
        item = listItem();

        item.children.push({
            'type': PARAGRAPH,
            'children': [
                {
                    'type': LINK,
                    'title': null,
                    'href': '#' + library(node.value),
                    'children': [
                        {
                            'type': TEXT,
                            'value': node.value
                        }
                    ]
                }
            ]
        });

        children.push(item);
    } else if (last && last.type === LIST_ITEM) {
        insert(node, last, library);
    } else if (last && last.type === LIST) {
        node.depth--;

        insert(node, last, library);
    } else if (parent.type === LIST) {
        item = listItem();

        item.loose = true;

        insert(node, item, library);

        children.push(item);
    } else {
        item = list();
        node.depth--;

        insert(node, item, library);

        children.push(item);
    }
}

/**
 * Transform a list of heading objects to a markdown list.
 *
 * @param {Array.<Object>} map
 * @return {Object}
 */
function contents(map, library) {
    var minDepth = Infinity;
    var index = -1;
    var length = map.length;
    var table;

    /*
     * Fin minimum depth.
     */

    while (++index < length) {
        if (map[index].depth < minDepth) {
            minDepth = map[index].depth;
        }
    }

    /*
     * Normalize depth.
     */

    index = -1;

    while (++index < length) {
        map[index].depth -= minDepth - 1;
    }

    /*
     * Construct the main list.
     */

    table = list();

    /*
     * Add TOC to list.
     */

    index = -1;

    while (++index < length) {
        insert(map[index], table, library);
    }

    return table;
}

/**
 * Find a library.
 *
 * @param {string} pathlike
 * @return {Object}
 */
function loadLibrary(pathlike) {
    var cwd;
    var local;
    var npm;
    var plugin;

    if (pathlike === SLUGG && slugg) {
        return slugg;
    }

    cwd = proc.cwd && proc.cwd();

    /* istanbul ignore if */
    if (!cwd) {
        throw new Error('Cannot lazy load library when not in node');
    }

    local = resolve(cwd, pathlike);
    npm = resolve(cwd, MODULES, pathlike);

    if (exists(local) || exists(local + EXTENSION)) {
        plugin = local;
    } else if (exists(npm)) {
        plugin = npm;
    } else {
        plugin = pathlike;
    }

    return require(plugin);
}

/**
 * Wraps `slugg` to generate slugs just like npm would.
 *
 * @see https://github.com/npm/marky-markdown/blob/9761c95/lib/headings.js#L17
 *
 * @param {function(string): string} library
 * @return {function(string): string}
 */
function npmFactory(library) {
    /**
     * Generate slugs just like npm would.
     *
     * @param {string} value
     * @return {string}
     */
    function npm(value) {
        return library(value).replace(/[<>]/g, '').toLowerCase();
    }

    return npm;
}

/**
 * Wraps `slugg` to generate slugs just like GitHub would.
 *
 * @param {function(string): string} library
 * @return {function(string): string}
 */
function githubFactory(library) {
    /**
     * Hacky.  Sometimes `slugg` uses `replacement` as an
     * argument to `String#replace()`, and sometimes as
     * a literal string.
     *
     * @param {string} $0
     * @return {string}
     */
    function separator($0) {
        var match = $0.match(/\s/g);

        return repeat(DASH, match ? match.length : 0);
    }

    /**
     * @see seperator
     * @return {string}
     */
    function dash() {
        return DASH;
    }

    separator.toString = dash;

    /**
     * Generate slugs just like GitHub would.
     *
     * @param {string} value
     * @return {string}
     */
    function github(value) {
        return library(value, separator).toLowerCase();
    }

    return github;
}

/**
 * Attacher.
 *
 * @return {function(node)}
 */
function attacher(mdast, options) {
    var settings = options || {};
    var heading = toExpression(settings.heading || DEFAULT_HEADING);
    var library = settings.library || DEFAULT_LIBRARY;
    var isNPM = library === NPM;
    var isGitHub = library === GITHUB;

    if (isNPM || isGitHub) {
        library = SLUGG;
    }

    if (typeof library === 'string') {
        library = loadLibrary(library);
    }

    if (isNPM) {
        library = npmFactory(library);
    } else if (isGitHub) {
        library = githubFactory(library);
    }

    /**
     * Adds an example section based on a valid example
     * JavaScript document to a `Usage` section.
     *
     * @param {Node} node
     */
    function transformer(node) {
        var result = search(node, heading);

        if (result.index === null || !result.map.length) {
            return;
        }

        /*
         * Add markdown.
         */

        node.children = [].concat(
            node.children.slice(0, result.index),
            contents(result.map, library),
            node.children.slice(result.index)
        );
    }

    return transformer;
}

/*
 * Expose.
 */

module.exports = attacher;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"fs":undefined,"path":undefined,"repeat-string":2,"slugg":3}],2:[function(require,module,exports){
/*!
 * repeat-string <https://github.com/jonschlinkert/repeat-string>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

/**
 * Expose `repeat`
 */

module.exports = repeat;

/**
 * Repeat the given `string` the specified `number`
 * of times.
 *
 * **Example:**
 *
 * ```js
 * var repeat = require('repeat-string');
 * repeat('A', 5);
 * //=> AAAAA
 * ```
 *
 * @param {String} `string` The string to repeat
 * @param {Number} `number` The number of times to repeat the string
 * @return {String} Repeated string
 * @api public
 */

function repeat(str, num) {
  if (typeof str !== 'string') {
    throw new TypeError('repeat-string expects a string.');
  }

  if (num === 1) return str;
  if (num === 2) return str + str;

  var max = str.length * num;
  if (cache !== str || typeof cache === 'undefined') {
    cache = str;
    res = '';
  }

  while (max > res.length && num > 0) {
    if (num & 1) {
      res += str;
    }

    num >>= 1;
    if (!num) break;
    str += str;
  }

  return res.substr(0, max);
}

/**
 * Results cache
 */

var res = '';
var cache;

},{}],3:[function(require,module,exports){
(function (root) {

var defaultSeparator = '-'

function slugg(string, separator, toStrip) {

  // Separator is optional
  if (typeof separator === 'undefined') separator = defaultSeparator

  // Separator might be omitted and toStrip in its place
  if (separator instanceof RegExp) {
    toStrip = separator
    separator = defaultSeparator
  }

  // Only a separator was passed
  if (typeof toStrip === 'undefined') toStrip = new RegExp('')

  // Swap out non-english characters for their english equivalent
  for (var i = 0, len = string.length; i < len; i++) {
    if (chars[string.charAt(i)]) {
      string = string.replace(string.charAt(i), chars[string.charAt(i)])
    }
  }

  string = string
    // Make lower-case
    .toLowerCase()
    // Strip chars that shouldn't be replaced with separator
    .replace(toStrip, '')
    // Replace non-word characters with separator
    .replace(/[\W|_]+/g, separator)
    // Strip dashes from the beginning
    .replace(new RegExp('^' + separator + '+'), '')
    // Strip dashes from the end
    .replace(new RegExp(separator + '+$'), '')

  return string

}

// Conversion table. Modified version of:
// https://github.com/dodo/node-slug/blob/master/src/slug.coffee
var chars = slugg.chars = {
  // Latin
  'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Æ': 'AE',
  'Ç': 'C', 'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E', 'Ì': 'I', 'Í': 'I',
  'Î': 'I', 'Ï': 'I', 'Ð': 'D', 'Ñ': 'N', 'Ò': 'O', 'Ó': 'O', 'Ô': 'O',
  'Õ': 'O', 'Ö': 'O', 'Ő': 'O', 'Ø': 'O', 'Ù': 'U', 'Ú': 'U', 'Û': 'U',
  'Ü': 'U', 'Ű': 'U', 'Ý': 'Y', 'Þ': 'TH', 'ß': 'ss', 'à': 'a', 'á': 'a',
  'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae', 'ç': 'c', 'è': 'e',
  'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
  'ð': 'd', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
  'ő': 'o', 'ø': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ű': 'u',
  'ý': 'y', 'þ': 'th', 'ÿ': 'y', 'ẞ': 'SS', 'œ': 'oe', 'Œ': 'OE',
  // Greek
  'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'h',
  'θ': '8', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': '3',
  'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's', 'τ': 't', 'υ': 'y', 'φ': 'f',
  'χ': 'x', 'ψ': 'ps', 'ω': 'w', 'ά': 'a', 'έ': 'e', 'ί': 'i', 'ό': 'o',
  'ύ': 'y', 'ή': 'h', 'ώ': 'w', 'ς': 's', 'ϊ': 'i', 'ΰ': 'y', 'ϋ': 'y',
  'ΐ': 'i', 'Α': 'A', 'Β': 'B', 'Γ': 'G', 'Δ': 'D', 'Ε': 'E', 'Ζ': 'Z',
  'Η': 'H', 'Θ': '8', 'Ι': 'I', 'Κ': 'K', 'Λ': 'L', 'Μ': 'M', 'Ν': 'N',
  'Ξ': '3', 'Ο': 'O', 'Π': 'P', 'Ρ': 'R', 'Σ': 'S', 'Τ': 'T', 'Υ': 'Y',
  'Φ': 'F', 'Χ': 'X', 'Ψ': 'PS', 'Ω': 'W', 'Ά': 'A', 'Έ': 'E', 'Ί': 'I',
  'Ό': 'O', 'Ύ': 'Y', 'Ή': 'H', 'Ώ': 'W', 'Ϊ': 'I', 'Ϋ': 'Y',
  // Turkish
  'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G',
  // Russian
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': 'u',
  'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'А': 'A', 'Б': 'B',
  'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z',
  'И': 'I', 'Й': 'J', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O',
  'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'H',
  'Ц': 'C', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sh', 'Ъ': 'U', 'Ы': 'Y',
  'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
  // Ukranian
  'Є': 'Ye', 'І': 'I', 'Ї': 'Yi', 'Ґ': 'G',
  'є': 'ye', 'і': 'i', 'ї': 'yi', 'ґ': 'g',
  // Czech
  'č': 'c', 'ď': 'd', 'ě': 'e', 'ň': 'n', 'ř': 'r', 'š': 's',
  'ť': 't', 'ů': 'u', 'ž': 'z', 'Č': 'C', 'Ď': 'D', 'Ě': 'E',
  'Ň': 'N', 'Ř': 'R', 'Š': 'S', 'Ť': 'T', 'Ů': 'U', 'Ž': 'Z',
  // Polish
  'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ś': 's',
  'ź': 'z', 'ż': 'z', 'Ą': 'A', 'Ć': 'C', 'Ę': 'e', 'Ł': 'L',
  'Ń': 'N', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
  // Latvian
  'ā': 'a', 'ē': 'e', 'ģ': 'g', 'ī': 'i', 'ķ': 'k', 'ļ': 'l',
  'ņ': 'n', 'ū': 'u', 'Ā': 'A', 'Ē': 'E', 'Ģ': 'G', 'Ī': 'i',
  'Ķ': 'k', 'Ļ': 'L', 'Ņ': 'N', 'Ū': 'u'
}

// Be compatible with different module systems

if (typeof define !== 'undefined' && define.amd) {
  // AMD
  define([], function () {
    return slugg
  })
} else if (typeof module !== 'undefined' && module.exports) {
  // CommonJS
  module.exports = slugg
} else {
  // Script tag
  root.slugg = slugg
}

}(this))

},{}]},{},[1])(1)
});