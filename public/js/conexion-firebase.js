// ==========================================
// CONEXIÓN Y CONFIGURACIÓN GLOBAL DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-firestore.js";

// Credenciales
const firebaseConfig = {
    apiKey: "AIzaSyDVdCX5_Qp_anQ3wLjS5NArk0xo9btj388",
    authDomain: "tablero-materias.firebaseapp.com",
    projectId: "tablero-materias",
    storageBucket: "tablero-materias.firebasestorage.app",
    messagingSenderId: "935591015631",
    appId: "1:935591015631:web:676d05990c3f45fb9f33ba",
    measurementId: "G-RREH6YYQX3"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Inicializar Firestore con soporte offline nativo de persistencia multi-pestaña
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Exportar instancias para usar en el resto de los módulos
export { app, auth, db };

// ==========================================
// REGISTRO DE SERVICE WORKER (PWA)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => {
                console.log('Service Worker registrado con éxito:', reg);

                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            mostrarAvisoActualizacion(newWorker);
                        }
                    });
                });
            })
            .catch(err => console.warn('Error al registrar Service Worker:', err));
    });

    let refreshing;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
}

// Función para mostrar aviso flotante de nueva versión disponible
function mostrarAvisoActualizacion(newWorker) {
    const div = document.createElement('div');
    div.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#1e293b; color:#f1f5f9; padding:15px 20px; border-radius:12px; z-index:9999; box-shadow:0 10px 25px rgba(0,0,0,0.5); display:flex; flex-direction:row; align-items:center; gap:15px; border: 1px solid #334155; font-family: system-ui, sans-serif;";
    div.innerHTML = `
        <span style="font-weight:600; font-size:0.95rem;">Hay una nueva versión de la app.</span>
        <button id="btn-update-sw" style="background:#3b82f6; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold; transition: background 0.2s;">Actualizar</button>
    `;
    document.body.appendChild(div);

    document.getElementById('btn-update-sw').addEventListener('click', () => {
        newWorker.postMessage('SKIP_WAITING');
        div.remove();
    });
}
