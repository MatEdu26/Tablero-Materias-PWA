import { auth, db } from './conexion-firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-auth.js";
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    getDocs,
    writeBatch,
    addDoc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.7.0/firebase-firestore.js";

// Verificación de autenticación en local
const token = localStorage.getItem('token');
const username = localStorage.getItem('username');
const role = localStorage.getItem('role');
const userId = localStorage.getItem('userId');

if (!token) {
    window.location.href = 'login.html';
}

// Variables de estado
let tasks = [];
let currentCareerId = null;
let currentSubjects = [];
let currentTasks = [];
let lastSubjectsTitles = null;

let canceladorUsuario = null;
let canceladorSubjects = null;
let canceladorTasks = null;

function normalizeText(value = '') {
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getYearRank(anio = '') {
    const order = {
        '1° AÑO': 1,
        '2° AÑO': 2,
        '3° AÑO': 3,
        '4° AÑO': 4,
        '5° AÑO': 5,
        'OTRAS': 6
    };
    return order[anio] ?? 999;
}

function ordenarMateriasPorAnio(items = []) {
    return [...items].sort((a, b) => {
        const rankA = getYearRank(a.anio);
        const rankB = getYearRank(b.anio);
        if (rankA !== rankB) return rankA - rankB;
        return (a.titulo || '').localeCompare(b.titulo || '', 'es', { sensitivity: 'base' });
    });
}

function ordenarTareasPorEstadoYAnio(items = []) {
    return ordenarMateriasPorAnio(items).sort((a, b) => {
        const estadoA = a.estado || 'Materias';
        const estadoB = b.estado || 'Materias';
        const order = { Materias: 0, 'En curso': 1, Regularizadas: 2, Aprobadas: 3 };
        const rankEstadoA = order[estadoA] ?? 99;
        const rankEstadoB = order[estadoB] ?? 99;
        if (rankEstadoA !== rankEstadoB) return rankEstadoA - rankEstadoB;
        return getYearRank(a.anio) - getYearRank(b.anio);
    });
}

function encontrarMateriaPorTitulo(subjects = [], titulo = '') {
    const normalizedTitle = normalizeText(titulo);
    if (!normalizedTitle) return null;

    return subjects.find(subject => {
        const normalizedSubjectTitle = normalizeText(subject.titulo);
        return normalizedSubjectTitle === normalizedTitle || normalizedSubjectTitle.includes(normalizedTitle) || normalizedTitle.includes(normalizedSubjectTitle);
    }) || null;
}

// Planes de estudio (definidos aquí para que estén disponibles en el seeding)
const studyPlans = {
    tec_web: [
        { titulo: 'Programación Web 1', anio: '1° AÑO' }, { titulo: 'Algebra y Geometría Analítica', anio: '1° AÑO' }, { titulo: 'Tecnología Aplicada', anio: '1° AÑO' }, { titulo: 'Algoritmos y Estructura de Datos', anio: '1° AÑO' }, { titulo: 'Matemática Discreta', anio: '1° AÑO' }, { titulo: 'Análisis y Producción del Discurso', anio: '1° AÑO' }, { titulo: 'Problemática Regional', anio: '1° AÑO' }, { titulo: 'Programación con Objetos 1', anio: '1° AÑO' }, { titulo: 'Arquitectura de Computadores 1', anio: '1° AÑO' }, { titulo: 'ELECTIVA', anio: '1° AÑO' },
        { titulo: 'Programación Web 2', anio: '2° AÑO' }, { titulo: 'Base de Datos 1', anio: '2° AÑO' }, { titulo: 'Programación con Objetos 2', anio: '2° AÑO' }, { titulo: 'Lenguajes Formales', anio: '2° AÑO' }, { titulo: 'Diseño Gráfico', anio: '2° AÑO' }, { titulo: 'Sistemas Operativos 1', anio: '2° AÑO' }, { titulo: 'Taller de Lenguajes', anio: '2° AÑO' }, { titulo: 'Ingeniería de Software 1', anio: '2° AÑO' }, { titulo: 'Universidad, Ciencia y Sociedad', anio: '2° AÑO' },
        { titulo: 'Programación Web 3', anio: '3° AÑO' }, { titulo: 'Dispositivos Móviles', anio: '3° AÑO' }, { titulo: 'Métodos Agiles en la Web', anio: '3° AÑO' }, { titulo: 'Practica Profesional Supervisada', anio: '3° AÑO' }, { titulo: 'OPTATIVA', anio: '3° AÑO' },
        { titulo: 'Ingles 1', anio: 'OTRAS' }, { titulo: 'Trabajo Social Obligatorio', anio: 'OTRAS' }
    ],
    tec_redes: [
        { titulo: 'Algebra y Geometría Analítica', anio: '1° AÑO' }, { titulo: 'Tecnología Aplicada', anio: '1° AÑO' }, { titulo: 'Algoritmos y Estructura de Datos', anio: '1° AÑO' }, { titulo: 'Matemática Discreta', anio: '1° AÑO' }, { titulo: 'Arquitectura de Computadores 1', anio: '1° AÑO' }, { titulo: 'Circuitos Electrónicos', anio: '1° AÑO' }, { titulo: 'Análisis y Producción del Discurso', anio: '1° AÑO' }, { titulo: 'Programación con Objetos 1', anio: '1° AÑO' }, { titulo: 'ELECTIVA', anio: '1° AÑO' },
        { titulo: 'Comunicación y Redes 1', anio: '2° AÑO' }, { titulo: 'Medidas Electrónicas', anio: '2° AÑO' }, { titulo: 'Arquitectura de Computadores 2', anio: '2° AÑO' }, { titulo: 'Análisis Matemático', anio: '2° AÑO' }, { titulo: 'Problemática Regional', anio: '2° AÑO' }, { titulo: 'Probabilidad y Estadística', anio: '2° AÑO' }, { titulo: 'Base de Datos 1', anio: '2° AÑO' }, { titulo: 'Comunicación y Redes 2', anio: '2° AÑO' },
        { titulo: 'Programación en Comunicación', anio: '3° AÑO' }, { titulo: 'Taller de Redes', anio: '3° AÑO' }, { titulo: 'Seguridad en Redes', anio: '3° AÑO' }, { titulo: 'Universidad, Ciencia y Sociedad', anio: '3° AÑO' }, { titulo: 'Practica Profesional Supervisada', anio: '3° AÑO' }, { titulo: 'OPTATIVA', anio: '3° AÑO' },
        { titulo: 'Ingles 1', anio: 'OTRAS' }, { titulo: 'Trabajo Social Obligatorio', anio: 'OTRAS' }
    ],
    lic_inf: [
        { titulo: 'Algebra y Geometría Analítica', anio: '1° AÑO' }, { titulo: 'Tecnología Aplicada', anio: '1° AÑO' }, { titulo: 'Algoritmos y Estructura de Datos', anio: '1° AÑO' }, { titulo: 'Teoría de Sistemas y Organizaciones', anio: '1° AÑO' }, { titulo: 'Problemática Regional', anio: '1° AÑO' }, { titulo: 'Matemática Discreta', anio: '1° AÑO' }, { titulo: 'Arquitectura de Computadores 1', anio: '1° AÑO' }, { titulo: 'Análisis y Producción del Discurso', anio: '1° AÑO' }, { titulo: 'Programación con Objetos 1', anio: '1° AÑO' },
        { titulo: 'Análisis Matemático 1', anio: '2° AÑO' }, { titulo: 'Programación con Objetos 2', anio: '2° AÑO' }, { titulo: 'ELECTIVA', anio: '2° AÑO' }, { titulo: 'Arquitectura de Computadores 2', anio: '2° AÑO' }, { titulo: 'Lenguajes Formales', anio: '2° AÑO' }, { titulo: 'Universidad, Ciencia y Sociedad', anio: '2° AÑO' }, { titulo: 'Ingeniería de Software 1', anio: '2° AÑO' }, { titulo: 'Probabilidad y Estadística', anio: '2° AÑO' }, { titulo: 'Sistemas Operativos 1', anio: '2° AÑO' }, { titulo: 'Base de Datos 1', anio: '2° AÑO' }, { titulo: 'Comunicación y Redes 1', anio: '2° AÑO' },
        { titulo: 'Análisis Matemático 2', anio: '3° AÑO' }, { titulo: 'Base de Datos 2', anio: '3° AÑO' }, { titulo: 'Comunicación y Redes 2', anio: '3° AÑO' }, { titulo: 'Ingeniería de Software 2', anio: '3° AÑO' }, { titulo: 'Interfaces de Usuario y Tecnologías Web', anio: '3° AÑO' }, { titulo: 'Programación con Objetos 3', anio: '3° AÑO' }, { titulo: 'Matemática Aplicada', anio: '3° AÑO' }, { titulo: 'Explotación de Datos', anio: '3° AÑO' }, { titulo: 'Taller de Redes', anio: '3° AÑO' }, { titulo: 'Sistemas Operativos 2', anio: '3° AÑO' },
        { titulo: 'Dirección y Evaluación de Proyectos Informáticos', anio: '4° AÑO' }, { titulo: 'Arquitectura de Software', anio: '4° AÑO' }, { titulo: 'Modelos, Simulación y Teoría de la Decisión', anio: '4° AÑO' }, { titulo: 'Metodología de la Investigación', anio: '4° AÑO' }, { titulo: 'Paradigmas de Programación', anio: '4° AÑO' }, { titulo: 'Lenguajes de Programación', anio: '4° AÑO' }, { titulo: 'Infraestructura de Sistemas', anio: '4° AÑO' }, { titulo: 'Desarrollo de Compiladores', anio: '4° AÑO' }, { titulo: 'Inteligencia Artificial', anio: '4° AÑO' }, { titulo: 'Practica Profesional', anio: '4° AÑO' },
        { titulo: 'OPTATIVA 1', anio: '5° AÑO' }, { titulo: 'Aspectos Legales y Sociales de la Informática', anio: '5° AÑO' }, { titulo: 'Ingeniería de Software 3', anio: '5° AÑO' }, { titulo: 'Sistemas de Tiempo Real y Misión Crítica', anio: '5° AÑO' }, { titulo: 'Economía 1', anio: '5° AÑO' }, { titulo: 'OPTATIVA 2', anio: '5° AÑO' }, { titulo: 'Seguridad y Auditoria', anio: '5° AÑO' }, { titulo: 'Teoría de la Computación', anio: '5° AÑO' }, { titulo: 'Administración y Gestión de las Organizaciones', anio: '5° AÑO' }, { titulo: 'Economía 2', anio: '5° AÑO' }, { titulo: 'Trabajo Final', anio: '5° AÑO' },
        { titulo: 'Ingles 1', anio: 'OTRAS' }, { titulo: 'Ingles 2', anio: 'OTRAS' }, { titulo: 'Trabajo Social Obligatorio', anio: 'OTRAS' }
    ]
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Saludo de Usuario en header
    const userGreeting = document.getElementById('userGreeting');
    if (userGreeting && username) userGreeting.textContent = username;

    // 2. Control de accesos y visibilidad según ROL (RBAC)
    if (role === 'administrador') {
        const navAdmin = document.getElementById('navMensajes');
        const navAdminMobile = document.getElementById('navMensajesMobile');
        const navUsers = document.getElementById('navUsuarios');
        const navUsersMobile = document.getElementById('navUsuariosMobile');
        const btnNuevaMateria = document.getElementById('btnNuevaMateria');
        const loadPlanBtn = document.getElementById('loadPlanBtn');
        const loadPlanBtnMobile = document.getElementById('loadPlanBtnMobile');

        if (navAdmin) navAdmin.style.display = 'inline-flex';
        if (navAdminMobile) navAdminMobile.style.display = 'flex';
        if (navUsers) navUsers.style.display = 'inline-flex';
        if (navUsersMobile) navUsersMobile.style.display = 'flex';
        if (btnNuevaMateria) btnNuevaMateria.style.display = 'inline-flex';
        // Renombrar botón de Cargar Plan a "Carreras" para admin (una sola vez)
        if (loadPlanBtn) loadPlanBtn.innerHTML = '<i class="bi bi-journal-check"></i> Carreras';
        if (loadPlanBtnMobile) {
            const span = loadPlanBtnMobile.querySelector('span');
            if (span) span.textContent = 'Carreras';
        }

        // Escuchar cantidad de mensajes en tiempo real para el Badge de notificaciones
        escucharCantidadMensajes();
    }

    // 3. Vinculación de Botones
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            try {
                await signOut(auth);
            } catch (e) {
                console.warn('Error al cerrar sesión en Firebase:', e);
            }
            localStorage.clear();
            window.location.href = 'login.html';
        };
    }

    const loadPlanBtn = document.getElementById('loadPlanBtn');
    if (loadPlanBtn) loadPlanBtn.onclick = () => openCareerModal();

    const loadPlanBtnMobile = document.getElementById('loadPlanBtnMobile');
    if (loadPlanBtnMobile) loadPlanBtnMobile.onclick = () => openCareerModal();

    const detailsForm = document.getElementById('detailsForm');
    if (detailsForm) {
        detailsForm.addEventListener('submit', saveCardDetails);
    }

    const addMateriaForm = document.getElementById('addMateriaForm');
    if (addMateriaForm) {
        addMateriaForm.addEventListener('submit', saveNewMateria);
    }

    const careerManageForm = document.getElementById('careerManageForm');
    if (careerManageForm) {
        careerManageForm.addEventListener('submit', saveCareerManage);
    }

    const adminDeleteBtn = document.getElementById('adminDeleteBtn');
    if (adminDeleteBtn) {
        adminDeleteBtn.addEventListener('click', deleteMateriaGlobal);
    }

    // 4. Verificar, migrar datos e iniciar escuchas
    await verificarYMigrarDatos();
    iniciarEscuchasTablero();
});

