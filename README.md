# Tablero de Materias PWA (UNO)

Un organizador de materias en formato Kanban diseñado para estudiantes de la Universidad Nacional del Oeste (UNO). Esta aplicación está construida como una **PWA (Progressive Web App)** nativa, lo que permite su instalación en dispositivos móviles y de escritorio, además de ofrecer soporte completo sin conexión a internet.

---

## 🚀 Características Principales

*   **Tablero Kanban Interactivo**: Arrastra y suelta (*Drag & Drop*) materias académicas entre columnas para organizar tus cursadas en tiempo real.
*   **Barra de Progreso Dinámica**: Visualización en tiempo real de cantidad de materias aprobadas, porcentaje del plan completado y promedio académico general.
*   **PWA Instalable**: Soporte para instalación como aplicación nativa en celulares (Android, iOS) y computadoras de escritorio (PC/Mac).
*   **Soporte Offline**: Service Worker con estrategia de almacenamiento en caché para cargar la aplicación y ver datos previamente sincronizados incluso sin conexión a internet.
*   **Autenticación Segura**: Sistema de inicio de sesión y registro de usuarios nuevos con control de accesos de Firebase Auth.
*   **Roles de Usuario**:
    *   **Usuario Estudiante**: Acceso a su propio tablero Kanban para personalizar materias.
    *   **Administrador**: Panel especial para gestionar usuarios registrados y leer la bandeja de mensajes/sugerencias enviadas.
*   **Bandeja de Contacto**: Formulario de consultas y sugerencias integrado directamente con la base de datos Firestore.

---

## � Funcionalidades disponibles sin conexión

La aplicación está preparada para ofrecer una experiencia útil incluso cuando no hay internet:

- Guardado y sincronización local de cambios del tablero y de los mensajes de contacto.
- Mensajes de contacto que se almacenan en cola cuando el usuario está offline y se envían automáticamente al volver la conexión.
- Avisos visuales claros cuando la app entra o sale del modo offline.
- Acceso a la interfaz principal y a la información ya cargada en el dispositivo mientras no haya red.
- Persistencia local de la sesión y de los datos del usuario para que la app siga siendo usable en dispositivos móviles y escritorio.

## �🛠️ Tecnologías y Herramientas Utilizadas

### Frontend & Diseño
*   **HTML5 Semántico**: Estructura de maquetación limpia y accesible.
*   **CSS3 Personalizado (Vanilla)**: Diseño moderno premium optimizado para modo oscuro nativo, variables de CSS globales, bordes suavizados (*border-radius*), efectos de desenfoque (*backdrop-filter*) y transiciones fluidas.
*   **Bootstrap 5 (CSS Utilities)**: Utilizado para la distribución ágil de componentes y grillas responsivas.
*   **Bootstrap Icons**: Catálogo de íconos vectoriales modernos y consistentes para toda la interfaz visual.
*   **Google Fonts**: Tipografía *Inter* para optimizar la legibilidad en pantallas de cualquier tamaño.

### Backend & Persistencia (Firebase Cloud)
*   **Firebase Authentication**: Gestión y cifrado seguro de cuentas de usuario, control de inicios de sesión y auto-creación/validación de credenciales.
*   **Cloud Firestore**: Base de datos NoSQL en tiempo real para almacenar el estado del tablero de cada alumno, datos de perfil e historial de mensajes.
*   **Firestore Offline Persistence**: Sincronización nativa con caché local (IndexedDB) para permitir lecturas y escrituras sin conexión, sincronizándose automáticamente al recuperar señal.

### Funcionalidades PWA (Progressive Web App)
*   **Web App Manifest (`manifest.json`)**: Configuración de marca, colores de tema, modo de visualización *standalone* y control de íconos según plataforma:
    *   **Móvil**: Uso del ícono `Logo.jpg` (optimizaciones de tamaño y compatibilidad *maskable*).
    *   **Escritorio**: Uso del ícono `logo_azul.png` de alta resolución.
*   **Service Worker (`service-worker.js`)**: Estrategia *Cache-First* para almacenar en caché archivos clave de la interfaz, imágenes estáticas y la página de contingencia sin conexión (`offline.html`).
*   **Actualizaciones en Tiempo Real**: Sistema de notificación en banner cuando se detecta una nueva versión de la aplicación en el servidor, permitiendo actualizarla con un solo clic.

---

## 📁 Estructura del Proyecto

```text
├── firebase.json                # Configuración de Firebase Hosting
├── .firebaserc                  # Configuración del ID del proyecto Firebase
├── README.md                    # Documentación del proyecto (este archivo)
└── public/                      # Directorio público web
    ├── index.html               # Tablero Kanban principal
    ├── login.html               # Formulario de acceso
    ├── register.html            # Formulario de registro de nuevos usuarios
    ├── contacto.html            # Formulario de contacto y sugerencias
    ├── mensajes_admin.html      # Bandeja de entrada para el administrador
    ├── offline.html             # Pantalla de contingencia sin internet
    ├── manifest.json            # Metadatos de la PWA
    ├── service-worker.js        # Lógica del Service Worker y almacenamiento en caché
    ├── css/
    │   ├── style.css            # Estilos CSS generales (tema oscuro premium)
    │   └── offline.css          # Estilos de la pantalla offline
    ├── js/
    │   ├── conexion-firebase.js # Configuración e inicio de Firebase y Service Worker
    │   ├── autenticacion.js     # Validaciones y peticiones de Auth
    │   ├── tablero.js           # Lógica del Kanban, Drag & Drop y Firestore
    │   ├── contacto.js          # Procesamiento y envío de mensajes
    │   └── mensajes_admin.js    # Lógica de visualización de mensajes recibidos
    └── img/
        ├── Logo.jpg             # Logo de la app optimizado para móvil
        ├── logo_azul.png        # Logo de la app optimizado para escritorio/favicon
        └── UNO-logo.png         # Logo institucional de la Universidad (Fondo)
```

---

## ⚙️ Requisitos para Desarrollo Local

1. Tener instalado [Node.js](https://nodejs.org/).
2. Instalar las herramientas de Firebase de manera global (opcional para desplegar):
   ```bash
   npm install -g firebase-tools
   ```
3. Iniciar un servidor local (por ejemplo, Live Server en VS Code o usando Python):
   ```bash
   python -m http.server 8000
   ```
4. Abrir `http://localhost:8000/public/login.html` en tu navegador.
