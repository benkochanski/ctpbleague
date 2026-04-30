// Unregister any previously cached service worker for this origin.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e =>
  e.waitUntil(self.registration.unregister())
);