// ====== SEEDING E INICIALIZACIÓN DE FIREBASE ======
async function inicializarBaseDeDatos() {
    const batch = writeBatch(db);

    const careers = [
        { id: 'tec_web', name: 'Tecnicatura Universitaria en Tecnologías Web' },
        { id: 'tec_redes', name: 'Tecnicatura Universitaria en Redes Informáticas' },
        { id: 'lic_inf', name: 'Licenciatura en Informática' }
    ];

    careers.forEach(c => {
        batch.set(doc(db, 'careers', c.id), { name: c.name });
    });

    for (const careerId in studyPlans) {
        const subjects = studyPlans[careerId];
        subjects.forEach(m => {
            const subjectRef = doc(collection(db, 'subjects'));
            batch.set(subjectRef, {
                career_id: careerId,
                titulo: m.titulo,
                anio: m.anio
            });
        });
    }

    await batch.commit();
    console.log("Base de datos de Carreras y Materias inicializada con éxito.");
}

// ====== VERIFICACIÓN Y MIGRACIÓN AUTOMÁTICA ======
async function verificarYMigrarDatos() {
    if (!userId) return;

    try {
        const careersSnap = await getDocs(collection(db, 'careers'));
        if (careersSnap.empty) {
            await inicializarBaseDeDatos();
        }

        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();

            if (userData.career_id) {
                localStorage.setItem('career_id', userData.career_id);

                // Verificar que los subjects de esa carrera existan (pueden faltar si el seeding
                // anterior falló silenciosamente por el bug de inicialización)
                const subjectsCheck = await getDocs(
                    query(collection(db, 'subjects'), where('career_id', '==', userData.career_id))
                );
                if (subjectsCheck.empty) {
                    console.warn("Subjects vacíos para la carrera del usuario. Re-inicializando base de datos...");
                    await inicializarBaseDeDatos();
                    showToast("Plan de estudios restaurado correctamente.", "success");
                }
                return;
            }

            const legacyTasksQuery = query(collection(db, 'tasks'), where('user_id', '==', userId));
            const legacyTasksSnap = await getDocs(legacyTasksQuery);

            if (!legacyTasksSnap.empty) {
                console.log("Detectado esquema heredado de materias. Iniciando migración de datos...");

                let detectedCareerId = 'lic_inf';
                const titulos = legacyTasksSnap.docs.map(d => d.data().titulo || '');

                if (titulos.some(t => t.includes('Programación Web 1') || t.includes('Programación Web 2'))) {
                    detectedCareerId = 'tec_web';
                } else if (titulos.some(t => t.includes('Circuitos Electrónicos') || t.includes('Taller de Redes'))) {
                    detectedCareerId = 'tec_redes';
                }

                const subjectsQuery = query(collection(db, 'subjects'), where('career_id', '==', detectedCareerId));
                const subjectsSnap = await getDocs(subjectsQuery);
                const globalSubjects = subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                const migrationBatch = writeBatch(db);

                legacyTasksSnap.docs.forEach(docSnap => {
                    const legacyData = docSnap.data();

                    if (legacyData.subject_id) return;

                    const match = encontrarMateriaPorTitulo(globalSubjects, legacyData.titulo);
                    const newDocId = match ? `${userId}_${match.id}` : `${userId}_legacy_${docSnap.id}`;
                    const newDocRef = doc(db, 'tasks', newDocId);

                    migrationBatch.set(newDocRef, {
                        user_id: userId,
                        subject_id: match ? match.id : '',
                        estado: legacyData.estado || 'Materias',
                        docente: legacyData.docente || '',
                        cuatrimestre: legacyData.cuatrimestre || '',
                        nota: legacyData.nota || '',
                        descripcion: legacyData.descripcion || '',
                        titulo: legacyData.titulo || '',
                        anio: legacyData.anio || (match ? match.anio : '')
                    });

                    migrationBatch.delete(docSnap.ref);
                });

                migrationBatch.update(userDocRef, { career_id: detectedCareerId });
                await migrationBatch.commit();

                localStorage.setItem('career_id', detectedCareerId);
                console.log("Migración completada correctamente para la carrera:", detectedCareerId);
                showToast("Tus materias fueron migradas con éxito a la nueva versión.", "success");
            }
        }
    } catch (err) {
        console.error("Error en la verificación y migración de datos:", err);
    }
}

