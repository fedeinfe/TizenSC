/*
 * TizenSC - user script injected by TizenBrew into every page (and frame)
 * opened by the module. Written in plain ES5 so it runs on old Tizen
 * (Chromium 47+) without a build step.
 *
 * - Spatial navigation with the remote's arrow keys, OK = click
 * - Back = previous page / exit fullscreen / leave the player frame
 * - Media keys control the <video> (also inside the player iframe)
 * - Player mode: left/right seek, OK pause, up/down reach the player's
 *   buttons, with an on-screen bar showing time and progress
 * - Red = TizenSC menu, Green = reload, Yellow = back to top
 * - Page zoom for viewing from the sofa, Blue = change zoom level
 * - Ad block: pop-ups, pop-unders, redirects to ad sites, ad scripts/frames,
 *   banners and invisible click-catching overlays (can be turned off in the menu)
 * - Opens target="_blank" links of the site in the same window
 */
(function () {
  'use strict';

  if (window.__tizenscLoaded) return;
  window.__tizenscLoaded = true;

  var LAUNCHER = 'http://127.0.0.1:8081/module/gh%2Ffedeinfe%2FTizenSC/launcher/index.html';

  // The launcher page has its own key handling.
  if (location.hostname === '127.0.0.1' && location.port === '8081') return;
  if (!/^https?:$/.test(location.protocol)) return;

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, ESC: 27,
    PLAY_PAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406
  };
  var DIRS = {};
  DIRS[KEY.LEFT] = 'left';
  DIRS[KEY.UP] = 'up';
  DIRS[KEY.RIGHT] = 'right';
  DIRS[KEY.DOWN] = 'down';

  var SEEK_SECONDS = 10;
  var ZOOM_LEVELS = [1, 1.25, 1.5, 1.75, 2];
  var DEFAULT_ZOOM = 1.5;
  var ZOOM_STORAGE = 'tizensc.zoom';
  var FOCUS_CLASS = 'tsc-focus';
  var SELECTOR = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
    '[tabindex]:not([tabindex="-1"])', '[role="button"]', '[role="link"]',
    '[role="menuitem"]', '[role="tab"]', '[role="option"]', '[onclick]',
    'summary', 'video', 'iframe'
  ].join(',');

  var isTop = (function () {
    try { return window.top === window; } catch (e) { return false; }
  })();

  var current = null;
  // Element the user is clicking with OK right now (our own synthetic click).
  var userClickTarget = null;

  /* ---------- ad block ---------- */

  // Known ad / pop-under networks (matched against the end of the hostname).
  var AD_DOMAINS = [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
    'googletagservices.com', 'amazon-adsystem.com', 'adnxs.com', 'criteo.com', 'criteo.net',
    'taboola.com', 'outbrain.com', 'mgid.com', 'revcontent.com', 'adskeeper.com', 'adskeeper.co.uk',
    'popads.net', 'popcash.net', 'propellerads.com', 'propellerclick.com', 'onclickads.net',
    'onclkds.com', 'onclickalgo.com', 'onclickperformance.com', 'adsterra.com', 'adsterratools.com',
    'highperformanceformat.com', 'highperformancecpm.com', 'profitabledisplaynetwork.com',
    'effectivegatecpm.com', 'effectiveratecpm.com', 'exoclick.com', 'exosrv.com', 'exdynsrv.com',
    'realsrv.com', 'juicyads.com', 'hilltopads.net', 'hilltopads.com', 'adcash.com', 'monetag.com',
    'clickadu.com', 'clickadilla.com', 'trafficjunky.net', 'trafficjunky.com', 'trafficstars.com',
    'tsyndicate.com', 'a-ads.com', 'ad-maven.com', 'admaven.com', 'galaksion.com', 'zeropark.com',
    'clickaine.com', 'adspyglass.com', 'popmyads.com', 'poprev.net', 'richpush.co', 'pushame.com',
    'evadav.com', 'yllix.com', 'bidvertiser.com', 'clicksor.com', 'infolinks.com', 'betteradsystem.com',
    'dolohen.com', 'pemsrv.com', 'wpadmngr.com', 'inpagepush.com', 'adf.ly', 'shorte.st', 'ouo.io',
    'linkvertise.com', 'bongacams.com', 'chaturbate.com', 'stripchat.com', 'livejasmin.com'
  ];
  var AD_WORDS = /(^|[.\-])(pop(ads|cash|under|up|my)|adsterra|propeller|onclick|clickadu|monetag|exoclick|exosrv|juicyads|hilltop|adcash|adserv|adsystem|adnetwork|syndication|trafficjunky|trafficstars)/;
  var STATE_NAME_PREFIX = 'tizensc:';
  var STATE_SESSION_KEY = 'tizensc.state';
  var LAUNCHER_HOST = '127.0.0.1';
  var INTENT_MS = 30000;

  var urlParser = document.createElement('a');

  function hostOf(url) {
    if (!url) return '';
    try {
      urlParser.href = url;
      return /^https?:$/.test(urlParser.protocol) ? urlParser.hostname.toLowerCase() : '';
    } catch (e) { return ''; }
  }

  function baseDomain(h) {
    h = (h || '').toLowerCase().replace(/^www\./, '');
    if (/^\d+(\.\d+){3}$/.test(h)) return h;
    var p = h.split('.');
    if (p.length <= 2) return h;
    if (/^(co|com|net|org|gov|edu|ac)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2) {
      return p.slice(-3).join('.');
    }
    return p.slice(-2).join('.');
  }

  // "streaming-community.ninja" and "streamingcommunity.xyz" are the same site
  // under a new domain: compare the name without punctuation.
  function siteName(h) {
    return baseDomain(h).split('.')[0].replace(/[^a-z0-9]/g, '');
  }

  function related(h, t) {
    if (!h || !t) return false;
    if (h === t || baseDomain(h) === baseDomain(t)) return true;
    var n = siteName(h);
    return n.length >= 6 && n === siteName(t);
  }

  function isAdHost(h) {
    if (!h) return false;
    for (var i = 0; i < AD_DOMAINS.length; i++) {
      var d = AD_DOMAINS[i];
      if (h === d || h.slice(-d.length - 1) === '.' + d) return true;
    }
    return AD_WORDS.test(h);
  }

  function isAdUrl(url) {
    return isAdHost(hostOf(url));
  }

  // State shared between the pages of one session. window.name survives
  // navigations to other domains, so the guard on an ad page knows which site
  // we came from; sessionStorage is a fallback on the site's own origin.
  function readState() {
    var s = null;
    try {
      if (window.name && window.name.indexOf(STATE_NAME_PREFIX) === 0) {
        s = JSON.parse(window.name.slice(STATE_NAME_PREFIX.length));
      }
    } catch (e) {}
    if (!s) {
      try { s = JSON.parse(sessionStorage.getItem(STATE_SESSION_KEY)); } catch (e) {}
    }
    if (!s || typeof s !== 'object') s = {};
    if (!(s.hosts instanceof Array)) s.hosts = [];
    return s;
  }

  function writeState(s, toSession) {
    var str = JSON.stringify(s);
    try { window.name = STATE_NAME_PREFIX + str; } catch (e) {}
    if (toSession) {
      try { sessionStorage.setItem(STATE_SESSION_KEY, str); } catch (e) {}
    }
  }

  var state = isTop ? readState() : { hosts: [] };
  var adblock = state.ab !== false;
  var blockedCount = 0;

  function isTrusted(h) {
    if (!h) return true;
    if (h === LAUNCHER_HOST) return true;
    if (!isTop) return related(h, location.hostname);
    for (var i = 0; i < state.hosts.length; i++) {
      if (related(h, state.hosts[i])) return true;
    }
    return !!(state.allow && related(h, state.allow) && Date.now() - (state.allowT || 0) < INTENT_MS);
  }

  function trust(h) {
    if (!h) return;
    for (var i = 0; i < state.hosts.length; i++) {
      if (related(h, state.hosts[i])) return;
    }
    state.hosts.unshift(h);
    state.hosts = state.hosts.slice(0, 10);
  }

  function noteBlocked(what) {
    blockedCount++;
    var text = what + (blockedCount > 1 ? ' (' + blockedCount + ' bloccati)' : '');
    if (document.body) toast(text);
    else document.addEventListener('DOMContentLoaded', function () { toast(text); });
  }

  // The user pressed OK on a link to another site: let that navigation through.
  function noteIntent(el) {
    var a = closestLink(el);
    if (!a || !isTop) return;
    var h = hostOf(a.href);
    if (!h || isAdHost(h) || isTrusted(h)) return;
    state.allow = h;
    state.allowT = Date.now();
    writeState(state, true);
  }

  function closestLink(el) {
    while (el && el.nodeType === 1) {
      if (el.tagName === 'A' && el.href) return el;
      el = el.parentNode;
    }
    return null;
  }

  function opensNewWindow(target) {
    return !!target && !/^_(self|top|parent)$/i.test(target);
  }

  function isUserLink(a) {
    var t = userClickTarget;
    return !!t && (a === t || a.contains(t) || t.contains(a));
  }

  // A link that should not be followed: ad network, new window to another
  // site, or a detached link clicked by a script to another site.
  function isBadLink(a) {
    var h = hostOf(a.href);
    if (!h) return false;
    if (isAdHost(h)) return true;
    if (isUserLink(a)) return false;
    if (isTrusted(h)) return false;
    return opensNewWindow(a.target) || !document.documentElement.contains(a);
  }

  // --- 1. landing guard: a top page on a foreign domain we did not ask for ---

  if (isTop) {
    var here = location.hostname.toLowerCase();
    var ref = document.referrer || '';
    var fromLauncher = ref.indexOf(LAUNCHER) === 0 || hostOf(ref) === LAUNCHER_HOST;
    // No state at all (first page, or the browser cleared window.name): infer the
    // site from the referrer, or trust this page.
    if (!state.hosts.length && !fromLauncher && hostOf(ref) && hostOf(ref) !== here) {
      state.hosts.push(hostOf(ref));
    }
    if (fromLauncher || !state.hosts.length || isTrusted(here)) {
      trust(here);
      state.allow = null;
    } else if (adblock) {
      state.blocked = (state.blocked || 0) + 1;
      writeState(state, false);
      try { window.stop(); } catch (e) {}
      if (history.length > 1) history.back();
      var fallback = state.last || LAUNCHER + '?menu=1';
      setTimeout(function () { location.replace(fallback); }, 1500);
      return;
    }
    writeState(state, true);

    window.addEventListener('pagehide', function () {
      state.last = location.href;
      writeState(state, true);
    });

    var showBlocked = function () {
      var s = readState();
      if (!s.blocked) return;
      blockedCount += s.blocked - 1;
      state.blocked = 0;
      writeState(state, true);
      noteBlocked('Pubblicità bloccata');
    };
    showBlocked();
    window.addEventListener('pageshow', function (e) { if (e.persisted) showBlocked(); });
  }

  // --- 2. pop-ups: window.open never opens anything (no tabs on the TV) ---

  function fakeWindow() {
    var noop = function () {};
    var w = {
      closed: false, opener: null, name: '',
      location: { href: '', assign: noop, replace: noop, reload: noop },
      document: { write: noop, writeln: noop, open: noop, close: noop, body: null },
      focus: noop, blur: noop, postMessage: noop, moveTo: noop, resizeTo: noop,
      addEventListener: noop, removeEventListener: noop
    };
    w.close = function () { w.closed = true; };
    w.window = w.self = w;
    return w;
  }

  function blockedOpen(url) {
    if (!adblock) return null;
    noteBlocked('Pop-up bloccato');
    // Pop-under scripts that see null fall back to redirecting the page: pretend it worked.
    return fakeWindow();
  }

  function guardWindow(w) {
    try {
      if (!w || w.open === blockedOpen) return;
      try {
        Object.defineProperty(w, 'open', { value: blockedOpen, writable: false, configurable: false });
      } catch (e) {
        w.open = blockedOpen;
      }
    } catch (e) {}
  }

  guardWindow(window);

  // Pop-up scripts grab a clean window.open from a fresh about:blank iframe.
  var frameWindowGetter = null;
  (function () {
    var proto = window.HTMLIFrameElement && HTMLIFrameElement.prototype;
    if (!proto) return;
    ['contentWindow', 'contentDocument'].forEach(function (prop) {
      var desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.get) return;
      if (prop === 'contentWindow') frameWindowGetter = desc.get;
      try {
        Object.defineProperty(proto, prop, {
          configurable: true,
          enumerable: desc.enumerable,
          get: function () {
            var v = desc.get.call(this);
            guardWindow(prop === 'contentWindow' ? v : v && v.defaultView);
            return v;
          }
        });
      } catch (e) {}
    });
  })();

  if (adblock && window.Notification && Notification.requestPermission) {
    try {
      Notification.requestPermission = function (cb) {
        if (typeof cb === 'function') cb('denied');
        return window.Promise ? Promise.resolve('denied') : undefined;
      };
    } catch (e) {}
  }

  // --- 3. links and clicks ---

  window.addEventListener('click', function (e) {
    var a = closestLink(e.target);
    if (!a) return;
    if (adblock && isBadLink(a)) {
      e.preventDefault();
      noteBlocked('Pop-up bloccato');
      return;
    }
    if (opensNewWindow(a.target)) a.target = '_self';
  }, true);

  window.addEventListener('submit', function (e) {
    var f = e.target;
    if (adblock && f && opensNewWindow(f.target) && !isTrusted(hostOf(f.action))) {
      e.preventDefault();
      noteBlocked('Pop-up bloccato');
    } else if (f && opensNewWindow(f.target)) {
      f.target = '_self';
    }
  }, true);

  if (adblock) {
    // Scripts clicking links that are not in the page (or not visible to us).
    var nativeClick = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function () {
      if (this.tagName === 'A' && isBadLink(this)) {
        noteBlocked('Pop-up bloccato');
        return;
      }
      return nativeClick.apply(this, arguments);
    };
    var nativeDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (ev) {
      if (ev && ev.type === 'click' && this.tagName === 'A' && isBadLink(this)) {
        noteBlocked('Pop-up bloccato');
        return false;
      }
      return nativeDispatch.apply(this, arguments);
    };
    var nativeSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      if (opensNewWindow(this.target) && !isTrusted(hostOf(this.action))) {
        noteBlocked('Pop-up bloccato');
        return;
      }
      return nativeSubmit.apply(this, arguments);
    };
  }

  // --- 4. redirects: cancel navigations to other sites (Chromium 102+) ---

  if (adblock && isTop && window.navigation && navigation.addEventListener) {
    navigation.addEventListener('navigate', function (e) {
      var h = hostOf(e.destination && e.destination.url);
      if (!h || isTrusted(h) || !e.cancelable) return;
      e.preventDefault();
      noteBlocked('Pubblicità bloccata');
    });
  }

  // --- 5. ad scripts, frames and requests ---

  function isAdElement(node) {
    if (!node || node.nodeType !== 1) return false;
    var tag = node.tagName;
    return (tag === 'SCRIPT' || tag === 'IFRAME' || tag === 'IMG' || tag === 'EMBED' || tag === 'OBJECT') &&
      isAdUrl(node.src || node.data || '');
  }

  function guardFrames(node) {
    if (!frameWindowGetter || !node || node.nodeType !== 1) return;
    var frames = node.tagName === 'IFRAME' ? [node] : node.getElementsByTagName ? node.getElementsByTagName('iframe') : [];
    for (var i = 0; i < frames.length; i++) {
      try { guardWindow(frameWindowGetter.call(frames[i])); } catch (e) {}
    }
  }

  if (adblock) {
    var wrapInsert = function (proto, name, nodeArg) {
      var native = proto && proto[name];
      if (!native) return;
      proto[name] = function () {
        var node = arguments[nodeArg];
        if (isAdElement(node)) return node;
        var result = native.apply(this, arguments);
        guardFrames(node);
        return result;
      };
    };
    wrapInsert(Node.prototype, 'appendChild', 0);
    wrapInsert(Node.prototype, 'insertBefore', 0);
    wrapInsert(Node.prototype, 'replaceChild', 0);

    var nativeFetch = window.fetch;
    if (nativeFetch) {
      window.fetch = function (input) {
        var url = input && typeof input === 'object' ? input.url : input;
        if (isAdUrl(url)) return Promise.reject(new TypeError('Failed to fetch'));
        return nativeFetch.apply(this, arguments);
      };
    }
    var nativeXhrOpen = XMLHttpRequest.prototype.open;
    var nativeXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__tscBlocked = isAdUrl(url);
      return nativeXhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__tscBlocked) return;
      return nativeXhrSend.apply(this, arguments);
    };
  }

  // --- 6. banners and invisible overlays that catch clicks ---

  var AD_CSS =
    'ins.adsbygoogle,[id^="div-gpt-ad"],[id^="google_ads_"],[id*="popunder"],[class*="popunder"],' +
    '[data-tsc-ad]{display:none !important;}';

  function isTransparent(cs) {
    var bg = cs.backgroundColor;
    return (!bg || bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg)) && cs.backgroundImage === 'none';
  }

  var PLAYER_NAME = /player|video|jw|vjs|plyr|media|stream/i;

  // Things an ad layer never contains: the player (or the frame holding it).
  function hasPlayerContent(el) {
    if (el.querySelector('video,audio,canvas,embed,object')) return true;
    var frames = el.tagName === 'IFRAME' ? [el] : el.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (!isAdUrl(frames[i].src)) return true;
    }
    return false;
  }

  // Full-screen layers added on top of the page by ad scripts: invisible
  // click-catchers, or layers whose only content is a link to another site.
  // A player container is empty and transparent too until the player starts,
  // so names that look like a player are left alone (and see restoreOverlays).
  function isOverlay(el) {
    if (!el || el.nodeType !== 1 || /^tsc-/.test(el.id || '')) return false;
    if (/^(SCRIPT|STYLE|LINK|META|VIDEO|AUDIO|CANVAS|HEAD|BODY)$/.test(el.tagName)) return false;
    if (PLAYER_NAME.test(el.id || '') || PLAYER_NAME.test(typeof el.className === 'string' ? el.className : '')) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || (cs.position !== 'fixed' && cs.position !== 'absolute')) return false;
    if (!(parseInt(cs.zIndex, 10) >= 1000)) return false;
    var r = el.getBoundingClientRect();
    var vp = viewport();
    if (r.width * r.height < vp.w * vp.h * 0.5) return false;
    if (hasPlayerContent(el)) return false;
    if (el.getElementsByTagName('*').length > 5) return false;
    var text = (el.innerText || '').replace(/\s+/g, '');
    if (!text && (parseFloat(cs.opacity) < 0.2 || isTransparent(cs))) return true;
    var link = el.tagName === 'A' ? el : null;
    if (!link) {
      var links = el.getElementsByTagName('a');
      if (links.length === 1 && text.length < 3) link = links[0];
    }
    return !!link && !isTrusted(hostOf(link.href));
  }

  function hideAd(el, overlay) {
    el.setAttribute('data-tsc-ad', overlay ? 'overlay' : '');
    el.style.setProperty('display', 'none', 'important');
    if (current && el.contains(current)) setCurrent(null);
  }

  // A layer we hid that later fills up with a player was not an ad: show it again.
  function restoreOverlays() {
    var hidden = document.querySelectorAll('[data-tsc-ad="overlay"]');
    for (var i = 0; i < hidden.length; i++) {
      var el = hidden[i];
      if (hasPlayerContent(el) || el.getElementsByTagName('*').length > 5) {
        el.removeAttribute('data-tsc-ad');
        el.style.removeProperty('display');
      }
    }
  }

  function sweep() {
    restoreOverlays();
    var roots = [document.documentElement, document.body];
    for (var i = 0; i < roots.length; i++) {
      var kids = roots[i] ? roots[i].children : [];
      for (var j = 0; j < kids.length; j++) {
        if (!kids[j].hasAttribute('data-tsc-ad') && isOverlay(kids[j])) hideAd(kids[j], true);
      }
    }
    var ads = document.querySelectorAll('iframe,embed,object');
    for (var k = 0; k < ads.length; k++) {
      if (!ads[k].hasAttribute('data-tsc-ad') && isAdElement(ads[k])) hideAd(ads[k]);
    }
  }

  var sweepTimer = null;
  function scheduleSweep() {
    if (sweepTimer) return;
    sweepTimer = setTimeout(function () {
      sweepTimer = null;
      if (document.body) sweep();
    }, 300);
  }

  if (adblock) {
    try {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) guardFrames(added[j]);
        }
        scheduleSweep();
      }).observe(document, { childList: true, subtree: true });
    } catch (e) {}
    document.addEventListener('DOMContentLoaded', scheduleSweep);
    window.addEventListener('load', scheduleSweep);
  }

  /* ---------- style ---------- */

  function injectStyle() {
    if (document.getElementById('tsc-style')) return;
    var parent = document.head || document.documentElement;
    if (!parent) return;
    var style = document.createElement('style');
    style.id = 'tsc-style';
    style.textContent =
      '.' + FOCUS_CLASS + '{outline:4px solid #e50914 !important;outline-offset:2px !important;' +
      'box-shadow:0 0 0 7px rgba(229,9,20,.45) !important;}' + (adblock ? AD_CSS : '');
    parent.appendChild(style);
  }

  /* ---------- zoom ---------- */

  function getZoom() {
    var z = null;
    try { z = parseFloat(localStorage.getItem(ZOOM_STORAGE)); } catch (e) {}
    return ZOOM_LEVELS.indexOf(z) === -1 ? DEFAULT_ZOOM : z;
  }

  function applyZoom(z) {
    var root = document.documentElement;
    if (!root) return;
    var style = document.getElementById('tsc-zoom');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tsc-zoom';
      (document.head || root).appendChild(style);
    }
    // No zoom while something is fullscreen, so the player fills the screen exactly.
    style.textContent = z === 1 ? '' : 'html:not([data-tsc-fs]){zoom:' + z + ' !important;}';
  }

  function cycleZoom() {
    var idx = ZOOM_LEVELS.indexOf(getZoom());
    var z = ZOOM_LEVELS[(idx + 1) % ZOOM_LEVELS.length];
    try { localStorage.setItem(ZOOM_STORAGE, String(z)); } catch (e) {}
    applyZoom(z);
    toast('Zoom ' + Math.round(z * 100) + '%');
    if (current) setTimeout(function () { if (current) ensureVisible(current); }, 50);
  }

  var toastTimer = null;
  function toast(text) {
    var el = document.getElementById('tsc-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tsc-toast';
      el.style.cssText = 'position:fixed;top:40px;right:40px;z-index:2147483647;padding:14px 26px;' +
        'background:rgba(0,0,0,.85);color:#fff;font:bold 28px Arial,sans-serif;border-radius:10px;' +
        'border:3px solid #e50914;pointer-events:none;';
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = 'none'; }, 1500);
  }

  function onFullscreenChange() {
    if (fullscreenElement()) document.documentElement.setAttribute('data-tsc-fs', '');
    else document.documentElement.removeAttribute('data-tsc-fs');
  }

  // The script can run before <html>/<head> exist: (re)apply the zoom as soon
  // as they appear, and keep our <style> in place if the page replaces <head>.
  function ensureZoom() {
    var style = document.getElementById('tsc-zoom');
    if (style && document.head && style.parentNode !== document.head) {
      document.head.appendChild(style);
    }
    if (!style || !document.documentElement.contains(style)) applyZoom(getZoom());
  }

  if (isTop) {
    if (document.documentElement) applyZoom(getZoom());
    try {
      var zoomObserver = new MutationObserver(function () {
        if (!document.documentElement) return;
        ensureZoom();
        if (document.body) zoomObserver.disconnect();
      });
      zoomObserver.observe(document, { childList: true, subtree: true });
    } catch (e) {}
    document.addEventListener('DOMContentLoaded', ensureZoom);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  }

  /* ---------- helpers ---------- */

  // Visible area in the same units getBoundingClientRect() uses. With CSS zoom
  // on <html> older Chromium reports rects in unzoomed pixels, newer in zoomed ones.
  function viewport() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    var rw = document.documentElement.getBoundingClientRect().width;
    var k = rw && w ? rw / w : 1;
    if (k < 0.3 || k > 1.05) k = 1;
    return { w: w * k, h: h * k };
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return false;
    var cs = window.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
    if (el.disabled) return false;
    return true;
  }

  function isTextField(el) {
    if (!el) return false;
    var tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    if (tag !== 'INPUT') return false;
    var t = (el.type || 'text').toLowerCase();
    return ['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'range', 'color', 'file'].indexOf(t) === -1;
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || null;
  }

  function exitFullscreen() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.webkitCancelFullScreen) document.webkitCancelFullScreen();
  }

  function findVideo() {
    var videos = document.getElementsByTagName('video');
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < videos.length; i++) {
      var r = videos[i].getBoundingClientRect();
      var area = r.width * r.height;
      if (area > bestArea || (!best && videos[i].currentSrc)) {
        best = videos[i];
        bestArea = area;
      }
    }
    return best;
  }

  function forEachFrame(fn) {
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      try { fn(frames[i].contentWindow, frames[i]); } catch (e) {}
    }
  }

  function post(win, data) {
    try { win.postMessage({ tizensc: data }, '*'); } catch (e) {}
  }

  /* ---------- focus ---------- */

  function setCurrent(el, domFocus) {
    if (current && current.classList) current.classList.remove(FOCUS_CLASS);
    current = el;
    if (!el) return;
    injectStyle();
    el.classList.add(FOCUS_CLASS);
    if (domFocus !== false) {
      if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|IFRAME)$/.test(el.tagName)) {
        el.setAttribute('tabindex', '-1');
      }
      // The iframe itself is only highlighted; OK enters it.
      if (el.tagName !== 'IFRAME') {
        try { el.focus(); } catch (e) {}
      } else if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }
    ensureVisible(el);
  }

  function ensureVisible(el) {
    var r = el.getBoundingClientRect();
    var vp = viewport();
    var margin = vp.h * 0.12;
    var outside = r.top < margin || r.bottom > vp.h - margin || r.left < 0 || r.right > vp.w;
    if (!outside) return;
    // Let the browser do the maths: it knows how the zoom affects scrolling.
    if (el.scrollIntoViewIfNeeded) {
      el.scrollIntoViewIfNeeded(true);
      r = el.getBoundingClientRect();
      if (r.top >= margin && r.bottom <= vp.h - margin) return;
    }
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { el.scrollIntoView(false); }
  }

  function candidates() {
    var all = document.querySelectorAll(SELECTOR);
    var vp = viewport();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      // Only look around the visible area to keep it fast on the TV.
      if (r.bottom < -vp.h * 1.5 || r.top > vp.h * 2.5) continue;
      if (!isVisible(el)) continue;
      if (adblock && el.tagName === 'A' && isBadLink(el)) continue;
      out.push(el);
    }
    return out;
  }

  function firstInViewport() {
    var list = candidates();
    var vp = viewport();
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.bottom < 0 || r.top > vp.h) continue;
      var score = Math.max(0, r.top) * 3 + Math.max(0, r.left);
      if (score < bestScore) {
        bestScore = score;
        best = list[i];
      }
    }
    return best;
  }

  function findNext(from, dir) {
    var cr = from.getBoundingClientRect();
    var ccx = cr.left + cr.width / 2;
    var ccy = cr.top + cr.height / 2;
    var list = candidates();
    var best = null;
    var bestScore = Infinity;

    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === from || el.contains(from) || from.contains(el)) continue;
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var primary, ortho, orthoCenter;

      if (dir === 'right' || dir === 'left') {
        if (dir === 'right' && !(cx > ccx + 1 && r.right > cr.right)) continue;
        if (dir === 'left' && !(cx < ccx - 1 && r.left < cr.left)) continue;
        primary = dir === 'right' ? r.left - cr.right : cr.left - r.right;
        ortho = Math.max(0, Math.max(r.top, cr.top) - Math.min(r.bottom, cr.bottom));
        orthoCenter = Math.abs(cy - ccy);
      } else {
        if (dir === 'down' && !(cy > ccy + 1 && r.bottom > cr.bottom)) continue;
        if (dir === 'up' && !(cy < ccy - 1 && r.top < cr.top)) continue;
        primary = dir === 'down' ? r.top - cr.bottom : cr.top - r.bottom;
        ortho = Math.max(0, Math.max(r.left, cr.left) - Math.min(r.right, cr.right));
        orthoCenter = Math.abs(cx - ccx);
      }

      var score = Math.max(0, primary) + ortho * 4 + orthoCenter * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function navigate(dir) {
    if (!current || !document.documentElement.contains(current) || !isVisible(current)) {
      var first = firstInViewport();
      if (first) setCurrent(first);
      else scrollFor(dir);
      return;
    }
    // After scrolling through empty space the selection may be off-screen:
    // continue from what is visible instead.
    var cr = current.getBoundingClientRect();
    var vp = viewport();
    if (cr.bottom < 0 || cr.top > vp.h) {
      var visible = firstInViewport();
      if (visible) {
        setCurrent(visible);
        return;
      }
    }
    var next = findNext(current, dir);
    if (next) {
      setCurrent(next);
    } else if (!isTop) {
      // Nothing more inside the player frame: hand control back to the page.
      leaveFrame(dir);
    } else {
      scrollFor(dir);
    }
  }

  function leaveFrame(dir) {
    if (current && current.classList) current.classList.remove(FOCUS_CLASS);
    post(window.parent, { type: 'leave-frame', dir: dir });
  }

  function scrollFor(dir) {
    var vp = viewport();
    if (dir === 'down') window.scrollBy(0, vp.h * 0.5);
    else if (dir === 'up') window.scrollBy(0, -vp.h * 0.5);
  }

  function frameElementFor(win) {
    var found = null;
    forEachFrame(function (w, frame) { if (w === win) found = frame; });
    return found;
  }

  /* ---------- media ---------- */

  function handleMedia(code) {
    var video = findVideo();
    if (!video) {
      forEachFrame(function (w) { post(w, { type: 'media', code: code }); });
      return;
    }
    switch (code) {
      case KEY.PLAY_PAUSE:
      case KEY.ENTER:
        if (video.paused) play(video); else video.pause();
        break;
      case KEY.PLAY:
        play(video);
        break;
      case KEY.PAUSE:
        video.pause();
        break;
      case KEY.STOP:
        video.pause();
        if (fullscreenElement()) exitFullscreen();
        break;
      case KEY.FF:
      case KEY.RIGHT:
        seek(video, 1);
        return;
      case KEY.RW:
      case KEY.LEFT:
        seek(video, -1);
        return;
    }
    showOsd(video);
  }

  function play(video) {
    try {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  // Holding the key scrubs faster; the jump happens when the key is released
  // for a moment, so the stream is not asked to seek at every step.
  var seekTarget = null;
  var seekTimer = null;
  var seekStreak = 0;
  var seekLast = 0;
  function seek(video, dir) {
    var now = Date.now();
    seekStreak = now - seekLast < 700 ? seekStreak + 1 : 0;
    seekLast = now;
    var step = seekStreak >= 12 ? 60 : seekStreak >= 4 ? 30 : SEEK_SECONDS;
    var base = seekTarget === null ? video.currentTime : seekTarget;
    var max = isFinite(video.duration) ? Math.max(0, video.duration - 1) : Infinity;
    seekTarget = Math.max(0, Math.min(max, base + dir * step));
    clearTimeout(seekTimer);
    seekTimer = setTimeout(function () {
      try { video.currentTime = seekTarget; } catch (e) {}
      seekTarget = null;
      updateOsd(video);
    }, 600);
    showOsd(video);
  }

  /* ---------- on-screen player bar ---------- */

  var osdHideTimer = null;
  var osdTick = null;

  function fmtTime(t) {
    if (!isFinite(t) || t < 0) t = 0;
    t = Math.floor(t);
    var h = Math.floor(t / 3600);
    var m = Math.floor(t % 3600 / 60);
    var sec = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function osdElement() {
    var el = document.getElementById('tsc-osd');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'tsc-osd';
    el.style.cssText = 'position:fixed;left:5%;right:5%;bottom:6%;z-index:2147483647;display:none;' +
      'box-sizing:border-box;padding:18px 28px;background:rgba(0,0,0,.82);color:#fff;' +
      'font:bold 30px Arial,sans-serif;border-radius:12px;border:3px solid #e50914;pointer-events:none;';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;';
    var state = document.createElement('span');
    state.id = 'tsc-osd-state';
    var time = document.createElement('span');
    time.id = 'tsc-osd-time';
    time.style.cssText = 'margin-left:auto;';
    row.appendChild(state);
    row.appendChild(time);
    var track = document.createElement('div');
    track.style.cssText = 'height:10px;margin-top:14px;background:rgba(255,255,255,.3);border-radius:5px;overflow:hidden;';
    var bar = document.createElement('div');
    bar.id = 'tsc-osd-bar';
    bar.style.cssText = 'height:100%;width:0;background:#e50914;';
    track.appendChild(bar);
    var hint = document.createElement('div');
    hint.style.cssText = 'margin-top:12px;font:20px Arial,sans-serif;color:#bbb;';
    hint.textContent = '\u25C0 \u25B6 indietro/avanti \u00B7 OK pausa \u00B7 \u25B2 \u25BC comandi del player \u00B7 Indietro esci';
    el.appendChild(row);
    el.appendChild(track);
    el.appendChild(hint);
    return el;
  }

  function updateOsd(video) {
    var el = document.getElementById('tsc-osd');
    if (!el || el.style.display === 'none') return;
    var t = seekTarget === null ? video.currentTime : seekTarget;
    var d = video.duration;
    var label = video.paused ? '\u275A\u275A  Pausa' : '\u25B6  In riproduzione';
    if (seekTarget !== null) label = (seekTarget >= video.currentTime ? '\u25B6\u25B6  ' : '\u25C0\u25C0  ') + fmtTime(seekTarget);
    document.getElementById('tsc-osd-state').textContent = label;
    document.getElementById('tsc-osd-time').textContent = fmtTime(t) + (isFinite(d) ? ' / ' + fmtTime(d) : '');
    document.getElementById('tsc-osd-bar').style.width = (isFinite(d) && d > 0 ? Math.min(100, t / d * 100) : 0) + '%';
  }

  function hideOsd() {
    var el = document.getElementById('tsc-osd');
    if (el) el.style.display = 'none';
    clearInterval(osdTick);
    osdTick = null;
  }

  // Stays up while paused or scrubbing, otherwise disappears after a few seconds.
  function showOsd(video) {
    if (!video) return;
    var el = osdElement();
    var fs = fullscreenElement();
    // Outside the fullscreen element nothing is drawn.
    var parent = fs && fs.tagName !== 'VIDEO' ? fs : document.body || document.documentElement;
    if (el.parentNode !== parent) parent.appendChild(el);
    el.style.display = 'block';
    updateOsd(video);
    if (!osdTick) osdTick = setInterval(function () { updateOsd(video); }, 500);
    clearTimeout(osdHideTimer);
    var arm = function () {
      osdHideTimer = setTimeout(function () {
        if (video.paused || seekTarget !== null) arm(); else hideOsd();
      }, 4000);
    };
    arm();
  }

  function isMediaKey(code) {
    return code === KEY.PLAY_PAUSE || code === KEY.PLAY || code === KEY.PAUSE ||
      code === KEY.STOP || code === KEY.FF || code === KEY.RW;
  }

  function videoIsFullscreen() {
    var fs = fullscreenElement();
    if (!fs) return false;
    return fs.tagName === 'VIDEO' || !!fs.querySelector('video');
  }

  // The video that is the point of this page (or player frame).
  function mainVideo() {
    var v = findVideo();
    if (!v) return null;
    if (videoIsFullscreen()) return v;
    var r = v.getBoundingClientRect();
    var vp = viewport();
    return r.width * r.height >= vp.w * vp.h * 0.3 ? v : null;
  }

  // A player button selected with up/down: arrows move between buttons again.
  function inPlayerControls() {
    return !!current && current.tagName !== 'VIDEO' && document.documentElement.contains(current) && isVisible(current);
  }

  function bigFrame() {
    var frames = document.getElementsByTagName('iframe');
    var vp = viewport();
    for (var i = 0; i < frames.length; i++) {
      var r = frames[i].getBoundingClientRect();
      if (isVisible(frames[i]) && !isAdUrl(frames[i].src) && r.width * r.height >= vp.w * vp.h * 0.5) return frames[i];
    }
    return null;
  }

  function enterFrame(frame) {
    frame.classList.remove(FOCUS_CLASS);
    try { frame.focus(); frame.contentWindow.focus(); } catch (err) {}
    post(frame.contentWindow, { type: 'enter-frame' });
  }

  // The player's buttons are drawn over the video: down picks the bottom bar
  // (from the left), up the buttons at the top.
  function controlOver(video, dir) {
    if (dir !== 'up' && dir !== 'down') return null;
    var vr = video.getBoundingClientRect();
    var list = candidates();
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === video || el.contains(video) || el.tagName === 'IFRAME') continue;
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      if (cx < vr.left || cx > vr.right || cy < vr.top || cy > vr.bottom) continue;
      var score = (dir === 'down' ? vr.bottom - r.bottom : r.top - vr.top) * 3 + (r.left - vr.left);
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  // Player mode: left/right seek, OK play/pause, up/down reach the player's own buttons.
  function handlePlayerKey(code, video) {
    if (code === KEY.LEFT || code === KEY.RIGHT || code === KEY.ENTER) {
      handleMedia(code);
      return;
    }
    var next = controlOver(video, DIRS[code]) || findNext(video, DIRS[code]);
    if (next && next !== video) {
      setCurrent(next);
      showOsd(video);
    } else if (!isTop) {
      leaveFrame(DIRS[code]);
    } else {
      scrollFor(DIRS[code]);
    }
  }

  /* ---------- keys ---------- */

  function onKeyDown(e) {
    var code = e.keyCode;
    var active = document.activeElement;
    var typing = isTextField(active);

    if (isMediaKey(code)) {
      e.preventDefault();
      handleMedia(code);
      return;
    }

    var video = (DIRS[code] || code === KEY.ENTER) && !typing && !inPlayerControls() ? mainVideo() : null;
    if (video) {
      e.preventDefault();
      e.stopPropagation();
      handlePlayerKey(code, video);
      return;
    }

    if (DIRS[code]) {
      // Let the cursor move inside text fields.
      if (typing && (code === KEY.LEFT || code === KEY.RIGHT)) return;
      e.preventDefault();
      e.stopPropagation();
      if (typing && active.blur) active.blur();
      navigate(DIRS[code]);
      return;
    }

    switch (code) {
      case KEY.ENTER: {
        var target = current && document.documentElement.contains(current) ? current : null;
        if (!target || typing || isTextField(target)) {
          if (!target && !typing) {
            // Nothing selected on a page that is just the player: go into it.
            var frame = bigFrame();
            if (frame) {
              e.preventDefault();
              enterFrame(frame);
            } else if (findVideo()) {
              e.preventDefault();
              handleMedia(KEY.ENTER);
            }
          }
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (target.tagName === 'IFRAME') {
          enterFrame(target);
        } else if (target.tagName === 'VIDEO') {
          handleMedia(KEY.ENTER);
        } else {
          noteIntent(target);
          userClickTarget = target;
          try { target.click(); } finally { userClickTarget = null; }
        }
        return;
      }

      case KEY.BACK:
      case KEY.ESC:
        e.preventDefault();
        e.stopPropagation();
        if (inPlayerControls() && mainVideo()) {
          // Back from the player's buttons to the video.
          var v = mainVideo();
          setCurrent(null);
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
          showOsd(v);
        } else if (fullscreenElement()) {
          exitFullscreen();
        } else if (typing && active.blur) {
          active.blur();
        } else if (!isTop) {
          leaveFrame();
        } else {
          history.back();
        }
        return;

      case KEY.RED:
        if (!isTop) return post(window.top, { type: 'key', code: code });
        e.preventDefault();
        location.href = LAUNCHER + '?menu=1';
        return;

      case KEY.GREEN:
        if (!isTop) return post(window.top, { type: 'key', code: code });
        e.preventDefault();
        location.reload();
        return;

      case KEY.BLUE:
        if (!isTop) return post(window.top, { type: 'key', code: code });
        e.preventDefault();
        cycleZoom();
        return;

      case KEY.YELLOW:
        if (!isTop) return post(window.top, { type: 'key', code: code });
        e.preventDefault();
        window.scrollTo(0, 0);
        setCurrent(null);
        setTimeout(function () {
          var first = firstInViewport();
          if (first) setCurrent(first);
        }, 100);
        return;
    }
  }

  window.addEventListener('keydown', onKeyDown, true);

  /* ---------- messages between page and player frames ---------- */

  window.addEventListener('message', function (e) {
    var msg = e.data && e.data.tizensc;
    if (!msg) return;

    if (msg.type === 'media') {
      handleMedia(msg.code);
    } else if (msg.type === 'enter-frame') {
      window.focus();
      var video = mainVideo();
      var inner = video ? null : bigFrame();
      if (video) {
        setCurrent(null);
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        showOsd(video);
      } else if (inner) {
        enterFrame(inner);
      } else if (current && document.documentElement.contains(current)) {
        setCurrent(current);
      } else {
        var first = firstInViewport();
        if (first) setCurrent(first);
      }
    } else if (msg.type === 'leave-frame') {
      var frame = frameElementFor(e.source);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      window.focus();
      if (frame) {
        setCurrent(frame, false);
        if (msg.dir) navigate(msg.dir);
      }
    } else if (msg.type === 'key' && isTop) {
      onKeyDown({ keyCode: msg.code, preventDefault: function () {}, stopPropagation: function () {} });
    }
  });

  /* ---------- keep the highlight in sync with mouse / native focus ---------- */

  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (el && el !== document.body && el !== current && el.matches && el.matches(SELECTOR)) {
      if (current && current.classList) current.classList.remove(FOCUS_CLASS);
      current = el;
      injectStyle();
      el.classList.add(FOCUS_CLASS);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyle);
  } else {
    injectStyle();
  }
})();
