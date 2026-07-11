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
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.7.0/firebase-firestore.js";

// Verificación de autenticación en local
const token = localStorage.getItem('token');
const username = localStorage.getItem('username');
const role = localStorage.getItem('role');
const userId = localStorage.getItem('userId');

if (!token) {
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Saludo de Usuario en header
    const userGreeting = document.getElementById('userGreeting');
    if (userGreeting && username) userGreeting.textContent = username;

    // 2. Control de accesos y visibilidad según ROL (RBAC)
    if (role === 'administrador') {
        const navAdmin = document.getElementById('navMensajes');
        const navAdminMobile = document.getElementById('navMensajesMobile');
        const navUsers = document.getElementById('navUsuarios');
        const navUsersMobile = document.getElementById('navUsuariosMobile');

        if (navAdmin) navAdmin.style.display = 'inline-flex';
        if (navAdminMobile) navAdminMobile.style.display = 'flex';
        if (navUsers) navUsers.style.display = 'inline-flex';
        if (navUsersMobile) navUsersMobile.style.display = 'flex';

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

    // 4. Iniciar escucha en tiempo real de las materias del usuario
    escucharMaterias();
});

let tasks = [];
let canceladorMaterias = null;

// Escucha las materias en tiempo real desde Firestore
function escucharMaterias() {
    if (!userId) return;

    const consulta = query(collection(db, 'tasks'), where('user_id', '==', userId));

    if (canceladorMaterias) {
        canceladorMaterias();
    }

    canceladorMaterias = onSnapshot(consulta, (querySnapshot) => {
        tasks = [];
        querySnapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            tasks.push({
                id: docSnapshot.id,
                titulo: data.titulo,
                estado: data.estado,
                anio: data.anio,
                docente: data.docente,
                cuatrimestre: data.cuatrimestre,
                nota: data.nota,
                descripcion: data.descripcion
            });
        });
        renderBoards();
    }, (error) => {
        console.error("Error escuchando materias de Firestore:", error);
    });
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
window.addEventListener('online', () => showToast('Conexión reestablecida. Base de datos sincronizada.', 'success'));
window.addEventListener('offline', () => showToast('Modo offline activado. Los cambios se guardarán localmente.', 'info'));