// ====== ESCUCHAS DE FIRESTORE EN TIEMPO REAL ======
function iniciarEscuchasTablero() {
    if (!userId) return;

    if (canceladorUsuario) canceladorUsuario();

    canceladorUsuario = onSnapshot(doc(db, 'users', userId), (userDoc) => {
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const newCareerId = userData.career_id || null;

            if (newCareerId !== currentCareerId) {
                currentCareerId = newCareerId;
                if (currentCareerId) {
                    localStorage.setItem('career_id', currentCareerId);
                    escucharCarreraYMaterias(currentCareerId);
                } else {
                    localStorage.removeItem('career_id');
                    openCareerModal();
                }
            }
        } else {
            openCareerModal();
        }
    }, (err) => {
        console.error("Error escuchando datos de usuario:", err);
    });
}

function escucharCarreraYMaterias(careerId) {
    if (canceladorSubjects) canceladorSubjects();
    if (canceladorTasks) canceladorTasks();

    onSnapshot(doc(db, 'careers', careerId), (careerDoc) => {
        const titleEl = document.getElementById('boardTitle');
        if (titleEl && careerDoc.exists()) {
            const logoHtml = '<img src="img/logo_azul.png" alt="Logo" style="height: 32px; width: 32px; object-fit: cover; border-radius: 4px;">';
            titleEl.innerHTML = `${logoHtml} ${escapeHTML(careerDoc.data().name)}`;
        }
    });

    const subjectsQuery = query(collection(db, 'subjects'), where('career_id', '==', careerId));
    canceladorSubjects = onSnapshot(subjectsQuery, (subjectsSnap) => {
        const updatedSubjects = [];
        subjectsSnap.forEach(d => {
            updatedSubjects.push({ id: d.id, ...d.data() });
        });

        // NOTIFICACIONES EN TIEMPO REAL
        if (lastSubjectsTitles !== null) {
            updatedSubjects.forEach(s => {
                const existed = lastSubjectsTitles.some(prev => prev.id === s.id);
                if (!existed) {
                    showToast(`📢 Nueva materia agregada: ${s.titulo}`, 'info');
                }
            });

            lastSubjectsTitles.forEach(prev => {
                const existsNow = updatedSubjects.some(s => s.id === prev.id);
                if (!existsNow) {
                    showToast(`⚠️ La materia "${prev.titulo}" fue removida del plan de estudios.`, 'error');
                }
            });
        }

        lastSubjectsTitles = updatedSubjects.map(s => ({ id: s.id, titulo: s.titulo }));
        currentSubjects = updatedSubjects;
        combinarYRenderizar();
    }, (err) => {
        console.error("Error al escuchar materias globales:", err);
    });

    const tasksQuery = query(collection(db, 'tasks'), where('user_id', '==', userId));
    canceladorTasks = onSnapshot(tasksQuery, (tasksSnap) => {
        currentTasks = [];
        tasksSnap.forEach(d => {
            currentTasks.push({ id: d.id, ...d.data() });
        });
        combinarYRenderizar();
    }, (err) => {
        console.error("Error al escuchar progreso del usuario:", err);
    });
}

