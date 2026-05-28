const CACHE = 'durak-alarmi-v1';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['/', '/index.html']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// Arka plan konum takibi
let trackingInterval = null;
let targetLat = null;
let targetLon = null;
let thresholdKm = null;
let alarmFired = false;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

self.addEventListener('message', e => {
  const { type, data } = e.data;

  if (type === 'START') {
    targetLat = data.lat;
    targetLon = data.lon;
    thresholdKm = data.threshold;
    alarmFired = false;

    if (trackingInterval) clearInterval(trackingInterval);

    trackingInterval = setInterval(() => {
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'GET_LOCATION' }));
      });
    }, 15000);
  }

  if (type === 'STOP') {
    if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }
    alarmFired = false;
  }

  if (type === 'LOCATION') {
    if (!targetLat || alarmFired) return;
    const dist = haversine(data.lat, data.lon, targetLat, targetLon);

    // Sayfaya mesafe gönder
    self.clients.matchAll().then(clients => {
      clients.forEach(c => c.postMessage({ type: 'DISTANCE', km: dist }));
    });

    if (dist <= thresholdKm) {
      alarmFired = true;
      if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }

      // Bildirim gönder
      self.registration.showNotification('🚨 DURAĞA YAKLAŞIYORSUN!', {
        body: `Hedefe ${dist < 1 ? Math.round(dist*1000)+'m' : dist.toFixed(1)+'km'} kaldı! İnmek için hazırlan!`,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [500, 200, 500, 200, 500],
        requireInteraction: true,
        tag: 'durak-alarm'
      });

      // Sayfaya da alarm gönder
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'ALARM', km: dist }));
      });
    }
  }
});
