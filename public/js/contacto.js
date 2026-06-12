import { auth, db } from './conexion-firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-auth.js";
import { collection, addDoc, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.7.0/firebase-firestore.js";

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

            showToast('¡Mensaje enviado! Gracias por contactarnos.', 'success');
            contactForm.reset();
            if (username) {
                document.getElementById('contactName').value = username;
            }
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
                where('user_id', '==', userId),
                orderBy('created_at', 'desc')
            );

            onSnapshot(q, (snapshot) => {
                if (snapshot.empty) {
                    consultasContainer.style.display = 'none';
                    return;
                }

                consultasContainer.style.display = 'block';
                consultasList.innerHTML = '';

                snapshot.forEach((docSnapshot) => {
                    const data = docSnapshot.data();
                    const card = document.createElement('div');
                    card.className = 'consulta-card';

                    const dateStr = data.created_at ? new Date(data.created_at).toLocaleString() : 'Fecha no disponible';

                    const subjectBadges = {
                        'Sugerencia': 'bg-warning-subtle text-warning border border-warning-subtle',
                        'Consulta': 'bg-primary-subtle text-primary border border-primary-subtle',
                        'Contacto': 'bg-success-subtle text-success border border-success-subtle'
                    };
                    const badgeClass = subjectBadges[data.subject] || 'bg-secondary-subtle text-secondary';

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
                            <span class="consulta-badge ${badgeClass}">${escapeHTML(data.subject)}</span>
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
        error:   { bg: '#ef4444', icon: '❌' }
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
