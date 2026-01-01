/**
 * Service Worker for 听书应用
 * 提供基本的离线缓存能力
 */

const CACHE_NAME = 'audiobook-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
];

// 安装
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 激活
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  // API 请求不缓存
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        // 有缓存则返回缓存，同时更新缓存
        const fetchPromise = fetch(event.request)
          .then((response) => {
            // 有效响应才缓存
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);
        
        return cached || fetchPromise;
      })
  );
});
