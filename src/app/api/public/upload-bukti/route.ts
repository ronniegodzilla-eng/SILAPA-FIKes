import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { unggahLewatAppsScript } from '@/lib/apps-script-upload';
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

  const hasil = await unggahLewatAppsScript({ npm, label, filename, mimeType, data });
  if (!hasil.ok) return new Response(hasil.message, { status: hasil.status });
  return Response.json({ ok: true, url: hasil.url });
}
