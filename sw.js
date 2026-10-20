/* Build replaces the marker with a digest of the complete app shell. */
const CACHE = 'starling-shell-__BUILD_ID__';
const ROOT = new URL('./', self.location.href);
const ASSETS = ['./','./index.html','./styles.css','./manifest.webmanifest','./src/app.js','./src/engine.js','./src/storage.js','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(new URL(path,ROOT),{cache:'reload'})))));
  // An existing game stays on its complete old bundle until the player accepts.
});
self.addEventListener('activate',event=>{
  // Keep previous shells for old clients. Never touch IndexedDB progress here.
  event.waitUntil(Promise.resolve());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET' || url.origin!==ROOT.origin || !url.pathname.startsWith(ROOT.pathname))return;
  const known=ASSETS.map(path=>new URL(path,ROOT).pathname).includes(url.pathname);
  if(!known)return; // A missing script must not receive app HTML.
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const key=new URL(url.pathname,ROOT.origin).href;
    return (await cache.match(key)) || fetch(event.request);
  }));
});
