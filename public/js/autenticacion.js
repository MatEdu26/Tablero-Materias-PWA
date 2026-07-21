import { auth, db } from './conexion-firebase.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.7.0/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/11.7.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const errorMsg = document.getElementById('errorMsg');
    const submitBtn = document.getElementById('submitBtn');

    // Redirigir a index si ya tiene sesión activa
    if (localStorage.getItem('token')) {
        auth.onAuthStateChanged(user => {
            if (user) {
                window.location.href = 'index.html';
            } else {
                localStorage.clear();
            }
        });
    }

    // Mostrar modal de éxito personalizado
    function showSuccessModal(message, onClose) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn 0.2s ease';
        overlay.innerHTML = `
            <div style="background:#1e293b;color:#f1f5f9;border-radius:1rem;padding:2rem 2.5rem;text-align:center;max-width:360px;box-shadow:0 20px 40px rgba(0,0,0,0.5);animation:zoomIn 0.25s ease">
                <div style="font-size:2.5rem;margin-bottom:0.75rem">✅</div>
                <p style="margin:0;font-size:1rem;font-weight:600;line-height:1.6">${message}</p>
            </div>`;
        document.body.appendChild(overlay);
        setTimeout(() => {
            overlay.remove();
            if (onClose) onClose();
        }, 2000);
    }

    function showError(message) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = submitBtn.dataset.originalText || 'Ingresar';
        }
    }

    function getAuthErrorMessage(error) {
        if (!error || !error.code) return error?.message || 'Ocurrió un error inesperado';
        switch (error.code) {
            case 'auth/wrong-password':
                return 'La contraseña es incorrecta.';
            case 'auth/user-not-found':
                return 'No existe una cuenta con ese correo.';
            case 'auth/invalid-email':
                return 'El correo ingresado no es válido.';
            case 'auth/email-already-in-use':
                return 'El correo ya está registrado.';
            case 'auth/weak-password':
                return 'La contraseña debe tener al menos 6 caracteres.';
            case 'auth/too-many-requests':
                return 'Demasiados intentos fallidos. Intenta más tarde.';
            case 'auth/unauthorized-domain':
                return 'Dominio no autorizado. Agrega localhost en Firebase.';
            default:
                return error.message || 'Ocurrió un error inesperado';
        }
    }

    // Manejar el proceso de Autenticación
    async function handleAuth(type, e) {
        e.preventDefault();
        
        const emailInput = document.getElementById('email');
        const usuarioInput = document.getElementById('username');
        const contrasenaInput = document.getElementById('password');
        
        const email = emailInput ? emailInput.value.trim() : '';
        const usuario = usuarioInput ? usuarioInput.value.trim() : '';
        const contrasena = contrasenaInput ? contrasenaInput.value : '';
        
        if (!contrasena || !email || (type === 'registro' && !usuario)) {
            showError('Por favor completa todos los campos.');
            return;
        }

        if (type === 'registro' && contrasena.length < 6) {
            showError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        if (submitBtn) {
            submitBtn.dataset.originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = 'Cargando...';
            submitBtn.disabled = true;
        }
        errorMsg.style.display = 'none';

        try {
            if (type === 'login') {
                let userCredential;
                
                try {
                    // Intentar iniciar sesión
                    userCredential = await signInWithEmailAndPassword(auth, email, contrasena);
                } catch (error) {
                    // Auto-creación de cuenta Admin si falla y son las credenciales por defecto
                    if (email === 'admin@tablero.com' && contrasena === 'bAss1' && 
                        (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-email')) {
                        try {
                            userCredential = await createUserWithEmailAndPassword(auth, 'admin@tablero.com', 'bAss1');
                            const uid = userCredential.user.uid;
                            // Registrar admin en Firestore
                            await setDoc(doc(db, 'users', uid), {
                                uid: uid,
                                username: 'mAtiAs',
                                email: 'admin@tablero.com',
                                role: 'administrador'
                            });
                        } catch (createErr) {
                            throw new Error('Credenciales inválidas de administrador.');
                        }
                    } else {
                        // Traducir algunos errores comunes de Firebase
                        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                            throw new Error('Credenciales inválidas. Por favor verifica tu correo y contraseña.');
                        } else if (error.code === 'auth/invalid-email') {
                            throw new Error('El correo ingresado no es válido.');
                        } else if (error.code === 'auth/unauthorized-domain') {
                            throw new Error('Dominio no autorizado. Agrega localhost a los dominios autorizados en Firebase.');
                        } else if (error.code === 'auth/too-many-requests') {
                            throw new Error('Demasiados intentos fallidos. Intenta de nuevo más tarde.');
                        } else {
                            throw new Error(error.message);
                        }
                    }
                }

                // Obtener datos complementarios de usuario de Firestore
                const uid = userCredential.user.uid;
                const userDoc = await getDoc(doc(db, 'users', uid));
                
                let nombreUsuario = email.split('@')[0];
                let rolUsuario = 'usuario';

                if (userDoc.exists()) {
                    nombreUsuario = userDoc.data().username || nombreUsuario;
                    rolUsuario = userDoc.data().role || rolUsuario;
                } else {
                    // Si por algún motivo no existe su documento en Firestore, lo creamos
                    await setDoc(doc(db, 'users', uid), {
                        uid: uid,
                        username: nombreUsuario,
                        email: email,
                        role: 'usuario'
                    });
                }

                // Guardar datos en LocalStorage para consistencia en la PWA
                localStorage.setItem('token', userCredential.user.accessToken || 'firebase-session');
                localStorage.setItem('userId', uid);
                localStorage.setItem('username', nombreUsuario);
                localStorage.setItem('role', rolUsuario);
                
                window.location.href = 'index.html';
                
            } else if (type === 'registro') {
                // Registrar usuario nuevo en Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, email, contrasena);
                const uid = userCredential.user.uid;

                // Crear perfil del usuario en la colección users de Firestore
                await setDoc(doc(db, 'users', uid), {
                    uid: uid,
                    username: usuario,
                    email: email,
                    role: 'usuario'
                });

                // Firebase auto-loguea después de registrar, cerramos sesión para seguir el flujo original
                await signOut(auth);
                localStorage.clear();

                showSuccessModal('¡Registro exitoso! Por favor iniciá sesión.', () => {
                    window.location.href = 'login.html';
                });
            }

        } catch (error) {
            console.error('Error en autenticación:', error);
            showError(getAuthErrorMessage(error));
        }
    }

    // Configurar validaciones visuales personalizadas
    function setupFormValidation(form, type) {
        if (!form) return;
        
        const inputs = form.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                input.setCustomValidity('');
                if (!input.validity.valid) {
                    input.style.borderColor = '#ef4444';
                } else {
                    input.style.borderColor = '#22c55e';
                }
            });

            input.addEventListener('invalid', () => {
                if (input.validity.valueMissing) {
                    input.setCustomValidity('Este campo es obligatorio, no lo dejes vacío.');
                } else if (input.validity.typeMismatch) {
                    input.setCustomValidity('El formato ingresado no es válido.');
                } else if (input.validity.tooShort) {
                    input.setCustomValidity(`Debe tener al menos ${input.minLength} caracteres.`);
                }
                input.style.borderColor = '#ef4444';
            });
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (form.checkValidity()) {
                handleAuth(type, e);
            }
        });
    }

    setupFormValidation(loginForm, 'login');
    setupFormValidation(registerForm, 'registro');
});
