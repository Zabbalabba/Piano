// Offline support: try the network first so updates arrive, fall back to the cache.
const CACHE = 'piano-v18';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'vendor/vexflow.js',
  'js/app.js', 'js/audio.js', 'js/content.js', 'js/detect.js', 'js/fingering.js', 'js/input.js', 'js/music.js',
  'js/planner.js', 'js/player.js', 'js/quiz.js', 'js/sheet.js',
  ...[33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96].map((m) => `piano/${m}.mp3`),
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const fresh = (req) => (req.mode === 'navigate'
  ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })
  : new Request(req, { cache: 'no-cache' }));

// The page asks which version it is running.
self.addEventListener('message', (e) => {
  if (e.data === 'version' && e.source) e.source.postMessage({ version: CACHE.replace('piano-', '') });
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // Always check with the server for a newer file (instead of reusing the phone's copy for up to
    // ten minutes), so a new version shows up the next time the app is opened.
    fetch(fresh(e.request))
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
