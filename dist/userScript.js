(function () {
'use strict';

// ── Ad Blocker ────────────────────────────────────────────────────────────────

var AD_SELECTORS = [
  // Google / programmatic ad units
  'ins.adsbygoogle',
  '[data-ad-slot]',
  '[data-ad-unit-id]',
  '[data-google-query-id]',
  // Ad-network iframes
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googletagservices.com"]',
  'iframe[src*="adnxs.com"]',
  'iframe[src*="pubmatic.com"]',
  'iframe[src*="openx.net"]',
  'iframe[src*="rubiconproject.com"]',
  'iframe[src*="33across.com"]',
  'iframe[src*="taboola.com"]',
  'iframe[src*="outbrain.com"]',
  'iframe[src*="exoclick.com"]',
  'iframe[src*="trafficjunky.net"]',
  'iframe[src*="popads.net"]',
  'iframe[src*="popcash.net"]',
  'iframe[src*="ero-advertising.com"]',
  'iframe[src*="plugrush.com"]',
  'iframe[src*="hilltopads.net"]',
  'iframe[src*="propellerads.com"]',
  'iframe[src*="adcash.com"]',
  'iframe[src*="clickadu.com"]',
  'iframe[src*="adsterra.com"]',
  'iframe[src*="juicyads.com"]',
  'iframe[src*="tsyndicate.com"]',
  // Native content widgets
  'div[id^="taboola-"]',
  'div[id^="outbrain-"]',
  'div[class*="OUTBRAIN"]',
  // Standard fixed-size ad containers
  '.pub_300x250',
  '.pub_300x600',
  '.pub_728x90',
  '.pub_160x600',
  '.pub_970x250',
  // Cookie / GDPR banners
  '#qc-cmp2-container',
  '#onetrust-banner-sdk',
  '#onetrust-consent-sdk',
  '.optanon-alert-box-wrapper',
  '#sp-cc',
  '.evidon-banner',
  '[class*="cookie-banner"]',
  '[class*="cookie-consent"]',
  '[id*="cookie-consent"]',
  '[class*="gdpr-banner"]',
  '[id*="gdpr-banner"]',
  // Popunder anchor trick (invisible full-page link)
  'a[style*="position:fixed"][style*="z-index"]',
  'a[style*="position: fixed"][style*="z-index"]',
];

var AD_SCRIPT_DOMAINS = [
  'googlesyndication.com',
  'doubleclick.net',
  'adnxs.com',
  'exoclick.com',
  'trafficjunky.net',
  'popads.net',
  'popcash.net',
  'ero-advertising.com',
  'plugrush.com',
  'hilltopads.net',
  'propellerads.com',
  'adcash.com',
  'clickadu.com',
  'adsterra.com',
  'juicyads.com',
  'tsyndicate.com',
  'taboola.com',
  'outbrain.com',
];

var ALLOWED_POPUP_HOSTS = ['streaming-community.you', 'vixcloud.co', 'maxstream.video'];

function isAdScriptSrc(src) {
  if (!src) return false;
  try {
    var hostname = new URL(src, location.href).hostname;
    for (var i = 0; i < AD_SCRIPT_DOMAINS.length; i++) {
      if (hostname.indexOf(AD_SCRIPT_DOMAINS[i]) !== -1) return true;
    }
  } catch (e) {}
  return false;
}

function isAllowedPopup(url) {
  if (!url) return false;
  try {
    var hostname = new URL(url, location.href).hostname;
    for (var i = 0; i < ALLOWED_POPUP_HOSTS.length; i++) {
      if (hostname.indexOf(ALLOWED_POPUP_HOSTS[i]) !== -1) return true;
    }
    if (hostname === location.hostname) return true;
  } catch (e) {}
  return false;
}

// Inject CSS to hide ad elements before DOM is parsed
function injectAdBlockCSS() {
  var style = document.createElement('style');
  style.id = 'tizensc-adblock';
  style.textContent =
    AD_SELECTORS.join(',\n') +
    ' { display: none !important; visibility: hidden !important; pointer-events: none !important; }' +
    '\nbody.modal-open, body.overflow-hidden { overflow: auto !important; }' +
    '\n[style*="z-index: 9999"]:not(video):not(#tizensc-focus-ring) { display: none !important; }';
  var target = document.head || document.documentElement;
  if (target) target.appendChild(style);
}

// Remove matching DOM nodes
function cleanAds() {
  for (var i = 0; i < AD_SELECTORS.length; i++) {
    try {
      var nodes = document.querySelectorAll(AD_SELECTORS[i]);
      for (var j = 0; j < nodes.length; j++) {
        nodes[j].parentNode && nodes[j].parentNode.removeChild(nodes[j]);
      }
    } catch (e) {}
  }
}

// Override document.createElement to block ad scripts at creation time
function patchCreateElement() {
  var orig = document.createElement.bind(document);
  document.createElement = function (tag) {
    var el = orig(tag);
    if (typeof tag === 'string' && tag.toLowerCase() === 'script') {
      var _src = '';
      try {
        Object.defineProperty(el, 'src', {
          get: function () { return _src; },
          set: function (v) {
            if (isAdScriptSrc(v)) {
              // Silently discard – the element will do nothing
              return;
            }
            _src = v;
            el.setAttribute('src', v);
          },
          configurable: true,
        });
      } catch (e) {}
    }
    return el;
  };
}

// Block popup windows and silent JS dialogs
function patchWindowAPIs() {
  var origOpen = window.open;
  window.open = function (url) {
    if (isAllowedPopup(url)) return origOpen.apply(this, arguments);
    return null;
  };
  window.alert   = function () {};
  window.confirm = function () { return true; };
  window.prompt  = function (m, d) { return d !== undefined ? d : null; };
}

// Watch DOM for dynamically inserted ad nodes
function observeAds() {
  var debounce = null;
  var observer = new MutationObserver(function () {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(cleanAds, 200);
  });

  function startObserving() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      cleanAds();
    } else {
      setTimeout(startObserving, 100);
    }
  }

  startObserving();
}

