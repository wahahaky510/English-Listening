const CACHE = 'daily-listening-v6';
const AUDIO_CACHE = 'listening-audio-v1';
const FILES = ['./','./index.html','./style.css','./data.js','./audio-manifest.js','./app.js'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('daily-listening-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
 if(event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin || event.request.headers.has('range')) return;
 const isAudio = new URL(event.request.url).pathname.includes('/audio/');
 event.respondWith(caches.open(isAudio?AUDIO_CACHE:CACHE).then(async cache => {
  const hit=await cache.match(event.request);
  // Audio filenames include content settings; immutable audio is reused.
  if(isAudio && hit) return hit;
  try {
   const response=await fetch(event.request);
   if(response.status===200) { try { await cache.put(event.request,response.clone()); } catch {} }
   if(!isAudio && !response.ok && hit) return hit;
   return response;
  } catch(error) {
   if(hit) return hit;
   throw error;
  }
 }));
});
