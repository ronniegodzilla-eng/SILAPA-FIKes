'use client';

import { apiFetch } from './download';
import { kecilkanGambarBilaPerlu } from './kecilkan-gambar';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 3 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Unggah satu file bukti (mis. sertifikat TOEFL, SK beasiswa) lewat proxy
 * /api/upload-bukti → Google Apps Script → Google Drive. Mengembalikan link
 * Drive yang siap disimpan ke field `*Bukti` terkait (opsional, bukan wajib).
 */
export async function uploadBuktiFile(npm: string, label: string, asli: File): Promise<string> {
  if (!ALLOWED_MIME.includes(asli.type)) {
    throw new Error('Format file harus JPG, PNG, WEBP, atau PDF.');
  }
  // Foto besar diperkecil dulu, jadi batas 3MB baru diperiksa SESUDAHNYA.
  const file = await kecilkanGambarBilaPerlu(asli);
  if (file.size > MAX_BYTES) {
    throw new Error(
      file.type === 'application/pdf'
        ? 'Ukuran PDF maksimal 3MB. Coba unggah foto/hasil pindai halamannya saja.'
        : 'Ukuran file maksimal 3MB, dan file ini masih terlalu besar meski sudah diperkecil otomatis. Coba foto ulang dengan resolusi lebih rendah.'
    );
  }
  const data = await fileToBase64(file);
  const res = await apiFetch<{ ok: true; url: string }>('/api/upload-bukti', {
    method: 'POST',
    body: { npm, label, filename: file.name, mimeType: file.type, data },
  });
  return res.url;
}