function combinarYRenderizar() {
    const cards = [];

    currentSubjects.forEach(subject => {
        const progress = currentTasks.find(t => t.subject_id === subject.id) || {};
        cards.push({
            id: subject.id,
            titulo: subject.titulo,
            anio: subject.anio,
            estado: progress.estado || 'Materias',
            docente: progress.docente || '',
            cuatrimestre: progress.cuatrimestre || '',
            nota: progress.nota || '',
            descripcion: progress.descripcion || ''
        });
    });

    currentTasks
        .filter(task => !task.subject_id && (task.titulo || task.subject_title))
        .forEach(task => {
            cards.push({
                id: task.id,
                titulo: task.titulo || task.subject_title || 'Materia sin nombre',
                anio: task.anio || '',
                estado: task.estado || 'Materias',
                docente: task.docente || '',
                cuatrimestre: task.cuatrimestre || '',
                nota: task.nota || '',
                descripcion: task.descripcion || ''
            });
        });

    tasks = ordenarMateriasPorAnio(cards);
    renderBoards();
}

// Escucha en tiempo real de sugerencias para actualizar contadores de Admin
function escucharCantidadMensajes() {
    const consulta = collection(db, 'messages');
    onSnapshot(consulta, (querySnapshot) => {
        const total = querySnapshot.size;
        const badges = [document.getElementById('msgBadge'), document.getElementById('msgBadgeMobile')];
        badges.forEach(b => {
            if (b) {
                b.textContent = total;
                b.style.display = total > 0 ? 'block' : 'none';
            }
        });
    }, (error) => {
        console.warn('Error obteniendo cantidad de mensajes:', error);
    });
}

// ====== FEEDBACK ONLINE/OFFLINE =======
window.addEventListener('online', () => showToast('Conexión reestablecida. Las actividades se sincronizaron con éxito.', 'success'));
window.addEventListener('offline', () => showToast('Sin conexión a internet. Las actividades se guardarán localmente y se ejecutarán al restablecer la red.', 'info'));

// =======================
// NOTIFICACIONES (Toast y Confirm)
// =======================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const box = document.getElementById('toastBox');
    if (!container || !box) return;

    const colors = {
        success: { bg: '#22c55e', icon: '✅' },
        error:   { bg: '#ef4444', icon: '❌' },
        info:    { bg: '#3b82f6', icon: 'ℹ️' },
        special: { bg: 'linear-gradient(135deg, #a855f7, #ec4899)', icon: '🎓' }
    };
    const c = colors[type] || colors.info;

    box.style.background = c.bg;
    box.innerHTML = `<span style="font-size:1.5rem;">${c.icon}</span><span>${message}</span>`;
    container.style.display = 'flex';

    clearTimeout(container._toastTimeout);
    container._toastTimeout = setTimeout(() => {
        container.style.display = 'none';
    }, type === 'special' ? 6000 : 3000);
}

