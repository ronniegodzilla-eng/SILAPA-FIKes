import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 3 * 1024 * 1024; // 3MB — selaras dengan apps-script/upload-bukti.gs

/**
 * Proxy upload bukti (prestasi/beasiswa/TOEFL/PKKMB/ESQ/organisasi — semua
 * opsional, lihat PRD diskusi bukti) ke backend Google Apps Script (§ Drive
 * gratis, dipilih user untuk hindari paket Firebase Storage berbayar).
 *
 * Kenapa lewat proxy server, bukan client fetch langsung ke Apps Script:
 * 1) UPLOAD_SECRET tetap di server, tidak pernah terkirim ke browser.
 * 2) Endpoint ini sendiri diproteksi Firebase Auth (requireRole) — hanya
 *    dosen_pa/admin yang login yang bisa memicu upload sama sekali.
 * 3) Dosen (non-admin) dibatasi hanya boleh unggah untuk mahasiswa
 *    bimbingannya sendiri (dicek di sini, karena Apps Script tidak punya
 *    konsep kepemilikan record seperti Firestore Rules).
 *
 * POST { npm, label, filename, mimeType, data (base64) } → { ok, url }
 */
export async function POST(req: NextRequest) {
  const caller = await requireRole(req, ['dosen_pa', 'admin']);
  if (caller instanceof Response) return caller;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body JSON tidak valid.', { status: 400 });
  }
  const { npm, label, filename, mimeType, data } = body ?? {};
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

  if (!caller.roles.includes('admin')) {
    const snap = await getAdminDb().doc(`mahasiswa/${npm}`).get();
    const dosenPaUid = snap.exists ? (snap.data() as any).dosenPaUid : null;
    if (dosenPaUid !== caller.uid) {
      return new Response('Anda hanya dapat mengunggah bukti untuk mahasiswa bimbingan Anda sendiri.', { status: 403 });
    }
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
