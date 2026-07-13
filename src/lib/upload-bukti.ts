'use client';

import { apiFetch } from './download';

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
export async function uploadBuktiFile(npm: string, label: string, file: File): Promise<string> {
  if (!ALLOWED_MIME.includes(file.type)) {
    throw new Error('Format file harus JPG, PNG, WEBP, atau PDF.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Ukuran file maksimal 3MB.');
  }
  const data = await fileToBase64(file);
  const res = await apiFetch<{ ok: true; url: string }>('/api/upload-bukti', {
    method: 'POST',
    body: { npm, label, filename: file.name, mimeType: file.type, data },
  });
  return res.url;
}
