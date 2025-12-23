
const FIREBASE_ENABLED = true;
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBOCwXXEmo11gCoye0e00HnEmc2OrFXiPQ",
  authDomain: "boda-ingrid-antonio.firebaseapp.com",
  projectId: "boda-ingrid-antonio",
  storageBucket: "boda-ingrid-antonio.firebasestorage.app",
  messagingSenderId: "800504705866",
  appId: "1:800504705866:web:75499c8d471e95a080c7b3"
};

// Identificador del evento (sirve para separar bodas)
const EVENT_ID = "boda-ingrid-antonio";
const PHOTOS_COLLECTION = `photos_${EVENT_ID}`;  // colección única para este evento


// ====== Cloudinary ======
const CLOUDINARY_CLOUD_NAME = "dauzwfc8z";
const CLOUDINARY_UPLOAD_PRESET = "boda_ingrid_antonio";
const CLOUDINARY_FOLDER = "boda-ingrid-antonio";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// ========= CONFIGURACIÓN ADMIN (UI) =========

const ADMIN_PASSWORD = "admin123";

// Lista de emails con permisos de administrador
const ADMIN_EMAILS = ["pereiraanngy@gmail.com"];

let isAdminMode = false;

// ========= VARIABLES GLOBALES GALERÍA =========
let allPhotos = [];
let displayedPhotos = [];
let showingAll = false;
const PHOTOS_PER_PAGE = 12;

// ========= NAV responsive =========
const navToggle = document.querySelector('.nav-toggle');
const menu = document.getElementById('menu');
if (navToggle && menu) {
  navToggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  }, { passive: true });
}

// ========= Utilidades =========
function dataURLtoBlob(dataUrl){
  const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
  while(n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}

function compressImage(file, { maxSize = 1600, quality = 0.85 } = {}){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const scale = Math.min(1, maxSize / Math.max(width, height));
      width = Math.round(width * scale); height = Math.round(height * scale);
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.readAsDataURL(file);
  });
}

// ========= Función para descargar imagen =========
async function downloadImage(url, filename = 'foto-boda.jpg') {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Error descargando imagen:', error);
    window.open(url, '_blank');
  }
}

// ========= Firebase (Auth + Firestore) =========
let fb = { usingFirebase: false };
(function initFirebase(){
  if (!FIREBASE_ENABLED) return;
  if (!FIREBASE_CONFIG.apiKey) { console.warn('Falta FIREBASE_CONFIG. Usando modo local.'); return; }
  try {
    fb.app = firebase.initializeApp(FIREBASE_CONFIG);
    fb.auth = firebase.auth();
    fb.db = firebase.firestore();
    fb.usingFirebase = true;

    // Invitados: sesión anónima para poder subir.
    fb.auth.signInAnonymously().catch(console.error);

    // Observa cambios de sesión para ajustar UI de admin
    fb.auth.onAuthStateChanged((user) => {
      const isAdminUser = !!(user && !user.isAnonymous && ADMIN_EMAILS.includes(user.email || ''));
      if (!isAdminUser && isAdminMode) {
        isAdminMode = false;
        showNotification('Sesión no admin. Modo administrador desactivado.', 'info');
        renderGallery();
      }
      updateGalleryControls();
    });

  } catch (err) {
    console.error('Firebase init error', err);
    fb.usingFirebase = false;
  }
})();

// ========= Galería mejorada =========
const galleryEl = document.getElementById('gallery');
const galleryHint = document.getElementById('gallery-hint') || { textContent: '' };
const btnMore = document.getElementById('btn-more');
let photosLocal = JSON.parse(localStorage.getItem('guest_photos') || '[]').map((url, index) => ({
  url,
  id: `local_${index}`,
  isLocal: true
}));

