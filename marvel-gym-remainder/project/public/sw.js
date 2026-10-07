/* Production builds replace these defaults with the Vite entry hash and emitted assets. */
const BUILD_VERSION = 'dev-build';
const CACHE_NAME = `mfc-app-${BUILD_VERSION}`;
const PRECACHE_URLS = ['/'];
const FIREBASE_CONFIG = null;
const IS_DEV_BUILD = BUILD_VERSION === 'dev-build';
// Badge state lives outside versioned asset caches so it survives app updates.
const BADGE_STATE_CACHE = 'mfc-notification-state-v1';
const BADGE_COUNT_KEY = '/__mfc_unread_notification_count__';

// Firebase web configuration is injected into production builds. Background
// display is handled by the push event below so it remains tied to
// event.waitUntil even when the app has no open window.

async function readBadgeCount() {
  const cache = await caches.open(BADGE_STATE_CACHE);
  const response = await cache.match(BADGE_COUNT_KEY);
  return Math.max(0, Number(await response?.text()) || 0);
}

async function writeBadgeCount(count) {
  const normalizedCount = Math.max(0, Math.floor(count));
  const cache = await caches.open(BADGE_STATE_CACHE);
  await cache.put(BADGE_COUNT_KEY, new Response(String(normalizedCount)));

  // Chromium-based installed PWAs expose Badging through the SW registration.
  if (normalizedCount === 0 && typeof self.registration.clearAppBadge === 'function') {
    await self.registration.clearAppBadge();
  } else if (typeof self.registration.setAppBadge === 'function') {
    await self.registration.setAppBadge(normalizedCount);
  }

  // Open clients apply the same value through navigator.setAppBadge as a fallback.
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((client) => client.postMessage({ type: 'MFC_BADGE_COUNT', count: normalizedCount }));
  return normalizedCount;
}

async function incrementBadgeCount() {
  return writeBadgeCount((await readBadgeCount()) + 1);
}

async function decrementBadgeCount() {
  return writeBadgeCount(Math.max(0, (await readBadgeCount()) - 1));
}

async function clearBadgeCount() {
  return writeBadgeCount(0);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (!IS_DEV_BUILD) {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(PRECACHE_URLS.map(async (url) => {
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (!response.ok) throw new Error(`Could not precache ${url}`);
        await cache.put(url, response);
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name !== CACHE_NAME && (name.startsWith('mfc-app-') || name === 'mfc-v2'))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
    if (!IS_DEV_BUILD) {
      const existingClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(existingClients.map(async (client) => {
        client.postMessage({ type: 'MFC_APP_UPDATE', version: BUILD_VERSION });
        // Move installed/open PWA sessions onto the newly activated build.
        // Navigation requests are network-first below, so this cannot reuse the old HTML bundle.
        if ('navigate' in client && client.url) {
          await client.navigate(client.url).catch(() => undefined);
        }
      }));
    }
  })());
});

self.addEventListener('fetch', (event) => {
  if (IS_DEV_BUILD) return;
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(request)) || Response.error();
    }
  })());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }

  // FCM wraps data-only Web Push messages in FCM_MSG. Handling that envelope
  // here guarantees the notification promise is attached to the push event,
  // allowing Chrome/Edge/Android/iOS PWA workers to finish while the app is closed.
  const firebaseMessage = payload.FCM_MSG || null;
  const data = firebaseMessage?.data || payload.data || payload;
  const notification = firebaseMessage?.notification || payload.notification || {};
  const title = data.title || notification.title || 'Marvel Fitness Culture';
  const body = data.body || notification.body || 'You have a new reminder.';
  const targetUrl = data.click_url || data.url || firebaseMessage?.fcmOptions?.link || '/reminders';
  const tag = data.notification_id || data.tag || 'mfc-reminder';

  event.waitUntil((async () => {
    await incrementBadgeCount();
    await self.registration.showNotification(title, {
      body,
      icon: '/mfc-icon-v2-192.png',
      badge: '/mfc-notification-badge-96.png',
      tag,
      renotify: true,
      requireInteraction: false,
      data: { url: targetUrl },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clearBadgeCount().then(() => clients.matchAll({ type: 'window', includeUncontrolled: true })).then((windows) => {
    const targetUrl = event.notification.data?.url || '/';
    const existing = windows.find((client) => 'focus' in client);
    return existing
      ? existing.navigate(targetUrl).then(() => existing.focus())
      : clients.openWindow(targetUrl);
  }));
});

self.addEventListener('notificationclose', (event) => {
  // Dismissing one system notification marks one item as handled.
  event.waitUntil(decrementBadgeCount());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'MFC_CLEAR_BADGE') {
    event.waitUntil(clearBadgeCount());
  } else if (event.data?.type === 'MFC_SYNC_BADGE') {
    event.waitUntil(readBadgeCount().then(writeBadgeCount));
  }
});
