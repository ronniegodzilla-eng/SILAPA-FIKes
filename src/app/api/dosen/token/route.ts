import { NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';
import { findActivePeriodeAdmin } from '@/lib/token-isi-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Token "Isi Data Mandiri" — satu link per dosen yang mewakili SELURUH
 * mahasiswa bimbingannya, untuk dibagikan sebagai satu link di grup
 * WhatsApp (§ rancangan token-per-dosen, bukan per-mahasiswa).
 *
 * GET  → ambil link aktif dosen ini saat ini (null bila belum pernah buat).
 * POST → buat/ganti link — token lama LANGSUNG mati begitu yang baru dibuat.
 */
export async function GET(req: NextRequest) {
  const caller = await requireRole(req, ['dosen_pa']);
  if (caller instanceof Response) return caller;

  const db = getAdminDb();
  const userSnap = await db.doc(`users/${caller.uid}`).get();
  const activeToken = userSnap.exists ? (userSnap.data() as any).activeTokenIsiData : null;
  if (!activeToken) return Response.json({ token: null, url: null });

  const tokenSnap = await db.doc(`tokenIsiData/${activeToken}`).get();
  if (!tokenSnap.exists || (tokenSnap.data() as any).active === false) {
    return Response.json({ token: null, url: null });
  }
  return Response.json({ token: activeToken, url: `${req.nextUrl.origin}/isi-data/${activeToken}` });
}

export async function POST(req: NextRequest) {
  const caller = await requireRole(req, ['dosen_pa']);
  if (caller instanceof Response) return caller;

  const db = getAdminDb();
  const periode = await findActivePeriodeAdmin();
  if (!periode) return new Response('Tidak ada periode aktif — tidak dapat membuat link.', { status: 400 });

  const userRef = db.doc(`users/${caller.uid}`);
  const userSnap = await userRef.get();
  const oldToken = userSnap.exists ? (userSnap.data() as any).activeTokenIsiData : null;

  const newToken = randomBytes(16).toString('base64url');
  await db.doc(`tokenIsiData/${newToken}`).set({
    dosenUid: caller.uid,
    periodeId: periode.id,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  await userRef.set({ activeTokenIsiData: newToken }, { merge: true });

  // Matikan token lama SETELAH yang baru berhasil dibuat (bukan sebaliknya)
  // supaya tidak ada jeda tanpa link aktif sama sekali kalau terjadi error.
  //
  // DITANDAI, bukan dihapus. Kalau dokumennya hilang, mahasiswa yang membuka
  // link lama hanya dapat "Link tidak ditemukan — periksa kembali link yang
  // Anda buka", yang menyesatkan: seolah ia salah membuka, padahal linknya
  // memang sudah diganti. Dokumen tinggal (tanpa data pribadi apa pun) supaya
  // pesannya bisa menyebutkan sebab yang sebenarnya.
  if (oldToken && oldToken !== newToken) {
    await db
      .doc(`tokenIsiData/${oldToken}`)
      .set(
        { active: false, replacedBy: newToken, replacedAt: FieldValue.serverTimestamp() },
        { merge: true }
      )
      .catch(() => {});
  }

  return Response.json({ token: newToken, url: `${req.nextUrl.origin}/isi-data/${newToken}` });
}