// ========= Modo Admin =========
async function toggleAdminMode() {
  if (!fb.usingFirebase) {
    showNotification('Activa Firebase para usar el modo admin', 'error');
    return;
  }

  if (isAdminMode) {
    isAdminMode = false;
    updateGalleryControls();
    renderGallery();
    showNotification('Modo administrador desactivado', 'info');
    return;
  }

  // Primero pide la contraseña UI
  const password = prompt("Ingresa la contraseña de administrador de la página:");
  if (password !== ADMIN_PASSWORD) {
    if (password !== null) showNotification("Contraseña incorrecta", 'error');
    return;
  }

  const u = fb.auth.currentUser;
  const alreadyAdmin = u && !u.isAnonymous && ADMIN_EMAILS.includes(u.email || '');

  if (!alreadyAdmin) {
    const email = prompt('Email de administrador (Firebase Auth):');
    if (!email) return;
    const pass = prompt('Contraseña (Firebase Auth):');
    if (!pass) return;
    try {
      await fb.auth.signInWithEmailAndPassword(email.trim(), pass);
    } catch (err) {
      console.error('Login admin error:', err);
      showNotification('No se pudo iniciar sesión: ' + (err.code || err.message), 'error');
      return;
    }
  }

  // Verificar de nuevo
  const user = fb.auth.currentUser;
  if (user && !user.isAnonymous && ADMIN_EMAILS.includes(user.email || '')) {
    isAdminMode = true;
    updateGalleryControls();
    renderGallery();
    showNotification('Modo administrador activado', 'success');
  } else {
    showNotification('Esta cuenta no tiene permisos de administrador', 'error');
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    z-index: 10001;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
  `;
  
  switch(type) {
    case 'success': notification.style.background = '#28a745'; break;
    case 'error': notification.style.background = '#dc3545'; break;
    case 'warning': notification.style.background = '#ffc107'; notification.style.color = '#333'; break;
    default: notification.style.background = '#17a2b8';
  }
  
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function updateGalleryControls() {
  // Botón Admin
  let adminBtn = document.getElementById('admin-toggle');
  if (!adminBtn) {
    adminBtn = document.createElement('button');
    adminBtn.id = 'admin-toggle';
    adminBtn.className = 'btn admin-btn';
    adminBtn.addEventListener('click', toggleAdminMode);
    if (btnMore && btnMore.parentNode) {
      btnMore.parentNode.appendChild(adminBtn);
    }
  }
  adminBtn.textContent = isAdminMode ? '🛡️ Salir Admin' : '🔧 Admin';

  const existingControls = document.getElementById('admin-controls');
  if (existingControls) existingControls.remove();

  if (isAdminMode) {
    const controls = document.createElement('div');
    controls.id = 'admin-controls';
    controls.className = 'admin-controls';
    controls.innerHTML = `
      <div class="admin-header">
        <h3>Panel de Administrador</h3>
        <span class="selected-count">0 fotos seleccionadas</span>
      </div>
      <div class="admin-buttons">
        <button id="select-all" class="btn secondary">✓ Seleccionar todas</button>
        <button id="deselect-all" class="btn secondary">✗ Deseleccionar</button>
        <button id="delete-selected" class="btn danger">🗑️ Eliminar seleccionadas</button>
      </div>
    `;
    if (btnMore && btnMore.parentNode) {
      btnMore.parentNode.appendChild(controls);
    }

    document.getElementById('select-all').addEventListener('click', selectAllPhotos);
    document.getElementById('deselect-all').addEventListener('click', deselectAllPhotos);
    document.getElementById('delete-selected').addEventListener('click', deleteSelectedPhotos);
  }
}

let selectedPhotos = new Set();

function updateSelectedCount() {
  const countElement = document.querySelector('.selected-count');
  if (countElement) {
    countElement.textContent = `${selectedPhotos.size} fotos seleccionadas`;
  }
}

function selectAllPhotos() {
  selectedPhotos.clear();
  displayedPhotos.forEach(photo => selectedPhotos.add(photo.id));
  updateSelectedCount();
  renderGallery();
}

function deselectAllPhotos() {
  selectedPhotos.clear();
  updateSelectedCount();
  renderGallery();
}

async function deleteSelectedPhotos() {
  if (selectedPhotos.size === 0) {
    showNotification("No hay fotos seleccionadas", 'warning');
    return;
  }

  //solo admin autenticado puede borrar
  if (!fb.usingFirebase || !fb.auth.currentUser || fb.auth.currentUser.isAnonymous || !ADMIN_EMAILS.includes(fb.auth.currentUser.email || '')) {
    showNotification("No tienes permisos para eliminar. Inicia sesión como admin.", 'error');
    return;
  }
  
  if (!confirm(`¿Eliminar ${selectedPhotos.size} foto${selectedPhotos.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) {
    return;
  }
  
  const loadingDiv = showLoadingIndicator('Eliminando fotos...');
  let deletedCount = 0;
  let errorCount = 0;
  
  try {
    for (const photoId of selectedPhotos) {
      if (fb.usingFirebase && !photoId.startsWith('local_')) {
        try {
          await fb.db.collection(PHOTOS_COLLECTION).doc(photoId).delete();
          deletedCount++;
        } catch (error) {
          console.error(`Error eliminando foto ${photoId}:`, error);
          errorCount++;
          if (error.code === 'permission-denied') {
            showNotification("No tienes permisos para eliminar esta foto. Revisa las reglas de Firestore.", 'error');
          }
        }
      } else if (photoId.startsWith('local_')) {
        // Eliminar de localStorage
        const index = parseInt(photoId.replace('local_', ''));
        if (index >= 0 && index < photosLocal.length) {
          photosLocal.splice(index, 1);
          // Reindexar IDs locales
          photosLocal = photosLocal.map((photo, newIndex) => ({
            ...photo,
            id: `local_${newIndex}`
          }));
          localStorage.setItem('guest_photos', JSON.stringify(photosLocal.map(p => p.url)));
          deletedCount++;
        }
      }
    }
    
    selectedPhotos.clear();
    updateSelectedCount();
    
    if (deletedCount > 0 && errorCount === 0) {
      showNotification(`${deletedCount} foto${deletedCount > 1 ? 's' : ''} eliminada${deletedCount > 1 ? 's' : ''}`, 'success');
    } else if (deletedCount > 0 && errorCount > 0) {
      showNotification(`${deletedCount} eliminadas, ${errorCount} con errores`, 'warning');
    } else {
      showNotification("No se pudieron eliminar las fotos. Revisa permisos.", 'error');
    }

    if (!fb.usingFirebase) {
      updateAllPhotos();
      renderGallery();
    }
  } catch (error) {
    console.error('Error general eliminando fotos:', error);
    showNotification("Error inesperado al eliminar fotos", 'error');
  } finally {
    hideLoadingIndicator(loadingDiv);
  }
}

function showLoadingIndicator(message) {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-overlay';
  loadingDiv.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <p>${message}</p>
    </div>
  `;
  document.body.appendChild(loadingDiv);
  return loadingDiv;
}

function hideLoadingIndicator(loadingDiv) {
  if (loadingDiv && loadingDiv.parentNode) {
    loadingDiv.parentNode.removeChild(loadingDiv);
  }
}

function updateAllPhotos() {
  allPhotos = [...photosLocal];
}

function renderGallery(forceShowAll = false){
  if (!showingAll && !forceShowAll) {
    displayedPhotos = allPhotos.slice(0, PHOTOS_PER_PAGE);
  } else {
    displayedPhotos = [...allPhotos];
  }
  
  galleryEl.innerHTML = '';
  
  // Sin fotos
  if (displayedPhotos.length === 0) {
    galleryEl.innerHTML = `
      <div class="empty-gallery">
        <div class="empty-icon">📷</div>
        <h3>No hay fotos aún</h3>
        <p>¡Sé el primero en subir fotos de la boda!</p>
      </div>
    `;
    if (btnMore) btnMore.style.display = 'none';
    return;
  }
  
  displayedPhotos.forEach((photo, i) => {
    const container = document.createElement('div');
    container.className = 'photo-container';
    
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = photo.url;
    img.alt = 'Foto de la boda ' + (i + 1);
    img.addEventListener('click', () => openLightbox(photo), { passive: true });
    
    // Checkbox para modo admin
    if (isAdminMode) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'photo-checkbox';
      checkbox.checked = selectedPhotos.has(photo.id);
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          selectedPhotos.add(photo.id);
        } else {
          selectedPhotos.delete(photo.id);
        }
        updateSelectedCount();
        renderGallery();
      });
      container.appendChild(checkbox);
      
      if (selectedPhotos.has(photo.id)) {
        const overlay = document.createElement('div');
        overlay.className = 'selection-overlay';
        container.appendChild(overlay);
      }
    }
    
    container.appendChild(img);
    galleryEl.appendChild(container);
  });
  
  if (btnMore) {
    if (allPhotos.length <= PHOTOS_PER_PAGE) {
      btnMore.style.display = 'none';
    } else {
      btnMore.style.display = showingAll ? 'none' : 'block';
    }
  }
}

// Event listener para "Ver más"
if (btnMore) {
  btnMore.addEventListener('click', () => {
    showingAll = true;
    renderGallery(true);
  });
}

// ========= Lightbox =========
const lb = document.createElement('div');
lb.className = 'lightbox';
lb.innerHTML = `
  <div class="lightbox-backdrop"></div>
  <div class="lightbox-content">
    <button class="lightbox-close" aria-label="Cerrar">×</button>
    <img alt="Foto ampliada" />
    <div class="lightbox-controls">
      <button id="download-photo" class="btn download-btn">
        <span>📥</span>
        Descargar foto
      </button>
    </div>
  </div>
`;
document.body.appendChild(lb);

let currentPhoto = null;

function openLightbox(photo) {
  currentPhoto = photo;
  const img = lb.querySelector('img');
  img.src = photo.url;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  
  const downloadBtn = document.getElementById('download-photo');
  downloadBtn.onclick = () => downloadImage(photo.url, `boda-foto-${photo.id}.jpg`);
}

function closeLightbox() {
  lb.classList.remove('open');
  document.body.style.overflow = '';
  currentPhoto = null;
}

// Cerrar lightbox
lb.addEventListener('click', (e) => {
  if (e.target === lb || e.target.classList.contains('lightbox-close') || e.target.classList.contains('lightbox-backdrop')) {
    closeLightbox();
  }
}, { passive: true });

// Cerrar con ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lb.classList.contains('open')) {
    closeLightbox();
  }
});

// ========= Subidas =========
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const cameraInput = document.getElementById('camera');

['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }, { passive: false }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }, { passive: false }));

drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
fileInput.addEventListener('change', e => handleFiles(e.target.files));
cameraInput?.addEventListener('change', e => handleFiles(e.target.files));

async function uploadToCloudinary(blob){
  const fd = new FormData();
  fd.append('file', blob, 'photo.jpg');
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  if (CLOUDINARY_FOLDER) fd.append('folder', CLOUDINARY_FOLDER);
  fd.append('tags', 'boda,ingrid,antonio');
  
  const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  return res.json();
}

async function handleFiles(fileList){
  const files = Array.from(fileList || []).filter(f => /^image\//.test(f.type));
  if (!files.length) return;

  const loadingDiv = showLoadingIndicator(`Subiendo ${files.length} foto${files.length > 1 ? 's' : ''}...`);

  try {
    const processedDataUrls = await Promise.all(
      files.map(f => compressImage(f, { maxSize: 1600, quality: 0.8 }))
    );

    if (fb.usingFirebase) {
      for (const durl of processedDataUrls) {
        const blob = dataURLtoBlob(durl);
        const result = await uploadToCloudinary(blob);
        if (result.secure_url) {
          await fb.db.collection(PHOTOS_COLLECTION).add({
            url: result.secure_url,
            uploaderId: fb.auth.currentUser?.uid || 'anonymous',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      showNotification(`${files.length} foto${files.length > 1 ? 's' : ''} subida${files.length > 1 ? 's' : ''} exitosamente`, 'success');
    } else {
      // Modo local
      const newPhotos = processedDataUrls.map((url, index) => ({
        url,
        id: `local_${photosLocal.length + index}`,
        isLocal: true
      }));
      
      photosLocal.push(...newPhotos);
      localStorage.setItem('guest_photos', JSON.stringify(photosLocal.map(p => p.url)));
      updateAllPhotos();
      renderGallery();
      
      showNotification(`${files.length} foto${files.length > 1 ? 's' : ''} guardada${files.length > 1 ? 's' : ''} localmente`, 'success');
      const note = document.getElementById('upload-note');
      if (note) note.innerHTML = 'Tus fotos se guardan solo en este dispositivo. Activa Firebase para compartirlas.';
    }
  } catch (error) {
    console.error('Error subiendo fotos:', error);
    showNotification('Error al subir algunas fotos. Inténtalo de nuevo.', 'error');
  } finally {
    hideLoadingIndicator(loadingDiv);
  }
}


// ========= Galería en tiempo real =========
if (fb.usingFirebase) {
  galleryHint.textContent = 'Las fotos de todos aparecen aquí en tiempo real.';
  fb.db.collection(PHOTOS_COLLECTION).orderBy('createdAt', 'desc').limit(200)
    .onSnapshot((snap) => {
      const firebasePhotos = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.url) {
          firebasePhotos.push({
            url: data.url,
            id: doc.id,
            uploaderId: data.uploaderId,
            createdAt: data.createdAt
          });
        }
      });
      
      allPhotos = [...firebasePhotos];
      renderGallery();
    });
} else {
  updateAllPhotos();
  renderGallery();
}

// Inicializar controles de admin
updateGalleryControls();

// ========= QR =========
const qrDiv = document.getElementById('qrcode');
const qrUrlSpan = document.getElementById('qr-url');
const qrFallback = document.getElementById('qr-fallback');
const btnCopy = document.getElementById('btn-copy');
const btnDownload = document.getElementById('btn-download');

const CANONICAL_URL = 'https://angiepereir.github.io/Ingrid-Toni/';
const pageUrl = CANONICAL_URL;
if (qrUrlSpan) { qrUrlSpan.textContent = pageUrl; qrUrlSpan.style.wordBreak = 'break-all'; }

async function ensureQRCodeLib() {
  if (window.QRCode && typeof QRCode.toCanvas === 'function') return true;
  await new Promise(r => setTimeout(r, 50));
  return !!(window.QRCode && typeof QRCode.toCanvas === 'function');
}

function getFallbackQRUrl(size) {
  const data = encodeURIComponent(pageUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=2&data=${data}`;
}

async function renderQR(size = 240) {
  qrDiv.innerHTML = '';
  if (await ensureQRCodeLib()) {
    QRCode.toCanvas(
      pageUrl,
      { width: size, margin: 2, color: { dark: '#000000', light: '#ffffff' } },
      (err, canvas) => {
        if (err) { showFallback(size); return; }
        const wrap = document.createElement('div');
        wrap.style.padding = '10px';
        wrap.style.background = 'linear-gradient(135deg, var(--burgundy), #540016)';
        wrap.style.borderRadius = '16px';
        wrap.style.display = 'inline-block';
        wrap.appendChild(canvas);
        qrDiv.appendChild(wrap);
      }
    );
  } else {
    showFallback(size);
  }
}

function showFallback(size){
  const img = document.createElement('img');
  img.alt = 'QR';
  img.width = size;
  img.height = size;
  img.src = getFallbackQRUrl(size);
  const wrap = document.createElement('div');
  wrap.style.padding = '10px';
  wrap.style.background = 'linear-gradient(135deg, var(--burgundy), #540016)';
  wrap.style.borderRadius = '16px';
  wrap.style.display = 'inline-block';
  wrap.appendChild(img);
  qrDiv.innerHTML = '';
  qrDiv.appendChild(wrap);
  if (qrFallback) qrFallback.hidden = false;
}

const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { renderQR(); io.disconnect(); } });
});
io.observe(document.getElementById('qr'));

btnCopy.addEventListener('click', async () => {
  try { 
    await navigator.clipboard.writeText(pageUrl);
    btnCopy.textContent = '¡Copiado!';
    setTimeout(() => btnCopy.textContent = 'Copiar enlace', 1200);
  } catch { 
    showNotification('No se pudo copiar el enlace', 'error'); 
  }
});

btnDownload.addEventListener('click', async () => {
  if (await ensureQRCodeLib()) {
    QRCode.toCanvas(
      pageUrl,
      { width: 1024, margin: 2, color: { dark: '#000000', light: '#ffffff' } },
      (err, canvas) => {
        if (err) { downloadFallback(); return; }
        const png = canvas.toDataURL('image/png');
        const isiOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
        if (isiOS) window.open(png, '_blank');
        else { const a = document.createElement('a'); a.href = png; a.download = 'qr-boda.png'; a.click(); }
      }
    );
  } else {
    downloadFallback();
  }
});

function downloadFallback(){
  const url = getFallbackQRUrl(1024);
  const isiOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
  if (isiOS) window.open(url, '_blank');
  else {
    const a = document.createElement('a');
    a.href = url; a.download = 'qr-boda.png';
    a.click();
  }
}

// Agregar animaciones CSS mediante JavaScript
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);
