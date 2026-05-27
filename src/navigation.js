// ── Spatial TV Navigation ─────────────────────────────────────────────────────

var FOCUS_CLASS = 'sc-focused';
var FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
var INITIAL_FOCUS_DELAY = 400;
var RESCAN_DEBOUNCE = 300;

function injectNavCSS() {
  var style = document.createElement('style');
  style.id = 'tizensc-nav';
  style.textContent = [
    '.' + FOCUS_CLASS + ' {',
    '  outline: 3px solid #e50000 !important;',
    '  outline-offset: 3px !important;',
    '  box-shadow: 0 0 0 6px rgba(229,0,0,0.25) !important;',
    '  border-radius: 3px !important;',
    '}',
    // Disable text selection on TV — remote doesn't have pointer precision
    'body { -webkit-user-select: none; user-select: none; }',
    // Smooth scrolling
    'html { scroll-behavior: smooth; }',
  ].join('\n');
  var target = document.head || document.documentElement;
  if (target) target.appendChild(style);
}

function isVisible(el) {
  var rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  // Must overlap the viewport (allow elements partially scrolled in)
  if (rect.right <= 0 || rect.bottom <= 0) return false;
  if (rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false;
  // Must not be hidden by a parent
  var style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return true;
}

function getFocusable() {
  var all = document.querySelectorAll(FOCUSABLE_SEL);
  var visible = [];
  for (var i = 0; i < all.length; i++) {
    if (isVisible(all[i])) visible.push(all[i]);
  }
  return visible;
}

function getCenter(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function currentFocused() {
  return document.querySelector('.' + FOCUS_CLASS) || null;
}

function applyFocus(el) {
  var prev = document.querySelector('.' + FOCUS_CLASS);
  if (prev) prev.classList.remove(FOCUS_CLASS);
  if (!el) return;
  el.classList.add(FOCUS_CLASS);
  try { el.focus({ preventScroll: false }); } catch (e) {}
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function firstFocus() {
  // Prefer the first visible link inside main content, skip nav/header links
  var candidates = getFocusable();
  if (!candidates.length) return;

  // Try to find first link NOT in a header/nav/footer
  var preferred = null;
  for (var i = 0; i < candidates.length; i++) {
    var el = candidates[i];
    if (!el.closest('header') && !el.closest('nav') && !el.closest('footer')) {
      preferred = el;
      break;
    }
  }
  applyFocus(preferred || candidates[0]);
}

function moveFocus(direction) {
  var current = currentFocused() || document.activeElement;
  var candidates = getFocusable();

  if (!current || !candidates.length) {
    applyFocus(candidates[0] || null);
    return;
  }

  var curRect = current.getBoundingClientRect();
  var curC    = getCenter(curRect);

  // Keep only candidates that are strictly in the requested direction
  var inDir = [];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] === current) continue;
    var r = candidates[i].getBoundingClientRect();
    var c = getCenter(r);
    var ok = false;
    switch (direction) {
      case 'ArrowRight': ok = c.x > curC.x + 5; break;
      case 'ArrowLeft':  ok = c.x < curC.x - 5; break;
      case 'ArrowDown':  ok = c.y > curC.y + 5; break;
      case 'ArrowUp':    ok = c.y < curC.y - 5; break;
    }
    if (ok) inDir.push(candidates[i]);
  }

  if (!inDir.length) return;

  // Score: primary-axis distance + 2× off-axis penalty
  var scored = inDir.map(function (el) {
    var r = el.getBoundingClientRect();
    var c = getCenter(r);
    var dx = Math.abs(c.x - curC.x);
    var dy = Math.abs(c.y - curC.y);
    var score = (direction === 'ArrowRight' || direction === 'ArrowLeft')
      ? dx + dy * 2
      : dy + dx * 2;
    return { el: el, score: score };
  });

  scored.sort(function (a, b) { return a.score - b.score; });
  applyFocus(scored[0].el);
}

function initNavigation() {
  injectNavCSS();

  // Initial auto-focus after content settles
  function scheduleFirstFocus(delay) {
    setTimeout(firstFocus, delay || INITIAL_FOCUS_DELAY);
  }

  if (document.readyState !== 'loading') {
    scheduleFirstFocus();
  } else {
    document.addEventListener('DOMContentLoaded', function () { scheduleFirstFocus(); });
  }

  // Re-focus after browser history navigation
  window.addEventListener('popstate', function () { scheduleFirstFocus(500); });

  // Detect SPA page changes via <title> mutation
  function watchTitle() {
    var title = document.querySelector('title');
    if (!title) return;
    var titleObserver = new MutationObserver(function () { scheduleFirstFocus(600); });
    titleObserver.observe(title, { childList: true, characterData: true });
  }

  if (document.readyState !== 'loading') {
    watchTitle();
  } else {
    document.addEventListener('DOMContentLoaded', watchTitle);
  }

  // Also detect URL changes for hash/pushState SPAs
  var lastHref = location.href;
  var urlPollDebounce = null;
  setInterval(function () {
    if (location.href !== lastHref) {
      lastHref = location.href;
      if (urlPollDebounce) clearTimeout(urlPollDebounce);
      urlPollDebounce = setTimeout(firstFocus, 700);
    }
  }, 500);

  // Central key handler (capture phase so it runs before the site's own handlers)
  document.addEventListener('keydown', function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    var inInput = tag === 'INPUT' || tag === 'TEXTAREA' ||
                  (document.activeElement && document.activeElement.isContentEditable);

    // Let player.js handle arrows when fullscreen video is active
    if (document.fullscreenElement) return;

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        if (inInput) return;
        e.preventDefault();
        e.stopPropagation();
        moveFocus(e.key);
        break;

      case 'Enter':
        if (inInput) return;
        var focused = currentFocused();
        if (focused) {
          e.preventDefault();
          e.stopPropagation();
          focused.click();
        }
        break;

      case 'Backspace':
      case 'GoBack':
        if (inInput) return;
        e.preventDefault();
        history.back();
        break;
    }
  }, true);
}

initNavigation();
