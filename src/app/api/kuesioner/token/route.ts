import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';
import { findActivePeriodeAdmin } from '@/lib/token-isi-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tautan pengisian kuesioner. Dua jalur, sesuai keputusan pimpinan:
 *
 *   lingkup 'fakultas' — dibuat tim evaluasi, berlaku untuk semua mahasiswa.
 *   lingkup 'dosen'    — dibuat dosen PA, terbatas pada bimbingannya sendiri.
 *
 * Satu tautan memuat SELURUH kuesioner yang sedang terbuka pada periode itu,
 * bukan satu tautan per instrumen: tim evaluasi bisa mengaktifkan beberapa
 * instrumen sekaligus, dan membagikan tiga tautan berbeda ke 2.000 mahasiswa
 * adalah cara tercepat membuat sebagiannya salah buka.
 *
 * Jalur mana yang dipakai dicatat pada tiap jawaban (sumberTautan), karena
 * dosen PA juga membagikan tautan sementara ia sendiri yang dinilai.
 */
export async function GET(req: NextRequest) {
  const caller = await requireRole(req, ['tim_evaluasi', 'dosen_pa']);
  if (caller instanceof Response) return caller;

  const db = getAdminDb();
  const lingkup = caller.roles.includes('tim_evaluasi') ? 'fakultas' : 'dosen';
  const field = lingkup === 'fakultas' ? 'activeTokenKuesionerFakultas' : 'activeTokenKuesionerDosen';

  const userSnap = await db.doc(`users/${caller.uid}`).get();
  const aktif = userSnap.exists ? (userSnap.data() as any)[field] : null;
  if (!aktif) return Response.json({ token: null, url: null, lingkup });

  const snap = await db.doc(`tokenKuesioner/${aktif}`).get();
  if (!snap.exists || (snap.data() as any).active === false) {
    return Response.json({ token: null, url: null, lingkup });
  }
  return Response.json({ token: aktif, url: `${req.nextUrl.origin}/kuesioner/${aktif}`, lingkup });
}

export async function POST(req: NextRequest) {
  const caller = await requireRole(req, ['tim_evaluasi', 'dosen_pa']);
  if (caller instanceof Response) return caller;

  const db = getAdminDb();
  const periode = await findActivePeriodeAdmin();
  if (!periode) return new Response('Tidak ada periode aktif — tidak dapat membuat link.', { status: 400 });

  const lingkup = caller.roles.includes('tim_evaluasi') ? 'fakultas' : 'dosen';
  const field = lingkup === 'fakultas' ? 'activeTokenKuesionerFakultas' : 'activeTokenKuesionerDosen';

  const userRef = db.doc(`users/${caller.uid}`);
  const userSnap = await userRef.get();
  const lama = userSnap.exists ? (userSnap.data() as any)[field] : null;

  const baru = randomBytes(16).toString('base64url');
  await db.doc(`tokenKuesioner/${baru}`).set({
    periodeId: periode.id,
    lingkup,
    dosenUid: lingkup === 'dosen' ? caller.uid : null,
    active: true,
    dibuatOleh: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  await userRef.set({ [field]: baru }, { merge: true });

  // Token lama ditandai mati, bukan dihapus — sama seperti tokenIsiData, agar
  // mahasiswa yang membuka link lama mendapat sebab yang sebenarnya alih-alih
  // "link tidak dikenali" yang menyesatkan.
  if (lama && lama !== baru) {
    await db
      .doc(`tokenKuesioner/${lama}`)
      .set({ active: false, replacedBy: baru, replacedAt: FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {});
  }

  return Response.json({ token: baru, url: `${req.nextUrl.origin}/kuesioner/${baru}`, lingkup });
}
