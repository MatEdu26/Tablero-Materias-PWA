import { auth, db } from './conexion-firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-auth.js";
import { collection, addDoc, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-firestore.js";

const PENDING_CONTACT_MESSAGES_KEY = 'pendingContactMessages';

function readPendingMessages() {
    try {
        const stored = localStorage.getItem(PENDING_CONTACT_MESSAGES_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.warn('No se pudieron leer los mensajes pendientes:', error);
        return [];
    }
}

function savePendingMessages(messages) {
    localStorage.setItem(PENDING_CONTACT_MESSAGES_KEY, JSON.stringify(messages));
}

async function syncPendingMessages(userIdValue, usernameValue) {
    if (!navigator.onLine || !userIdValue) return;

    const pendingMessages = readPendingMessages().filter(item => item.user_id === userIdValue);
    if (!pendingMessages.length) return;

    const remainingMessages = [];

    for (const item of pendingMessages) {
        try {
            await addDoc(collection(db, 'messages'), {
                user_id: item.user_id,
                username: item.username || 'Alumno',
                subject: item.subject,
                message: item.message,
                created_at: item.created_at,
                pending_sync: false
            });
        } catch (error) {
            console.warn('No se pudo sincronizar un mensaje pendiente:', error);
            remainingMessages.push(item);
        }
    }

    savePendingMessages(readPendingMessages().filter(item => item.user_id !== userIdValue || remainingMessages.some(remaining => remaining.id === item.id)));
    if (remainingMessages.length === 0) {
        showToast('Tus mensajes pendientes se enviaron correctamente.', 'success');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Pre-cargar nombre de usuario
    if (username) {
        document.getElementById('contactName').value = username;
        document.getElementById('userGreeting').textContent = username;
    }

    // Botón de Cerrar Sesión
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch (e) {
            console.warn('Error al cerrar sesión en Firebase:', e);
        }
        localStorage.clear();
        window.location.href = 'login.html';
    });

    window.addEventListener('offline', () => showToast('Sin conexión. Tu mensaje se guardará localmente y se enviará automáticamente en cuanto vuelva la red.', 'warning'));
    window.addEventListener('online', () => {
        showToast('Conexión reestablecida. Sincronizando mensajes...', 'success');
        syncPendingMessages(userId, username);
    });

    if (!navigator.onLine) {
        showToast('Sin conexión. Tu mensaje se guardará localmente y se enviará automáticamente en cuanto vuelva la red.', 'warning');
    } else {
        syncPendingMessages(userId, username);
    }

    const contactForm = document.getElementById('contactForm');
    const sendBtn = document.getElementById('sendBtn');

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Limpiar inputs básicos contra XSS básico
        const limpiarTexto = (texto) => texto.replace(/<[^>]*>?/gm, '').trim();

        const asuntoRaw = document.getElementById('contactSubject').value;
        const mensajeRaw = document.getElementById('contactMessage').value;

        const asunto = limpiarTexto(asuntoRaw);
        const mensaje = limpiarTexto(mensajeRaw);

        if (!asunto || !mensaje) {
            showToast('Asunto y mensaje son obligatorios', 'error');
            return;
        }

        if (!navigator.onLine) {
            const pendingMessages = readPendingMessages();
            pendingMessages.unshift({
                id: `pending-${Date.now()}`,
                user_id: userId,
                username: username || 'Alumno',
                subject: asunto,
                message: mensaje,
                created_at: new Date().toISOString(),
                pending: true
            });
            savePendingMessages(pendingMessages);
            showToast('Sin conexión. Tu mensaje fue guardado localmente y se enviará automáticamente en cuanto vuelva la red.', 'warning');
            contactForm.reset();
            if (username) {
                document.getElementById('contactName').value = username;
            }
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
            return;
        }

        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enviando...';

        try {
            // Guardar el mensaje en Firestore directamente
            await addDoc(collection(db, 'messages'), {
                user_id: userId,
                username: username || 'Alumno',
                subject: asunto,
                message: mensaje,
                created_at: new Date().toISOString()
            });

            showToast('¡Mensaje enviado con éxito! Redirigiendo al tablero...', 'success');
            contactForm.reset();
            if (username) {
                document.getElementById('contactName').value = username;
            }
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        } catch (error) {
            console.error('Error al enviar mensaje:', error);
            showToast('Error al enviar el mensaje. Intenta de nuevo.', 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="bi bi-send me-2"></i>Enviar Mensaje';
        }
    });

    // Cargar consultas previas del usuario en tiempo real al iniciar
    if (userId) {
        const consultasContainer = document.getElementById('misConsultasContainer');
        const consultasList = document.getElementById('consultasList');

        if (consultasContainer && consultasList) {
            const q = query(
                collection(db, 'messages'),
                where('user_id', '==', userId)
            );

            onSnapshot(q, (snapshot) => {
                const mensajesFirestore = snapshot.docs
                    .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
                    .filter(item => item.user_id === userId);

                const mensajesPendientes = readPendingMessages()
                    .filter(item => item.user_id === userId)
                    .map(item => ({ ...item, pending: true }));

                const mensajes = [...mensajesPendientes, ...mensajesFirestore]
                    .sort((a, b) => {
                        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                        return dateB - dateA;
                    });

                if (mensajes.length === 0) {
                    consultasContainer.style.display = 'none';
                    return;
                }

                consultasContainer.style.display = 'block';
                consultasList.innerHTML = '';

                mensajes.forEach((data) => {
                    const card = document.createElement('div');
                    card.className = 'consulta-card';

                    const dateStr = data.created_at ? new Date(data.created_at).toLocaleString() : 'Fecha no disponible';

                    const subjectBadges = {
                        'Sugerencia': 'bg-warning-subtle text-warning border border-warning-subtle',
                        'Consulta': 'bg-primary-subtle text-primary border border-primary-subtle',
                        'Contacto': 'bg-success-subtle text-success border border-success-subtle'
                    };
                    const badgeClass = subjectBadges[data.subject] || 'bg-secondary-subtle text-secondary';
                    const statusBadge = data.pending
                        ? '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">En espera</span>'
                        : data.reply
                            ? '<span class="badge bg-success-subtle text-success border border-success-subtle">Respondido</span>'
                            : '<span class="badge bg-secondary-subtle text-secondary">Pendiente</span>';

                    let replyHtml = '';
                    if (data.reply) {
                        const replyDate = data.replied_at ? new Date(data.replied_at).toLocaleString() : '';
                        replyHtml = `
                            <div class="consulta-reply-box">
                                <div class="consulta-reply-header">
                                    <span>Respuesta del Admin</span>
                                    <span>${replyDate}</span>
                                </div>
                                <div class="consulta-reply-body">${escapeHTML(data.reply)}</div>
                            </div>
                        `;
                    }

                    card.innerHTML = `
                        <div class="consulta-meta">
                            <div class="d-flex align-items-center gap-2">
                                <span class="consulta-badge ${badgeClass}">${escapeHTML(data.subject)}</span>
                                ${statusBadge}
                            </div>
                            <span>${dateStr}</span>
                        </div>
                        <div class="consulta-body">${escapeHTML(data.message)}</div>
                        ${replyHtml}
                    `;
                    consultasList.appendChild(card);
                });
            }, (error) => {
                console.warn('Error al cargar consultas:', error);
            });
        }
    }
});

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const box = document.getElementById('toastBox');
    if (!container || !box) return;

    const colors = {
        success: { bg: '#22c55e', icon: '✅' },
        error:   { bg: '#ef4444', icon: '❌' },
        warning: { bg: '#f59e0b', icon: '⚠️' }
    };
    const c = colors[type] || colors.success;

    box.style.background = c.bg;
    box.innerHTML = `<span style="font-size:1.5rem;">${c.icon}</span><span>${message}</span>`;
    container.style.display = 'flex';

    setTimeout(() => {
        container.style.display = 'none';
    }, 3000);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}
