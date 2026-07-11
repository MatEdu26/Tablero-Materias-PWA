const CACHE_NAME = "tablero-pwa-v10";

const urlsToCache = [
  "./",
  "./index.html",
  "./login.html",
  "./register.html",
  "./contacto.html",
  "./mensajes_admin.html",
  "./offline.html",
  "./css/style.css",
  "./js/conexion-firebase.js",
  "./js/autenticacion.js",
  "./js/tablero.js",
  "./js/contacto.js",
  "./js/mensajes_admin.js",
  "./img/Logo.jpg",
  "./img/UNO-logo.png",
  "./manifest.json"
];

// Instalar el Service Worker y almacenar recursos en caché
self.addEventListener("install", (event) => {
  console.log("Service Worker: Instalando y cacheando recursos...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activar el Service Worker y limpiar cachés antiguas
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activado");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Service Worker: Borrando caché antigua:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Interceptar peticiones y servir desde caché (Cache First)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Evitar almacenar en caché llamadas dinámicas a los servidores de Firebase (Auth y Firestore)
  // El SDK de Firebase ya tiene su propia persistencia local (IndexedDB)
  if (url.origin.includes("firebase") || url.origin.includes("googleapis")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Si falla la red y es una navegación de página, mostrar la página offline
          if (event.request.mode === 'navigate') {
            return caches.match("./offline.html");
          }
        });
    })
  );
});

// Escuchar mensaje del cliente para omitir tiempo de espera
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});