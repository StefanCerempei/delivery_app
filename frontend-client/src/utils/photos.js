// Pozele obiectelor în browser: comprimare, păstrare peste reîncărcarea paginii (IndexedDB) și încărcare.
const MAX_SIDE = 1600; // px, latura mare — destul ca echipa să vadă clar obiectele
const QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // aceeași limită ca pe server

/** Micșorează poza și o transformă în JPEG (~200–600 KB). Pozele de pe iPhone vin deja ca JPEG din Safari. */
export async function compressImage(file) {
    try {
        const bitmap = await loadBitmap(file);
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // PNG transparent → fundal alb, nu negru
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close?.();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
        if (blob && blob.size > 0) return blob;
    } catch {
        // browserul nu poate citi formatul — încercăm cu fișierul original mai jos
    }
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= MAX_UPLOAD_BYTES) return file;
    throw new Error('This photo format isn’t supported. Please use a JPG or PNG photo.');
}

async function loadBitmap(file) {
    if (window.createImageBitmap) {
        // respectă orientarea din EXIF (pozele de pe telefon nu ies întoarse)
        return createImageBitmap(file, { imageOrientation: 'from-image' });
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/* ---------- IndexedDB: pozele nu se pierd dacă clientul reîncarcă pagina sau intră în cont ---------- */
const DB_NAME = 'reloq-booking';
const STORE = 'photos';

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function withStore(mode, fn) {
    const db = await openDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const result = fn(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(result?.result ?? result);
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

/** Salvează lista curentă de poze (înlocuiește ce era). Erorile sunt ignorate: e doar o comoditate. */
export async function storePhotos(photos) {
    try {
        await withStore('readwrite', (store) => {
            store.clear();
            photos.forEach((p, i) => store.put({ id: p.id, name: p.name, blob: p.blob, order: i }));
        });
    } catch {
        // mod privat / stocare blocată: pozele rămân doar în pagina curentă
    }
}

/** Pozele salvate, cu previzualizare nouă. */
export async function loadStoredPhotos() {
    try {
        const rows = await withStore('readonly', (store) => store.getAll());
        return (rows || [])
            .filter((r) => r.blob)
            .sort((a, b) => a.order - b.order)
            .map((r) => ({ id: r.id, name: r.name, blob: r.blob, previewUrl: URL.createObjectURL(r.blob) }));
    } catch {
        return [];
    }
}

export const clearStoredPhotos = () => storePhotos([]);
