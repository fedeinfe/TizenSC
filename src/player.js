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
