import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { validateToken } from '@/lib/token-isi-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 3 * 1024 * 1024; // selaras dengan apps-script/upload-bukti.gs

/**
 * Proxy upload bukti untuk halaman publik "Isi Data Mandiri" (token, tanpa
 * login) — dipakai a.l. untuk bukti KRS/KHS. Backend Google Apps Script yang
 * SAMA dengan /api/upload-bukti (lihat apps-script/README.md); di sini
 * otorisasi diverifikasi lewat token+npm, bukan Firebase Auth.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body JSON tidak valid.', { status: 400 });
  }
  const { token, npm, label, filename, mimeType, data } = body ?? {};
  if (!npm || !label || !filename || !mimeType || !data) {
    return new Response('npm, label, filename, mimeType, dan data wajib diisi.', { status: 400 });
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    return new Response('Format file harus JPG, PNG, WEBP, atau PDF.', { status: 400 });
  }
  const approxBytes = Math.floor((String(data).length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return new Response('Ukuran file maksimal 3MB.', { status: 400 });
  }

  const v = await validateToken(token);
  if (!v.ok) return new Response(v.message, { status: v.status });

  const masterSnap = await getAdminDb().doc(`mahasiswa/${npm}`).get();
  const dosenPaUid = masterSnap.exists ? (masterSnap.data() as any).dosenPaUid : null;
  if (dosenPaUid !== v.ctx.dosenUid) {
    return new Response('Mahasiswa ini bukan bimbingan dosen pemilik link.', { status: 403 });
  }

  const uploadUrl = process.env.APPS_SCRIPT_UPLOAD_URL;
  const secret = process.env.APPS_SCRIPT_UPLOAD_SECRET;
  if (!uploadUrl || !secret) {
    return new Response('Upload bukti belum dikonfigurasi di server (lihat apps-script/README.md).', { status: 500 });
  }

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, npm, label, filename, mimeType, data }),
    });
    const json = await res.json();
    if (!json.ok) {
      return new Response(json.error ?? 'Gagal mengunggah bukti.', { status: 502 });
    }
    return Response.json({ ok: true, url: json.url });
  } catch (e: any) {
    return new Response(`Gagal menghubungi layanan upload: ${e?.message ?? e}`, { status: 502 });
  }
}
