import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 3 * 1024 * 1024; // selaras dengan apps-script/upload-bukti.gs

/**
 * Unggah foto profil pengguna yang sedang login ke Google Drive lewat Apps
 * Script yang sama dengan upload bukti (§ pilihan user: Drive, bukan Firebase
 * Storage berbayar).
 *
 * Beda dengan /api/upload-bukti:
 * 1) Terbuka untuk SEMUA peran (wadek1 juga punya foto profil), bukan hanya
 *    dosen_pa/admin.
 * 2) Tidak ada cek kepemilikan NPM — pengguna selalu mengunggah untuk dirinya
 *    sendiri; uid caller dipakai sebagai nama folder, jadi tidak ada cara
 *    menimpa foto orang lain lewat rute ini.
 * 3) PDF tidak diterima (foto profil harus gambar).
 *
 * Yang DISIMPAN sebagai `fotoUrl` adalah path proxy kita sendiri
 * (`/api/foto/{fileId}`), bukan URL Drive. Alasannya diuji langsung: semua
 * bentuk URL Drive (/thumbnail, /uc?export=view, lh3/d/) gagal dimuat
 * sebagai <img> lintas-origin di browser meski `curl` mendapat 200
 * image/png. Lihat komentar di src/app/api/foto/[fileId]/route.ts.
 *
 * POST { filename, mimeType, data (base64) } → { ok, url }
 */
export async function POST(req: NextRequest) {
  const caller = await requireRole(req, ['dosen_pa', 'admin', 'wadek1']);
  if (caller instanceof Response) return caller;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body JSON tidak valid.', { status: 400 });
  }
  const { filename, mimeType, data } = body ?? {};
  if (!filename || !mimeType || !data) {
    return new Response('filename, mimeType, dan data wajib diisi.', { status: 400 });
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    return new Response('Foto profil harus berformat JPG, PNG, atau WEBP.', { status: 400 });
  }
  const approxBytes = Math.floor((String(data).length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return new Response('Ukuran foto maksimal 3MB.', { status: 400 });
  }

  const uploadUrl = process.env.APPS_SCRIPT_UPLOAD_URL;
  const secret = process.env.APPS_SCRIPT_UPLOAD_SECRET;
  if (!uploadUrl || !secret) {
    return new Response('Upload foto belum dikonfigurasi di server (lihat apps-script/README.md).', { status: 500 });
  }

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // `npm` di Apps Script hanya dipakai sebagai nama folder — di sini diisi
      // uid supaya foto tiap pengguna terkumpul di foldernya sendiri.
      body: JSON.stringify({ secret, npm: caller.uid, label: 'Foto-Profil', filename, mimeType, data }),
    });
    const json = await res.json();
    if (!json.ok || !json.fileId) {
      return new Response(json.error ?? 'Gagal mengunggah foto.', { status: 502 });
    }
    const url = `/api/foto/${json.fileId}`;
    await getAdminDb().doc(`users/${caller.uid}`).update({ fotoUrl: url });
    return Response.json({ ok: true, url });
  } catch (e: any) {
    return new Response(`Gagal mengunggah foto: ${e?.message ?? e}`, { status: 502 });
  }
}

/**
 * Hapus foto profil sendiri — hanya melepas rujukannya di users/{uid}.
 * Berkas di Drive sengaja TIDAK ikut dihapus: Apps Script yang dipakai
 * (apps-script/upload-bukti.gs) hanya punya endpoint unggah, dan menambah
 * endpoint hapus berarti memberi wewenang menghapus berkas Drive kepada
 * layanan yang sama yang melayani unggahan publik bukti mahasiswa.
 */
export async function DELETE(req: NextRequest) {
  const caller = await requireRole(req, ['dosen_pa', 'admin', 'wadek1']);
  if (caller instanceof Response) return caller;
  await getAdminDb().doc(`users/${caller.uid}`).update({ fotoUrl: null });
  return Response.json({ ok: true });
}
