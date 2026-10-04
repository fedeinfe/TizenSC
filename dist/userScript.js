/*
 * TizenSC - user script injected by TizenBrew into every page (and frame)
 * opened by the module. Written in plain ES5 so it runs on old Tizen
 * (Chromium 47+) without a build step.
 *
 * - Spatial navigation with the remote's arrow keys, OK = click
 * - Back = previous page / exit fullscreen / leave the player frame
 * - Media keys control the <video> (also inside the player iframe)
 * - Red = TizenSC menu, Green = reload, Yellow = back to top
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
    RED: 403, GREEN: 404, YELLOW: 405
  };
  var DIRS = {};
  DIRS[KEY.LEFT] = 'left';
  DIRS[KEY.UP] = 'up';
  DIRS[KEY.RIGHT] = 'right';
  DIRS[KEY.DOWN] = 'down';

  var SEEK_SECONDS = 10;
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
    style.textContent =
      '.' + FOCUS_CLASS + '{outline:4px solid #e50914 !important;outline-offset:2px !important;' +
      'box-shadow:0 0 0 7px rgba(229,9,20,.45) !important;}';
    parent.appendChild(style);
  }

  /* ---------- helpers ---------- */

  function viewport() {
    return {
      w: window.innerWidth || document.documentElement.clientWidth,
      h: window.innerHeight || document.documentElement.clientHeight
    };
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
    var margin = Math.min(120, vp.h * 0.12);
    if (r.top < margin) window.scrollBy(0, r.top - vp.h * 0.3);
    else if (r.bottom > vp.h - margin) window.scrollBy(0, Math.min(r.top - vp.h * 0.3, r.bottom - vp.h * 0.7));
    if (r.left < 0 || r.right > vp.w) {
      if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(false);
    }
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
          target.classList.remove(FOCUS_CLASS);
          try { target.focus(); target.contentWindow.focus(); } catch (err) {}
          post(target.contentWindow, { type: 'enter-frame' });
        } else if (target.tagName === 'VIDEO') {
          if (target.paused) target.play(); else target.pause();
        } else {
          target.click();
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
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyle);
  } else {
    injectStyle();
  }
})();
