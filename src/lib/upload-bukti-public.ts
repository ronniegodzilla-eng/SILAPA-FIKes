'use client';

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
 * Varian tanpa-login dari uploadBuktiFile — dipakai halaman publik "Isi Data
 * Mandiri" (§ token per dosen). Otorisasi lewat token+npm, bukan Firebase Auth.
 */
export async function uploadBuktiFilePublic(token: string, npm: string, label: string, asli: File): Promise<string> {
  if (!ALLOWED_MIME.includes(asli.type)) {
    throw new Error('Format file harus JPG, PNG, WEBP, atau PDF.');
  }
  // Foto KRS/KHS dari kamera HP rutin 4–8MB — diperkecil dulu, baru diperiksa.
  const file = await kecilkanGambarBilaPerlu(asli);
  if (file.size > MAX_BYTES) {
    throw new Error(
      file.type === 'application/pdf'
        ? 'Ukuran PDF maksimal 3MB. Coba unggah foto halamannya saja.'
        : 'File ini masih lebih dari 3MB meski sudah diperkecil otomatis. Coba foto ulang dengan resolusi lebih rendah.'
    );
  }
  const data = await fileToBase64(file);
  const res = await fetch('/api/public/upload-bukti', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, npm, label, filename: file.name, mimeType: file.type, data }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Gagal mengunggah (HTTP ${res.status}).`);
  }
  const json = await res.json();
  return json.url as string;
}