function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const msgEl = document.getElementById('confirmMessage');
        const btnOk = document.getElementById('confirmOk');
        const btnCancel = document.getElementById('confirmCancel');

        if (!modal || !msgEl) { resolve(window.confirm(message)); return; }

        msgEl.textContent = message;
        modal.classList.add('show');

        const cleanup = (result) => {
            modal.classList.remove('show');
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
            resolve(result);
        };

        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
    });
}

// Renderizado de las columnas del tablero
function renderBoards() {
    updateBoardTitleAndButtons();

    const columns = {
        'Materias': document.getElementById('col-materias'),
        'En curso': document.getElementById('col-encurso'),
        'Regularizadas': document.getElementById('col-regularizadas'),
        'Aprobadas': document.getElementById('col-aprobadas')
    };

    for (const key in columns) {
        if (columns[key]) {
            columns[key].innerHTML = '';
            updateColumnCount(columns[key].closest('.board-column'), 0);
        }
    }

    const orderedTasks = ordenarTareasPorEstadoYAnio(tasks);
    orderedTasks.forEach(task => {
        const col = columns[task.estado];
        if (col) {
            col.appendChild(createTaskCard(task));
        }
    });

    for (const key in columns) {
        if (columns[key]) {
            updateColumnCount(columns[key].closest('.board-column'), columns[key].children.length);
        }
    }

    initSortable(); // Inicializar SortableJS para arrastre
    updateProgressBar();
}

// Crear tarjeta de materia (sin swipe to delete, solo admin puede eliminar desde el modal)
function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.draggable = true;
    card.id = `task-${task.id}`;

    let cardColor = '';
    let yearBadgeHtml = '';

    if (task.anio) {
        const yearColors = {
            '1° AÑO': '#bfdbfe',
            '2° AÑO': '#bbf7d0',
            '3° AÑO': '#fef08a',
            '4° AÑO': '#fbcfe8',
            '5° AÑO': '#e9d5ff',
            'OTRAS': '#fecaca',
        };
        cardColor = yearColors[task.anio] || '#e2e8f0';
        yearBadgeHtml = `<span class="task-year-badge">${task.anio}</span>`;
    } else {
        const fallbackColors = ['#fef08a', '#fecaca', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8', '#a7f3d0', '#fcd34d', '#99f6e4', '#c4b5fd'];
        let sum = 0;
        for (let i = 0; i < task.id.length; i++) sum += task.id.charCodeAt(i);
        cardColor = fallbackColors[sum % fallbackColors.length];
    }

    card.style.backgroundColor = cardColor;
    card.style.borderColor = cardColor;

    card.addEventListener('click', () => openDetailsModal(task.id));

    const hasDetails = task.docente || task.cuatrimestre || task.nota || task.descripcion;
    const detailsIcon = hasDetails ? `<i class="bi bi-file-earmark-text-fill ms-1" style="font-size:0.8rem; color:#475569;" title="Tiene detalles guardados"></i>` : '';

    card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; width: 100%;">
            <div style="display: flex; flex-direction: column; flex-grow: 1; min-width: 0;">
                ${yearBadgeHtml}
                <span class="task-title" style="color: #0f172a; font-weight: 600; line-height: 1.3;">${escapeHTML(task.titulo)} ${detailsIcon}</span>
            </div>
            <i class="bi bi-grip-vertical" style="color: rgba(15, 23, 42, 0.45); font-size: 1.2rem; cursor: grab; align-self: center;" title="Arrastrar para mover"></i>
        </div>
    `;

    return card;
}

function updateColumnCount(columnEl, count) {
    const countEl = columnEl.querySelector('.task-count');
    if (countEl) countEl.textContent = count;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag)
    );
}

// =======================
// BARRA DE PROGRESO
// =======================
function updateProgressBar() {
    const container = document.getElementById('progressContainer');
    const bar = document.getElementById('progressBarFill');
    const text = document.getElementById('progressText');
    if (!container || !bar || !text) return;

    const total = tasks.length;
    if (total === 0) {
        container.style.display = 'none';
        return;
    }

    const aprobadas = tasks.filter(t => t.estado === 'Aprobadas').length;
    const pct = Math.round((aprobadas / total) * 100);

    container.style.display = 'flex';
    bar.style.width = `${pct}%`;
    text.textContent = `${aprobadas} / ${total} aprobadas (${pct}%)`;

    const aprobadasTasksWithGrade = tasks.filter(t => t.estado === 'Aprobadas' && t.nota !== undefined && t.nota !== null && t.nota !== '' && !isNaN(parseFloat(t.nota)));
    const averageTextEl = document.getElementById('averageText');
    if (averageTextEl) {
        if (aprobadasTasksWithGrade.length > 0) {
            const sum = aprobadasTasksWithGrade.reduce((acc, t) => acc + parseFloat(t.nota), 0);
            const avg = (sum / aprobadasTasksWithGrade.length).toFixed(2);
            averageTextEl.textContent = `Promedio: ${avg}`;
            averageTextEl.style.display = 'inline-block';
        } else {
            averageTextEl.style.display = 'none';
        }
    }

    if (pct === 100) {
        // Extraer solo el texto del título (sin el texto alternativo del logo)
        const titleEl = document.getElementById('boardTitle');
        const careerName = titleEl ? titleEl.innerText.trim() : 'tu carrera';
        showToast(`¡Felicitaciones! Te has recibido de ${careerName}`, 'special');
    }
}

// =======================
// LÓGICA DE SORTABLE JS (ARRASTRE EN MÓVILES Y PC)
// =======================
function initSortable() {
    if (typeof Sortable === 'undefined') {
        console.warn('Sortable no está cargado.');
        return;
    }
    const columns = document.querySelectorAll('.column-body');
    columns.forEach(col => {
        new Sortable(col, {
            group: 'shared-kanban',
            animation: 150,
            ghostClass: 'dragging',
            onEnd: async function (evt) {
                const itemEl = evt.item;
                const newCol = evt.to.closest('.board-column');
                const newStatus = newCol.getAttribute('data-status');
                const subjectId = itemEl.id.replace('task-', '');

                const taskIndex = tasks.findIndex(t => t.id == subjectId);
                if (taskIndex > -1 && tasks[taskIndex].estado !== newStatus) {
                    tasks[taskIndex].estado = newStatus;

                    updateBoardCounters();
                    updateProgressBar();

                    try {
                        const progressDocId = `${userId}_${subjectId}`;
                        await setDoc(doc(db, 'tasks', progressDocId), {
                            user_id: userId,
                            subject_id: subjectId,
                            estado: newStatus
                        }, { merge: true });
                    } catch (error) {
                        console.error('Error actualizando estado en Firestore:', error);
                    }
                }
            }
        });
    });
}

function updateBoardCounters() {
    const columns = document.querySelectorAll('.board-column');
    columns.forEach(col => {
        const body = col.querySelector('.column-body');
        const badge = col.querySelector('.task-count');
        if (body && badge) {
            badge.textContent = body.children.length;
        }
    });
}

// =======================
// GESTIÓN DE USUARIOS (SOLO ADMINISTRADORES)
// =======================
const usersModal = document.getElementById('usersModal');

async function openUsersModal() {
    if (usersModal) usersModal.classList.add('show');
    await loadUsersList();
}

function closeUsersModal() {
    if (usersModal) usersModal.classList.remove('show');
}

async function loadUsersList() {
    const container = document.getElementById('usersListContainer');
    if (!container) return;
    container.innerHTML = '<p>Cargando usuarios...</p>';

    try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        container.innerHTML = '';

        querySnapshot.forEach((docSnapshot) => {
            const u = docSnapshot.data();
            const uId = docSnapshot.id;
            const div = document.createElement('div');
            div.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background-color: var(--bg-color); border: 1px solid var(--border-color); border-radius: var(--radius-md);";

            const isMe = u.uid === userId || u.email === 'admin@tablero.com';

            div.innerHTML = `
                <div>
                    <strong style="font-size: 1.05rem;">${escapeHTML(u.username)}</strong>
                    <span style="font-size:0.8rem; color:var(--text-secondary); margin-left: 0.5rem; text-transform: uppercase;">[${u.role}]</span>
                </div>
                <div style="display:flex; gap: 0.5rem; align-items: center;">
                    <select onchange="changeUserRole('${uId}', this.value)" ${isMe ? 'disabled' : ''} style="padding: 0.35rem; border-radius: 4px; background: var(--surface-color); color: var(--text-primary); border: 1px solid var(--border-color); outline: none;">
                        <option value="usuario" ${u.role === 'usuario' ? 'selected' : ''}>Usuario</option>
                        <option value="administrador" ${u.role === 'administrador' ? 'selected' : ''}>Admin</option>
                    </select>
                    <button onclick="deleteUser('${uId}')" class="btn-secondary" style="padding: 0.35rem 0.6rem; color:#ef4444; border-color:rgba(239, 68, 68, 0.4); background: ${isMe ? 'transparent' : 'rgba(239, 68, 68, 0.1)'}; line-height: 1;" ${isMe ? 'disabled' : ''}>
                        Eliminar
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p style="color:#ef4444">Fallo la carga de usuarios.</p>';
    }
}

