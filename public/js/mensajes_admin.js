import { auth, db } from './conexion-firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-auth.js";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('username');

    if (!token || role !== 'administrador') {
        window.location.href = 'index.html';
        return;
    }

    if (username) {
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

    window.addEventListener('offline', () => showToast('Sin conexión a internet. Las respuestas se guardarán localmente y se enviarán automáticamente al restablecer la red.', 'warning'));
    window.addEventListener('online', () => showToast('Conexión reestablecida. Respuestas sincronizadas con éxito.', 'success'));

    // Formulario de respuesta
    const replyForm = document.getElementById('replyForm');
    if (replyForm) {
        replyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgId = document.getElementById('replyMsgId').value;
            const replyText = document.getElementById('replyText').value.trim();
            const submitBtn = document.getElementById('replySubmitBtn');
            
            if (!msgId || !replyText) return;

            if (!navigator.onLine) {
                showToast('Sin conexión. No se pudo enviar la respuesta en este momento.', 'warning');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Enviando...';
            
            try {
                await updateDoc(doc(db, 'messages', msgId), {
                    reply: replyText,
                    replied_at: new Date().toISOString()
                });
                showToast('Respuesta enviada correctamente.', 'success');
                closeReplyModal();
            } catch (err) {
                console.error('Error al responder mensaje:', err);
                showToast('Error al enviar la respuesta.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Enviar Respuesta';
            }
        });
    }

    // Iniciar escucha de mensajes en tiempo real
    escucharMensajes();
});

let canceladorEscucha = null;