// =======================
// NOTIFICACIONES (Toast y Confirm)
// =======================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const box = document.getElementById('toastBox');
    if (!container || !box) return;

    const colors = {
        success: { bg: '#22c55e', icon: '✅' },
        error: { bg: '#ef4444', icon: '❌' },
        info: { bg: '#3b82f6', icon: 'ℹ️' },
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

    tasks.forEach(task => {
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

// Crear tarjeta de materia
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
        // Crear un hash simple a partir del id (string de Firebase doc) para el color de respaldo
        let sum = 0;
        for (let i = 0; i < task.id.length; i++) sum += task.id.charCodeAt(i);
        cardColor = fallbackColors[sum % fallbackColors.length];
    }

    card.style.backgroundColor = cardColor;
    card.style.borderColor = cardColor;

    // Al hacer click, abrir modal de detalles
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

    // Calcular promedio automático de materias aprobadas con nota
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
        const careerName = document.getElementById('boardTitle')?.textContent || 'tu carrera';
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
                const taskId = itemEl.id.replace('task-', '');

                const taskIndex = tasks.findIndex(t => t.id == taskId);
                if (taskIndex > -1 && tasks[taskIndex].estado !== newStatus) {
                    tasks[taskIndex].estado = newStatus;

                    // Actualizar UI localmente de forma optimista
                    updateBoardCounters();
                    updateProgressBar();

                    try {
                        // Guardar nuevo estado directamente en Firestore (el SDK gestiona el offline de forma automática)
                        await updateDoc(doc(db, 'tasks', taskId), { estado: newStatus });
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
        // Consultar todos los usuarios en la colección
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

// Vincular funciones del panel administrativo a window para llamadas inline de HTML
window.openUsersModal = openUsersModal;
window.closeUsersModal = closeUsersModal;
window.changeUserRole = changeUserRole;
window.deleteUser = deleteUser;

// =======================
// LÓGICA MODALES (CARRERA Y DETALLES)
// =======================
const careerModal = document.getElementById('careerModal');
const detailsModal = document.getElementById('detailsModal');

window.onclick = function (event) {
    if (event.target === careerModal) closeCareerModal();
    if (event.target === detailsModal) closeDetailsModal();
    if (event.target === usersModal) closeUsersModal();
}

function openDetailsModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('detailsModalTitle').textContent = task.titulo;
    document.getElementById('detailsId').value = task.id;
    document.getElementById('detailsTeacher').value = task.docente || '';
    document.getElementById('detailsTerm').value = task.cuatrimestre || '';
    document.getElementById('detailsGrade').value = task.nota || '';
    document.getElementById('detailsDesc').value = task.descripcion || '';

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
    const taskId = document.getElementById('detailsId').value;
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
        // Guardar detalles directamente en Firestore
        await updateDoc(doc(db, 'tasks', taskId), {
            docente: docente,
            cuatrimestre: cuatrimestre,
            nota: nota,
            descripcion: descripcion
        });

        // Actualizar localmente de manera optimista
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex > -1) {
            tasks[taskIndex].docente = docente;
            tasks[taskIndex].cuatrimestre = cuatrimestre;
            tasks[taskIndex].nota = nota;
            tasks[taskIndex].descripcion = descripcion;
        }

        renderBoards();
        closeDetailsModal();
        showToast('Detalles guardados correctamente.', 'success');
    } catch (err) {
        console.error('Error guardando detalles en Firestore:', err);
        showToast('Error al guardar los detalles.', 'error');
    } finally {
        btn.textContent = prevText;
        btn.disabled = false;
    }
}

// =======================
// CARGA INICIAL DE PLAN DE ESTUDIOS
// =======================
function openCareerModal() {
    if (careerModal) careerModal.classList.add('show');
}
function closeCareerModal() {
    if (careerModal) careerModal.classList.remove('show');
}

window.openCareerModal = openCareerModal;
window.closeCareerModal = closeCareerModal;

// Planes de estudio cargados en cliente
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

async function loadStudyPlan(careerId, buttonEl) {
    if (!await showConfirm('¿Seguro que quieres precargar este plan de estudios?')) return;

    const tasksToInsert = studyPlans[careerId];
    if (!tasksToInsert) return;

    const buttons = document.querySelectorAll('.career-btn');
    let originalHtml = '';

    if (buttonEl) {
        originalHtml = buttonEl.innerHTML;
        buttonEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Cargando plan...';
    }
    buttons.forEach(btn => btn.disabled = true);

    try {
        const batch = writeBatch(db);
        const collectionRef = collection(db, 'tasks');

        tasksToInsert.forEach((m) => {
            // Crear una nueva referencia de documento con id auto-generado
            const docRef = doc(collectionRef);
            batch.set(docRef, {
                user_id: userId,
                titulo: m.titulo,
                estado: 'Materias',
                anio: m.anio,
                docente: '',
                cuatrimestre: '',
                nota: '',
                descripcion: ''
            });
        });

        // Confirmar la transacción
        await batch.commit();

        closeCareerModal();
        showToast('Plan de estudios precargado con éxito.', 'success');
    } catch (err) {
        console.error('Error precargando plan en Firestore:', err);
        showToast('Error al guardar el plan de estudios en la base de datos.', 'error');
    } finally {
        buttons.forEach(btn => btn.disabled = false);
        if (buttonEl && originalHtml) {
            buttonEl.innerHTML = originalHtml;
        }
    }
}

window.loadStudyPlan = loadStudyPlan;

function updateBoardTitleAndButtons() {
    const titleEl = document.getElementById('boardTitle');
    const loadPlanBtn = document.getElementById('loadPlanBtn');
    const loadPlanBtnMobile = document.getElementById('loadPlanBtnMobile');
    if (!titleEl) return;

    const logoHtml = '<img src="img/logo_azul.png" alt="Logo" style="height: 32px; width: 32px; object-fit: cover; border-radius: 4px;">';
    let titleText = 'Tablero de Materias';

    if (tasks.length === 0) {
        titleText = 'Kanban Universitaria';
        if (loadPlanBtn) loadPlanBtn.style.display = 'inline-block';
        if (loadPlanBtnMobile) loadPlanBtnMobile.style.display = 'flex';
    } else {
        if (loadPlanBtn) loadPlanBtn.style.display = 'none';
        if (loadPlanBtnMobile) loadPlanBtnMobile.style.display = 'none';

        const titles = tasks.map(t => t.titulo);
        if (titles.includes('Teoría de Sistemas y Organizaciones')) titleText = 'Licenciatura en Informática';
        else if (titles.includes('Programación Web 1')) titleText = 'Tecnicatura en Tecnologías Web';
        else if (titles.includes('Circuitos Electrónicos')) titleText = 'Tecnicatura en Redes';
        else titleText = 'Mis Materias';
    }
    titleEl.innerHTML = `${logoHtml} ${titleText}`;
}