async function changeUserRole(targetUserId, newRole) {
    if (targetUserId === userId) {
        showToast('No puedes cambiar tu propio rol.', 'error');
        return;
    }
    if (!await showConfirm(`¿Estás seguro de cambiar el rol a ${newRole}?`)) {
        await loadUsersList();
        return;
    }

    try {
        await updateDoc(doc(db, 'users', targetUserId), { role: newRole });
        await loadUsersList();
        showToast('Rol actualizado correctamente.', 'success');
    } catch (err) {
        console.error(err);
        showToast('No se pudo cambiar el rol.', 'error');
    }
}

async function deleteUser(targetUserId) {
    if (targetUserId === userId) {
        showToast('No puedes eliminar tu propia cuenta.', 'error');
        return;
    }
    if (!await showConfirm('¿Eliminar cuenta permanentemente? Se borrarán sus materias asociadas.')) return;

    try {
        // 1. Eliminar materias asociadas
        const qTasks = query(collection(db, 'tasks'), where('user_id', '==', targetUserId));
        const tasksSnapshot = await getDocs(qTasks);
        const batch = writeBatch(db);
        tasksSnapshot.forEach((docSnapshot) => {
            batch.delete(doc(db, 'tasks', docSnapshot.id));
        });
        await batch.commit();

        // 2. Eliminar perfil de usuario en Firestore
        await deleteDoc(doc(db, 'users', targetUserId));

        await loadUsersList();
        showToast('Usuario y materias eliminados correctamente.', 'success');
    } catch (err) {
        console.error(err);
        showToast('No se pudo eliminar el usuario.', 'error');
    }
}

window.openUsersModal = openUsersModal;
window.closeUsersModal = closeUsersModal;
window.changeUserRole = changeUserRole;
window.deleteUser = deleteUser;

// =======================
// LÓGICA MODALES (CARRERA Y DETALLES)
// =======================
const careerModal = document.getElementById('careerModal');
const detailsModal = document.getElementById('detailsModal');
const addMateriaModal = document.getElementById('addMateriaModal');
const careerManageModal = document.getElementById('careerManageModal');

window.onclick = function (event) {
    if (event.target === careerModal) closeCareerModal();
    if (event.target === detailsModal) closeDetailsModal();
    if (event.target === usersModal) closeUsersModal();
    if (event.target === addMateriaModal) closeAddMateriaModal();
    if (event.target === careerManageModal) closeCareerManageModal();
};

function openDetailsModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('detailsModalTitle').textContent = task.titulo;
    document.getElementById('detailsId').value = task.id;
    document.getElementById('detailsTeacher').value = task.docente || '';
    document.getElementById('detailsTerm').value = task.cuatrimestre || '';
    document.getElementById('detailsGrade').value = task.nota || '';
    document.getElementById('detailsDesc').value = task.descripcion || '';

    const adminTitleGroup = document.getElementById('adminTitleGroup');
    const adminYearGroup = document.getElementById('adminYearGroup');
    const adminDeleteBtn = document.getElementById('adminDeleteBtn');

    if (role === 'administrador') {
        if (adminTitleGroup) adminTitleGroup.style.display = 'block';
        if (adminYearGroup) adminYearGroup.style.display = 'block';
        if (adminDeleteBtn) adminDeleteBtn.style.display = 'inline-block';

        const detailsTitle = document.getElementById('detailsTitle');
        const detailsYear = document.getElementById('detailsYear');
        if (detailsTitle) detailsTitle.value = task.titulo || '';
        if (detailsYear) detailsYear.value = task.anio || '1° AÑO';
    } else {
        if (adminTitleGroup) adminTitleGroup.style.display = 'none';
        if (adminYearGroup) adminYearGroup.style.display = 'none';
        if (adminDeleteBtn) adminDeleteBtn.style.display = 'none';
    }

    detailsModal.classList.add('show');
}

