/*
 * TizenSC - user script injected by TizenBrew into every page (and frame)
 * opened by the module. Written in plain ES5 so it runs on old Tizen
 * (Chromium 47+) without a build step.
 *
 * - Spatial navigation with the remote's arrow keys: a highlight ring moves
 *   between links, buttons and anything clickable; OK = click
 * - Back = previous page / exit fullscreen / leave the player frame
 * - Media keys control the <video> (also inside the player iframe)
 * - Red = TizenSC menu, Green = reload, Yellow = back to top
 * - Page zoom for viewing from the sofa, Blue = change zoom level
 * - Blocks pop-ups and opens target="_blank" links in the same window
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
    '[role="menuitem"]', '[role="tab"]', '[role="option"]', '[role="checkbox"]',
    '[role="radio"]', '[role="switch"]', '[role="treeitem"]', '[onclick]',
    '[contenteditable="true"]', 'summary', 'label[for]', 'video', 'iframe'
  ].join(',');
  // Elements that only look clickable (cursor:pointer, click handler added by
  // JS) are found by scanning the page; cap the scan on huge pages.
  var MAX_SCAN = 8000;
  var POINTER_CACHE_MS = 1000;

  var isTop = (function () {
    try { return window.top === window; } catch (e) { return false; }
  })();

  var current = null;

  /* ---------- pop-ups ---------- */

  window.open = function () { return null; };

  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== document) {
      if (el.tagName === 'A') {
        if (el.target && el.target !== '_self') el.target = '_self';
        break;
      }
      el = el.parentNode;
    }
  }, true);

  /* ---------- style ---------- */

  function injectStyle() {
    if (document.getElementById('tsc-style')) return;
    var parent = document.head || document.documentElement;
    if (!parent) return;
    var style = document.createElement('style');
    style.id = 'tsc-style';
    // The highlight is a separate ring drawn above the page, so carousels and
    // cards with overflow:hidden cannot clip it. The site's own focus outline
    // is hidden to avoid a double frame.
    style.textContent =
      '.' + FOCUS_CLASS + '{outline:none !important;}' +
      '#tsc-ring{position:fixed !important;display:none;z-index:2147483646 !important;' +
      'pointer-events:none !important;box-sizing:border-box !important;margin:0 !important;' +
      'padding:0 !important;border:4px solid #e50914 !important;border-radius:8px !important;' +
      'background:transparent !important;transform:none !important;' +
      'box-shadow:0 0 0 2px rgba(0,0,0,.7),0 0 18px 4px rgba(229,9,20,.75),inset 0 0 0 2px rgba(0,0,0,.5) !important;}' +
      '#tsc-ring-probe{position:fixed !important;left:0 !important;top:0 !important;width:100px !important;' +
      'height:100px !important;visibility:hidden !important;pointer-events:none !important;' +
      'margin:0 !important;padding:0 !important;border:0 !important;transform:none !important;}';
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
    if (current) {
      setTimeout(function () {
        if (!current) return;
        ensureVisible(current);
        followRing();
      }, 50);
    }
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

  /* ---------- highlight ring ---------- */

  var ring = null;
  var probe = null;
  var ringBox = '';
  var followUntil = 0;
  var followQueued = false;

  // The ring goes inside the fullscreen element when there is one (anything
  // else is hidden by the browser), otherwise at the end of <body>.
  function ringParent() {
    var fs = fullscreenElement();
    if (fs) return /^(VIDEO|IFRAME)$/.test(fs.tagName) ? null : fs;
    return document.body || document.documentElement;
  }

  function hideRing() {
    if (ring) ring.style.display = 'none';
    ringBox = '';
  }

  function updateRing(animate) {
    var el = current;
    var parent = ringParent();
    if (!el || !parent || !el.classList || !el.classList.contains(FOCUS_CLASS) ||
        !document.documentElement.contains(el) || (parent !== document.body && !parent.contains(el)) ||
        !isVisible(el)) {
      hideRing();
      return;
    }
    injectStyle();
    if (!ring) {
      ring = document.createElement('div');
      ring.id = 'tsc-ring';
      probe = document.createElement('div');
      probe.id = 'tsc-ring-probe';
    }
    if (ring.parentNode !== parent) {
      parent.appendChild(probe);
      parent.appendChild(ring);
    }
    // Measure how the page zoom maps CSS pixels to getBoundingClientRect()
    // units (it differs between Chromium versions) with a 100px probe, so the
    // ring lands exactly on the element at any zoom level.
    var p = probe.getBoundingClientRect();
    var k = p.width / 100 || 1;
    var r = el.getBoundingClientRect();
    var vp = viewport();
    var gap = 3 * k;
    var left = Math.max(r.left - gap, 0);
    var top = Math.max(r.top - gap, 0);
    var right = Math.min(r.right + gap, vp.w);
    var bottom = Math.min(r.bottom + gap, vp.h);
    if (right - left < 4 || bottom - top < 4) {
      hideRing();
      return;
    }
    var box = [
      Math.round((left - p.left) / k), Math.round((top - p.top) / k),
      Math.round((right - left) / k), Math.round((bottom - top) / k)
    ];
    var key = box.join(',');
    if (key === ringBox && ring.style.display === 'block') return;
    ring.style.transition = animate && ringBox ?
      'left .12s ease-out,top .12s ease-out,width .12s ease-out,height .12s ease-out' : 'none';
    ringBox = key;
    ring.style.left = box[0] + 'px';
    ring.style.top = box[1] + 'px';
    ring.style.width = box[2] + 'px';
    ring.style.height = box[3] + 'px';
    ring.style.display = 'block';
  }

  // Keep the ring on its element for a moment after a move: smooth scrolling,
  // carousel animations and lazy-loaded images shift things around.
  function followRing(ms) {
    followUntil = Math.max(followUntil, Date.now() + (ms || 800));
    if (followQueued) return;
    followQueued = true;
    requestAnimationFrame(function step() {
      updateRing(false);
      if (Date.now() < followUntil) {
        requestAnimationFrame(step);
      } else {
        followQueued = false;
      }
    });
  }

  window.addEventListener('scroll', function () { if (current) followRing(150); }, true);
  window.addEventListener('resize', function () { if (current) followRing(300); });
  setInterval(function () { if (current) updateRing(false); }, 500);

  /* ---------- focus ---------- */

  function setCurrent(el, domFocus) {
    if (current && current.classList) current.classList.remove(FOCUS_CLASS);
    current = el;
    if (!el) {
      hideRing();
      return;
    }
    injectStyle();
    el.classList.add(FOCUS_CLASS);
    if (domFocus !== false) {
      if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|IFRAME)$/.test(el.tagName)) {
        el.setAttribute('tabindex', '-1');
      }
      // The iframe itself is only highlighted; OK enters it.
      if (el.tagName !== 'IFRAME') {
        // We scroll ourselves (ensureVisible): a plain focus() would also
        // scroll overflow:hidden sliders and break their layout.
        try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
      } else if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
    }
    ensureVisible(el);
    updateRing(true);
    followRing();
  }

  function clearHighlight() {
    if (current && current.classList) current.classList.remove(FOCUS_CLASS);
    hideRing();
  }

  function isScroller(overflow) {
    return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
  }

  // Bring the element into view inside scrollable containers (horizontal
  // rows of covers, side lists...), then in the page.
  function scrollContainers(el) {
    for (var a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      var cs = window.getComputedStyle(a);
      var sx = isScroller(cs.overflowX) && a.scrollWidth > a.clientWidth;
      var sy = isScroller(cs.overflowY) && a.scrollHeight > a.clientHeight;
      if (!sx && !sy) continue;
      var r = el.getBoundingClientRect();
      var ar = a.getBoundingClientRect();
      // rect units per CSS pixel of this container (depends on the zoom)
      var k = a.offsetWidth ? ar.width / a.offsetWidth : 1;
      if (!k) k = 1;
      var pad = Math.min(40 * k, ar.width / 10);
      if (sx && (r.left < ar.left + pad || r.right > ar.right - pad)) {
        a.scrollLeft += (r.left + r.width / 2 - (ar.left + ar.width / 2)) / k;
      }
      pad = Math.min(40 * k, ar.height / 10);
      if (sy && (r.top < ar.top + pad || r.bottom > ar.bottom - pad)) {
        a.scrollTop += (r.top + r.height / 2 - (ar.top + ar.height / 2)) / k;
      }
    }
  }

  function ensureVisible(el) {
    scrollContainers(el);
    var r = el.getBoundingClientRect();
    var vp = viewport();
    var margin = Math.min(vp.h * 0.12, Math.max(0, (vp.h - r.height) / 2));
    if (r.top >= margin && r.bottom <= vp.h - margin) return;
    // scrollIntoView also scrolls overflow:hidden boxes (sliders that move
    // with transforms), which shifts them out of place: put those back.
    var clipped = [];
    for (var a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      if (a.scrollLeft || a.scrollTop || a.scrollWidth > a.clientWidth || a.scrollHeight > a.clientHeight) {
        var cs = window.getComputedStyle(a);
        if (!isScroller(cs.overflowX) || !isScroller(cs.overflowY)) clipped.push([a, a.scrollLeft, a.scrollTop]);
      }
    }
    // Let the browser do the maths: it knows how the zoom affects scrolling.
    var done = false;
    if (el.scrollIntoViewIfNeeded) {
      el.scrollIntoViewIfNeeded(true);
      r = el.getBoundingClientRect();
      done = r.top >= margin && r.bottom <= vp.h - margin;
    }
    if (!done) {
      try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { el.scrollIntoView(false); }
    }
    for (var i = 0; i < clipped.length; i++) {
      var c = clipped[i];
      var ccs = window.getComputedStyle(c[0]);
      if (!isScroller(ccs.overflowX)) c[0].scrollLeft = c[1];
      if (!isScroller(ccs.overflowY)) c[0].scrollTop = c[2];
    }
  }

  /* ---------- what can be selected ---------- */

  var scanGen = 0;
  var pointerCache = { time: 0, list: [] };

  function ownElement(el) {
    return el === ring || el === probe || el.id === 'tsc-toast';
  }

  function cursorOf(el) {
    if (el.__tscCursorGen !== scanGen) {
      el.__tscCursorGen = scanGen;
      el.__tscCursor = window.getComputedStyle(el).cursor;
    }
    return el.__tscCursor;
  }

  // Divs, cards and icons that the site made clickable with JavaScript: they
  // show a hand cursor. Only the outermost element of each is kept (the
  // cursor is inherited), and not when it already holds a real link/button.
  function pointerElements() {
    var now = Date.now();
    if (now - pointerCache.time < POINTER_CACHE_MS) return pointerCache.list;
    var out = [];
    var body = document.body;
    if (body) {
      var all = body.getElementsByTagName('*');
      var n = Math.min(all.length, MAX_SCAN);
      for (var i = 0; i < n; i++) {
        var el = all[i];
        if (cursorOf(el) !== 'pointer' || ownElement(el)) continue;
        var parent = el.parentElement;
        if (parent && parent !== body && cursorOf(parent) === 'pointer') continue;
        if (el.matches && el.matches(SELECTOR)) continue;
        if (el.closest && el.closest(SELECTOR)) continue;
        if (el.querySelector(SELECTOR)) continue;
        out.push(el);
      }
    }
    pointerCache = { time: now, list: out };
    return out;
  }

  function overflowOf(a) {
    if (a.__tscOverflowGen !== scanGen) {
      var cs = window.getComputedStyle(a);
      a.__tscOverflowGen = scanGen;
      a.__tscOverflowX = cs.overflowX;
      a.__tscOverflowY = cs.overflowY;
    }
  }

  // False for elements the user could never see: slides parked outside a
  // slider, items of a collapsed menu, drawers moved off-screen.
  function isReachable(el, r, vp) {
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var scrollX = false;
    var scrollY = false;
    for (var a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      overflowOf(a);
      var ox = a.__tscOverflowX;
      var oy = a.__tscOverflowY;
      if (ox === 'visible' && oy === 'visible') continue;
      var ar = null;
      if (isScroller(ox)) scrollX = true;
      else if (ox !== 'visible' && !scrollX) {
        ar = a.getBoundingClientRect();
        if (cx < ar.left || cx > ar.right) return false;
      }
      if (isScroller(oy)) scrollY = true;
      else if (oy !== 'visible' && !scrollY) {
        ar = ar || a.getBoundingClientRect();
        if (cy < ar.top || cy > ar.bottom) return false;
      }
    }
    if (!scrollX && (r.right <= 0 || r.left >= vp.w)) return false;
    return true;
  }

  // An open modal dialog keeps the selection inside it.
  function modalRoot() {
    var list = document.querySelectorAll('dialog[open],[aria-modal="true"]');
    for (var i = list.length - 1; i >= 0; i--) {
      if (isVisible(list[i])) return list[i];
    }
    return null;
  }

  function candidates() {
    scanGen++;
    var root = modalRoot();
    var all = (root || document).querySelectorAll(SELECTOR);
    var extra = pointerElements();
    var vp = viewport();
    var maxArea = vp.w * vp.h * 0.6;
    var out = [];
    var lists = [all, extra];
    for (var l = 0; l < lists.length; l++) {
      var list = lists[l];
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (root && !root.contains(el)) continue;
        var r = el.getBoundingClientRect();
        // Only look around the visible area to keep it fast on the TV.
        if (r.bottom < -vp.h * 1.5 || r.top > vp.h * 2.5) continue;
        if (l === 1 && r.width * r.height > maxArea) continue;
        if (!isVisible(el) || !isReachable(el, r, vp)) continue;
        out.push(el);
      }
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
      if (r.bottom < 0 || r.top > vp.h || r.right < 0 || r.left > vp.w) continue;
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
        if (dir === 'right' && !(cx > ccx + 1)) continue;
        if (dir === 'left' && !(cx < ccx - 1)) continue;
        primary = dir === 'right' ? r.left - cr.right : cr.left - r.right;
        ortho = Math.max(0, Math.max(r.top, cr.top) - Math.min(r.bottom, cr.bottom));
        orthoCenter = Math.abs(cy - ccy);
        // Left/right stay on the same row: at the end of a row nothing
        // happens instead of jumping to some far away element.
        if (ortho > 0 && orthoCenter > Math.max(cr.height, r.height)) continue;
      } else {
        if (dir === 'down' && !(cy > ccy + 1)) continue;
        if (dir === 'up' && !(cy < ccy - 1)) continue;
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
    clearHighlight();
    post(window.parent, { type: 'leave-frame', dir: dir });
  }

  function scrollFor(dir) {
    var vp = viewport();
    if (dir === 'down') window.scrollBy(0, vp.h * 0.5);
    else if (dir === 'up') window.scrollBy(0, -vp.h * 0.5);
  }

  // click() does not exist on SVG icons: dispatch the event by hand there.
  function activate(el) {
    if (typeof el.click === 'function') {
      el.click();
      return;
    }
    var ev;
    try {
      ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
    } catch (e) {
      ev = document.createEvent('MouseEvents');
      ev.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
    }
    el.dispatchEvent(ev);
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
        if (video.paused) video.play(); else video.pause();
        break;
      case KEY.PLAY:
        video.play();
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
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + SEEK_SECONDS);
        break;
      case KEY.RW:
      case KEY.LEFT:
        video.currentTime = Math.max(0, video.currentTime - SEEK_SECONDS);
        break;
    }
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

    // Fullscreen player: left/right seek, OK play/pause, up/down reach the controls.
    if (videoIsFullscreen() && (code === KEY.LEFT || code === KEY.RIGHT || code === KEY.ENTER)) {
      e.preventDefault();
      e.stopPropagation();
      handleMedia(code);
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
          if (!target && !typing && findVideo()) {
            e.preventDefault();
            handleMedia(KEY.ENTER);
          }
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (target.tagName === 'IFRAME') {
          clearHighlight();
          try { target.focus(); target.contentWindow.focus(); } catch (err) {}
          post(target.contentWindow, { type: 'enter-frame' });
        } else if (target.tagName === 'VIDEO') {
          if (target.paused) target.play(); else target.pause();
        } else {
          activate(target);
        }
        return;
      }

      case KEY.BACK:
      case KEY.ESC:
        e.preventDefault();
        e.stopPropagation();
        if (fullscreenElement()) {
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
      if (current && document.documentElement.contains(current)) {
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
      updateRing(true);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyle);
  } else {
    injectStyle();
  }
})();