// ── Init ──────────────────────────────────────────────────────────────────────
patchCreateElement();
patchWindowAPIs();
injectAdBlockCSS();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    cleanAds();
    observeAds();
  });
} else {
  cleanAds();
  observeAds();
}

window.addEventListener('load', cleanAds);


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


// ── Video Player Controls ─────────────────────────────────────────────────────

var SEEK_FORWARD_SEC  = 30;
var SEEK_REWIND_SEC   = 10;

// Register Tizen media remote keys
function registerTizenKeys() {
  try {
    var api = window.tizen && window.tizen.tvinputdevice;
    if (!api) return;
    var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'];
    for (var i = 0; i < keys.length; i++) {
      try { api.registerKey(keys[i]); } catch (e) {}
    }
  } catch (e) {}
}

// Find the active video element, including same-origin iframes
function findVideo() {
  var v = document.querySelector('video');
  if (v) return v;

  var iframes = document.querySelectorAll('iframe');
  for (var i = 0; i < iframes.length; i++) {
    try {
      var doc = iframes[i].contentDocument;
      if (doc) {
        v = doc.querySelector('video');
        if (v) return v;
      }
    } catch (e) {}
  }
  return null;
}

function safeSeek(video, delta) {
  if (!video) return;
  var next = video.currentTime + delta;
  if (next < 0) next = 0;
  if (video.duration && next > video.duration) next = video.duration;
  video.currentTime = next;
}

// Show a brief OSD overlay (play/pause icon) so the user gets visual feedback
function showOSD(text) {
  var osd = document.getElementById('tizensc-osd');
  if (!osd) {
    osd = document.createElement('div');
    osd.id = 'tizensc-osd';
    Object.assign(osd.style, {
      position:   'fixed',
      bottom:     '80px',
      right:      '60px',
      background: 'rgba(0,0,0,0.72)',
      color:      '#fff',
      fontSize:   '2.4rem',
      fontFamily: 'sans-serif',
      padding:    '14px 28px',
      borderRadius: '8px',
      zIndex:     '2147483647',
      pointerEvents: 'none',
      transition: 'opacity 0.3s',
    });
    document.body && document.body.appendChild(osd);
  }
  osd.textContent = text;
  osd.style.opacity = '1';
  clearTimeout(osd._timer);
  osd._timer = setTimeout(function () { osd.style.opacity = '0'; }, 1200);
}

function handleMediaKey(key) {
  var video = findVideo();

  switch (key) {
    case 'MediaPlayPause':
      if (!video) return;
      if (video.paused) { video.play(); showOSD('▶'); }
      else              { video.pause(); showOSD('⏸'); }
      break;

    case 'MediaPlay':
      if (video) { video.play(); showOSD('▶'); }
      break;

    case 'MediaPause':
      if (video) { video.pause(); showOSD('⏸'); }
      break;

    case 'MediaStop':
      if (!video) return;
      video.pause();
      video.currentTime = 0;
      showOSD('⏹');
      break;

    case 'MediaFastForward':
      safeSeek(video, SEEK_FORWARD_SEC);
      showOSD('+' + SEEK_FORWARD_SEC + 's ⏭');
      break;

    case 'MediaRewind':
      safeSeek(video, -SEEK_REWIND_SEC);
      showOSD('-' + SEEK_REWIND_SEC + 's ⏮');
      break;
  }
}

function initPlayer() {
  registerTizenKeys();

  document.addEventListener('keydown', function (e) {
    var inFullscreen = !!document.fullscreenElement;
    var tag = document.activeElement && document.activeElement.tagName;
    var inInput = tag === 'INPUT' || tag === 'TEXTAREA';

    switch (e.key) {
      // Tizen remote media keys
      case 'MediaPlayPause':
      case 'MediaPlay':
      case 'MediaPause':
      case 'MediaStop':
      case 'MediaFastForward':
      case 'MediaRewind':
        e.preventDefault();
        e.stopPropagation();
        handleMediaKey(e.key);
        break;

      // Space = toggle play/pause (only when a video is playing and not in a text field)
      case ' ':
        if (inInput) break;
        var vid = findVideo();
        if (vid) {
          e.preventDefault();
          e.stopPropagation();
          if (vid.paused) { vid.play(); showOSD('▶'); }
          else            { vid.pause(); showOSD('⏸'); }
        }
        break;

      // Arrow seek — only active when fullscreen (navigation.js owns arrows otherwise)
      case 'ArrowRight':
        if (!inFullscreen) break;
        e.preventDefault();
        e.stopPropagation();
        safeSeek(findVideo(), SEEK_FORWARD_SEC);
        showOSD('+' + SEEK_FORWARD_SEC + 's ⏭');
        break;

      case 'ArrowLeft':
        if (!inFullscreen) break;
        e.preventDefault();
        e.stopPropagation();
        safeSeek(findVideo(), -SEEK_REWIND_SEC);
        showOSD('-' + SEEK_REWIND_SEC + 's ⏮');
        break;
    }
  }, true);
}

initPlayer();

})();