function closeDetailsModal() {
    if (detailsModal) detailsModal.classList.remove('show');
}

window.closeDetailsModal = closeDetailsModal;

// =======================
// VALIDACIÓN Y GUARDADO DE DETALLES
// =======================
function sanitizeText(str, maxLength) {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, '').trim().substring(0, maxLength);
}

function validateGrade(value) {
    if (value === '' || value === null || value === undefined) return { valid: true, value: '' };
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 10) {
        return { valid: false, error: 'La nota debe ser un número entre 0 y 10.' };
    }
    return { valid: true, value: String(num) };
}

async function saveCardDetails(e) {
    e.preventDefault();
    const subjectId = document.getElementById('detailsId').value;
    const docente = sanitizeText(document.getElementById('detailsTeacher').value, 100);
    const cuatrimestre = sanitizeText(document.getElementById('detailsTerm').value, 50);
    const descripcion = sanitizeText(document.getElementById('detailsDesc').value, 500);
    const rawNota = document.getElementById('detailsGrade').value.trim();

    const gradeResult = validateGrade(rawNota);
    if (!gradeResult.valid) {
        showToast(gradeResult.error, 'error');
        return;
    }
    const nota = gradeResult.value;

    const btn = e.target.querySelector('button[type="submit"]');
    const prevText = btn.textContent;
    btn.textContent = 'Guardando...';
    btn.disabled = true;

    try {
        // Guardar progreso del usuario
        const progressDocId = `${userId}_${subjectId}`;
        await setDoc(doc(db, 'tasks', progressDocId), {
            user_id: userId,
            subject_id: subjectId,
            docente: docente,
            cuatrimestre: cuatrimestre,
            nota: nota,
            descripcion: descripcion
        }, { merge: true });

        // Si es admin, actualizar también los datos globales de la materia
        if (role === 'administrador') {
            const titulo = sanitizeText(document.getElementById('detailsTitle').value, 100);
            const anio = document.getElementById('detailsYear').value;

            if (!titulo) {
                showToast('El título de la materia es obligatorio.', 'error');
                btn.textContent = prevText;
                btn.disabled = false;
                return;
            }

            await updateDoc(doc(db, 'subjects', subjectId), {
                titulo: titulo,
                anio: anio
            });
        }

        // Solo cerrar y mostrar éxito si todo fue bien
        closeDetailsModal();
        showToast('Cambios guardados correctamente.', 'success');
    } catch (err) {
        console.error('Error guardando detalles:', err);
        showToast('Error al guardar los detalles.', 'error');
    } finally {
        btn.textContent = prevText;
        btn.disabled = false;
    }
}

async function deleteMateriaGlobal() {
    const subjectId = document.getElementById('detailsId').value;
    if (!subjectId) return;

    if (!await showConfirm('¿Estás seguro de que quieres eliminar esta materia de forma GLOBAL? Se borrará de la carrera para TODOS los usuarios.')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'subjects', subjectId));

        const qTasks = query(collection(db, 'tasks'), where('subject_id', '==', subjectId));
        const tasksSnapshot = await getDocs(qTasks);
        const batch = writeBatch(db);
        tasksSnapshot.forEach(d => {
            batch.delete(d.ref);
        });
        await batch.commit();

        closeDetailsModal();
        showToast('Materia eliminada globalmente con éxito.', 'success');
    } catch (err) {
        console.error("Error al eliminar materia global:", err);
        showToast("Error al eliminar la materia.", "error");
    }
}

// =======================
// CARGA INICIAL DE PLAN DE ESTUDIOS
// =======================
function openCareerModal() {
    if (careerModal) {
        careerModal.classList.add('show');
        loadCareersList();
    }
}
function closeCareerModal() {
    if (careerModal) careerModal.classList.remove('show');
}

window.openCareerModal = openCareerModal;
window.closeCareerModal = closeCareerModal;

