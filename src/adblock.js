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