// Escuchar los mensajes en tiempo real desde Firestore
function escucharMensajes() {
    const container = document.getElementById('messagesList');
    if (!container) return;

    const consulta = query(collection(db, 'messages'));

    if (canceladorEscucha) {
        canceladorEscucha();
    }

    canceladorEscucha = onSnapshot(consulta, (querySnapshot) => {
        const mensajes = querySnapshot.docs
            .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() }))
            .sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateA - dateB;
            });

        if (mensajes.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-inbox text-secondary" style="font-size: 3rem;"></i>
                    <p class="mt-3 text-secondary">No hay mensajes nuevos en la bandeja.</p>
                </div>`;
            return;
        }

        container.innerHTML = '';
        mensajes.forEach(msgData => {
            const msg = msgData;
            const id = msgData.id;
            const card = document.createElement('div');
            card.className = 'col-12 col-md-6 col-lg-4';
            
            const colorMap = {
                'Sugerencia': { color: '#f59e0b', icon: 'bi-lightbulb' },
                'Consulta': { color: '#3b82f6', icon: 'bi-question-circle' },
                'Contacto': { color: '#10b981', icon: 'bi-person-badge' }
            };
            const type = colorMap[msg.subject] || { color: '#64748b', icon: 'bi-chat-left' };

            let fecha = 'Fecha no disponible';
            if (msg.created_at) {
                fecha = new Date(msg.created_at).toLocaleString();
            }

            card.innerHTML = `
                <div class="auth-card h-100 d-flex flex-column" style="padding: 1.5rem; border-top: 4px solid ${type.color};">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <span class="badge" style="background-color: ${type.color}20; color: ${type.color}; border: 1px solid ${type.color}40;">
                            <i class="bi ${type.icon} me-1"></i>${msg.subject}
                        </span>
                        <button onclick="deleteMessage('${id}')" class="btn btn-link p-0 text-secondary hover-danger" title="Eliminar">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                    <h5 class="mb-1">${escapeHTML(msg.username)}</h5>
                    <p class="text-secondary mb-3" style="font-size: 0.75rem;"><i class="bi bi-clock me-1"></i>${fecha}</p>
                    <div class="p-2 rounded flex-grow-1" style="background-color: rgba(0,0,0,0.2); font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap;">${escapeHTML(msg.message)}</div>
                    <div class="reply-section mt-3"></div>
                </div>
            `;

            const replySection = card.querySelector('.reply-section');
            if (msg.reply) {
                const replyDate = msg.replied_at ? new Date(msg.replied_at).toLocaleString() : '';
                replySection.innerHTML = `
                    <div class="p-2 rounded border border-primary-subtle text-start" style="background-color: rgba(59, 130, 246, 0.08); font-size: 0.85rem; color: var(--text-primary);">
                        <div class="d-flex justify-content-between align-items-center mb-1 text-primary" style="font-size: 0.75rem; font-weight: 700;">
                            <span>Respuesta:</span>
                            <span>${replyDate}</span>
                        </div>
                        <div style="white-space: pre-wrap;">${escapeHTML(msg.reply)}</div>
                        <div class="text-end mt-2">
                            <button class="btn btn-link p-0 text-primary btn-edit-reply" style="font-size: 0.75rem; text-decoration: none;">Editar</button>
                        </div>
                    </div>
                `;
                replySection.querySelector('.btn-edit-reply').addEventListener('click', () => {
                    openReplyDialog(id, msg.username, msg.message, msg.reply);
                });
            } else {
                replySection.innerHTML = `
                    <div class="text-end">
                        <button class="btn btn-outline-primary btn-sm btn-reply"><i class="bi bi-reply me-1"></i>Responder</button>
                    </div>
                `;
                replySection.querySelector('.btn-reply').addEventListener('click', () => {
                    openReplyDialog(id, msg.username, msg.message, '');
                });
            }
            container.appendChild(card);
        });
    }, (error) => {
        console.error('Error escuchando mensajes:', error);
        container.innerHTML = '<p class="text-danger text-center">Error al cargar los mensajes desde la base de datos.</p>';
    });
}

// Función manual de refresco
function loadMessages() {
    escucharMensajes();
    showToast('Buzón actualizado.', 'success');
}

// Eliminar mensaje de Firestore
async function deleteMessage(id) {
    if (!navigator.onLine) {
        showToast('No puedes eliminar mensajes sin conexión a internet.', 'error');
        return;
    }
    if (!await showConfirm('¿Estás seguro de que quieres eliminar este mensaje?')) return;

    try {
        await deleteDoc(doc(db, 'messages', id));
        showToast('Mensaje eliminado correctamente', 'success');
    } catch (error) {
        console.error('Error al eliminar mensaje:', error);
        showToast('Error al eliminar el mensaje', 'error');
    }
}

// Exportar a window para los eventos inline de los botones HTML
window.loadMessages = loadMessages;
window.deleteMessage = deleteMessage;

function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const msgEl = document.getElementById('confirmMessage');
        const btnOk = document.getElementById('confirmOk');
        const btnCancel = document.getElementById('confirmCancel');

        msgEl.textContent = message;
        modal.classList.add('show');

        const onOk = () => { modal.classList.remove('show'); resolve(true); };
        const onCancel = () => { modal.classList.remove('show'); resolve(false); };

        btnOk.onclick = onOk;
        btnCancel.onclick = onCancel;
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const box = document.getElementById('toastBox');
    if (!container || !box) return;
    const c = type === 'success' ? { bg: '#22c55e', icon: '✅' } : type === 'warning' ? { bg: '#f59e0b', icon: '⚠️' } : { bg: '#ef4444', icon: '❌' };
    box.style.background = c.bg;
    box.innerHTML = `<span class="me-2">${c.icon}</span><span>${message}</span>`;
    container.style.display = 'flex';
    setTimeout(() => { container.style.display = 'none'; }, 3000);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

const replyModal = document.getElementById('replyModal');

function openReplyDialog(id, user, originalText, currentReply = '') {
    document.getElementById('replyMsgId').value = id;
    document.getElementById('replyUser').value = user;
    document.getElementById('replyOriginal').textContent = originalText;
    document.getElementById('replyText').value = currentReply;
    if (replyModal) replyModal.classList.add('show');
}

function closeReplyModal() {
    if (replyModal) replyModal.classList.remove('show');
}

window.addEventListener('click', (event) => {
    if (event.target === replyModal) closeReplyModal();
});

window.openReplyDialog = openReplyDialog;
window.closeReplyModal = closeReplyModal;