// ====== GESTIÓN Y CARGA DINÁMICA DE CARRERAS ======
async function loadCareersList() {
    const container = document.getElementById('careersListContainer');
    const adminControls = document.getElementById('adminCareerControls');
    if (!container) return;

    container.innerHTML = '<p class="text-secondary">Cargando carreras...</p>';

    try {
        const querySnapshot = await getDocs(collection(db, 'careers'));
        container.innerHTML = '';

        if (role === 'administrador' && adminControls) {
            adminControls.style.display = 'block';
        }

        querySnapshot.forEach((docSnapshot) => {
            const career = docSnapshot.data();
            const careerId = docSnapshot.id;

            const div = document.createElement('div');
            div.style.cssText = "display: flex; gap: 0.5rem; align-items: center; width: 100%;";

            let buttonsHtml = '';
            if (role === 'administrador') {
                buttonsHtml = `
                    <button onclick="editCareer('${careerId}', '${escapeHTML(career.name)}')" class="btn-secondary" style="padding: 0.6rem 0.8rem; line-height: 1;" title="Editar Nombre"><i class="bi bi-pencil"></i></button>
                    <button onclick="deleteCareer('${careerId}')" class="btn-secondary" style="padding: 0.6rem 0.8rem; line-height: 1; color:#ef4444; border-color:rgba(239, 68, 68, 0.4);" title="Eliminar Carrera"><i class="bi bi-trash"></i></button>
                `;
            }

            div.innerHTML = `
                <button class="career-btn" style="flex-grow: 1; padding: 0.75rem 1rem;" onclick="selectCareer('${careerId}')">${escapeHTML(career.name)}</button>
                ${buttonsHtml}
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error("Error al cargar carreras:", err);
        container.innerHTML = '<p class="text-danger">Error al cargar carreras.</p>';
    }
}

async function selectCareer(careerId) {
    if (!await showConfirm('¿Seguro que quieres cambiar a este plan de estudios?')) return;

    try {
        await updateDoc(doc(db, 'users', userId), { career_id: careerId });
        localStorage.setItem('career_id', careerId);
        closeCareerModal();
        showToast('Plan de estudios seleccionado con éxito.', 'success');
    } catch (err) {
        console.error("Error al seleccionar carrera:", err);
        showToast('Error al seleccionar la carrera.', 'error');
    }
}

function openAddCareerModal() {
    document.getElementById('careerManageModalTitle').textContent = 'Agregar Carrera';
    document.getElementById('careerManageId').value = '';
    document.getElementById('careerManageName').value = '';
    if (careerManageModal) careerManageModal.classList.add('show');
}

function editCareer(careerId, currentName) {
    document.getElementById('careerManageModalTitle').textContent = 'Editar Carrera';
    document.getElementById('careerManageId').value = careerId;
    document.getElementById('careerManageName').value = currentName;
    if (careerManageModal) careerManageModal.classList.add('show');
}

function closeCareerManageModal() {
    if (careerManageModal) careerManageModal.classList.remove('show');
}

async function saveCareerManage(e) {
    e.preventDefault();
    if (role !== 'administrador') return;

    const careerId = document.getElementById('careerManageId').value;
    const name = sanitizeText(document.getElementById('careerManageName').value, 100);

    if (!name) {
        showToast('El nombre de la carrera es obligatorio.', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
        if (careerId) {
            await updateDoc(doc(db, 'careers', careerId), { name: name });
            showToast('Carrera actualizada con éxito.', 'success');
        } else {
            const newCareerRef = doc(collection(db, 'careers'));
            await setDoc(newCareerRef, { name: name });
            showToast('Carrera creada con éxito.', 'success');
        }
        closeCareerManageModal();
        loadCareersList();
    } catch (err) {
        console.error("Error al gestionar carrera:", err);
        showToast('Error al guardar la carrera.', 'error');
    } finally {
        btn.disabled = false;
    }
}

async function deleteCareer(careerId) {
    if (careerId === currentCareerId) {
        showToast('No puedes eliminar la carrera que tienes activa actualmente.', 'error');
        return;
    }
    if (!await showConfirm('¿Estás seguro de que quieres eliminar esta carrera y TODAS sus materias asociadas de forma permanente?')) return;

    try {
        const qSubjects = query(collection(db, 'subjects'), where('career_id', '==', careerId));
        const subjectsSnap = await getDocs(qSubjects);
        const batch = writeBatch(db);

        subjectsSnap.forEach(d => {
            batch.delete(d.ref);
        });

        batch.delete(doc(db, 'careers', careerId));
        await batch.commit();

        showToast('Carrera y materias eliminadas con éxito.', 'success');
        loadCareersList();
    } catch (err) {
        console.error("Error al eliminar carrera:", err);
        showToast('Error al eliminar la carrera.', 'error');
    }
}

window.selectCareer = selectCareer;
window.editCareer = editCareer;
window.deleteCareer = deleteCareer;
window.openAddCareerModal = openAddCareerModal;
window.closeCareerManageModal = closeCareerManageModal;

// ====== GESTIÓN Y ADICIÓN DE MATERIAS ======
async function openAddMateriaModal() {
    const modalEl = document.getElementById('addMateriaModal');
    const selectCareerEl = document.getElementById('addMateriaCareer');
    if (!modalEl || !selectCareerEl) return;

    selectCareerEl.innerHTML = '';
    try {
        const querySnapshot = await getDocs(collection(db, 'careers'));
        querySnapshot.forEach(d => {
            const c = d.data();
            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = c.name;
            if (d.id === currentCareerId) option.selected = true;
            selectCareerEl.appendChild(option);
        });
    } catch (err) {
        console.error("Error cargando carreras para nueva materia:", err);
    }

    document.getElementById('addMateriaForm').reset();
    if (currentCareerId) selectCareerEl.value = currentCareerId;

    modalEl.classList.add('show');
}

function closeAddMateriaModal() {
    const modalEl = document.getElementById('addMateriaModal');
    if (modalEl) modalEl.classList.remove('show');
}

async function saveNewMateria(e) {
    e.preventDefault();
    if (role !== 'administrador') return;

    const titulo = sanitizeText(document.getElementById('addMateriaTitle').value, 100);
    const anio = document.getElementById('addMateriaYear').value;
    const targetCareerId = document.getElementById('addMateriaCareer').value;

    if (!titulo || !targetCareerId) {
        showToast('El título y la carrera son requeridos.', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
        await addDoc(collection(db, 'subjects'), {
            career_id: targetCareerId,
            titulo: titulo,
            anio: anio
        });

        closeAddMateriaModal();
        showToast('Materia agregada globalmente con éxito.', 'success');
    } catch (err) {
        console.error("Error al guardar materia global:", err);
        showToast("Error al agregar la materia.", "error");
    } finally {
        btn.disabled = false;
    }
}

window.openAddMateriaModal = openAddMateriaModal;
window.closeAddMateriaModal = closeAddMateriaModal;

// ====== ACTUALIZACIÓN DE VISIBILIDAD DE BOTONES DEL TABLERO ======
function updateBoardTitleAndButtons() {
    const loadPlanBtn = document.getElementById('loadPlanBtn');
    const loadPlanBtnMobile = document.getElementById('loadPlanBtnMobile');

    // El botón de cargar plan se muestra solo si no hay materias cargadas (usuarios sin carrera aún)
    // Para admin siempre se muestra para poder gestionar carreras
    const showLoadBtn = (tasks.length === 0) || (role === 'administrador');

    if (loadPlanBtn) loadPlanBtn.style.display = showLoadBtn ? 'inline-block' : 'none';
    if (loadPlanBtnMobile) loadPlanBtnMobile.style.display = showLoadBtn ? 'flex' : 'none';
}
