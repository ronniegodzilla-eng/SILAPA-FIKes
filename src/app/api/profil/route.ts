import { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';
import type { Prodi } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRODI: Prodi[] = ['K3', 'KL', 'S2KM'];

/**
 * Profil milik sendiri (§ setiap pengguna mengelola profilnya).
 *
 * Sengaja TERPISAH dari /api/admin/users meski sebagian logikanya mirip:
 * rute ini selalu menulis ke dokumen milik PEMANGGIL (uid diambil dari token,
 * tidak pernah dari body), sehingga tidak ada cara menyunting akun orang lain
 * lewat sini. Peran (`roles`) dan status aktif juga TIDAK dapat disentuh —
 * kalau bisa, siapa pun tinggal mengangkat dirinya jadi admin.
 *
 * Kata sandi & email diubah di sisi klien lewat Firebase Auth (butuh
 * re-autentikasi dengan kata sandi saat ini). Rute ini hanya menyelaraskan
 * salinan email di Firestore setelah Auth berhasil diubah.
 *
 * PATCH { nama?, email?, prodiHomebase? } → { ok: true }
 */
export async function PATCH(req: NextRequest) {
  const caller = await requireRole(req, ['dosen_pa', 'admin', 'wadek1']);
  if (caller instanceof Response) return caller;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body JSON tidak valid.', { status: 400 });
  }

  const namaInput = typeof body?.nama === 'string' ? body.nama.trim() : undefined;
  const emailInput = typeof body?.email === 'string' ? body.email.trim() : undefined;
  const prodiInput = body?.prodiHomebase !== undefined ? body.prodiHomebase : undefined;

  if (namaInput !== undefined && !namaInput) {
    return new Response('Nama tidak boleh kosong.', { status: 400 });
  }
  if (emailInput !== undefined && !emailInput) {
    return new Response('Email tidak boleh kosong.', { status: 400 });
  }
  if (prodiInput !== undefined && prodiInput !== null && !PRODI.includes(prodiInput)) {
    return new Response('Prodi homebase tidak valid.', { status: 400 });
  }
  if (namaInput === undefined && emailInput === undefined && prodiInput === undefined) {
    return new Response('Tidak ada perubahan yang dikirim.', { status: 400 });
  }

  const db = getAdminDb();
  try {
    if (namaInput !== undefined) {
      // displayName di Auth ikut disamakan agar konsisten dengan Firestore.
      await getAuth(getApps()[0]).updateUser(caller.uid, { displayName: namaInput });
    }
    await db.doc(`users/${caller.uid}`).update({
      ...(namaInput !== undefined ? { nama: namaInput } : {}),
      ...(emailInput !== undefined ? { email: emailInput } : {}),
      ...(prodiInput !== undefined ? { prodiHomebase: prodiInput } : {}),
    });

    // Roster `submissions` mencocokkan dosen lewat field `nama`, BUKAN uid
    // (lihat /api/admin/users PATCH). Tanpa sinkron ini, mengganti nama
    // sendiri akan membuat "Kirim Laporan" dan unduh PDF per-dosen berhenti
    // cocok. Disinkronkan lintas periode, sama seperti jalur admin.
    if (namaInput !== undefined || prodiInput !== undefined) {
      const subsSnap = await db.collection('submissions').where('dosenUid', '==', caller.uid).get();
      await Promise.all(
        subsSnap.docs.map((d) =>
          d.ref.update({
            ...(namaInput !== undefined ? { nama: namaInput } : {}),
            ...(prodiInput !== undefined ? { prodi: prodiInput } : {}),
          })
        )
      );
    }
    return Response.json({ ok: true });
  } catch (e: any) {
    return new Response(`Gagal memperbarui profil: ${e?.message ?? e}`, { status: 500 });
  }
}
