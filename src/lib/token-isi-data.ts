import 'server-only';
import { getAdminDb } from './firebase-admin';

interface PeriodeDoc {
  id: string;
  tahunAkademik: string;
  semester: 'ganjil' | 'genap';
  status: string;
}

/** Sama seperti logika "utamakan periode terbaru yang belum dikunci, kalau
 * semua terkunci pakai yang terbaru" yang sudah dipakai di rute export. */
export async function findActivePeriodeAdmin(): Promise<PeriodeDoc | null> {
  const db = getAdminDb();
  const snap = await db.collection('periode').get();
  const periodes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PeriodeDoc[];
  periodes.sort((a, b) => b.id.localeCompare(a.id));
  return periodes.find((p) => p.status !== 'dikunci') ?? periodes[0] ?? null;
}

export interface TokenContext {
  token: string;
  dosenUid: string;
  dosenNama: string;
  periodeId: string;
  periodeLabel: string;
}

export type TokenValidation =
  | { ok: true; ctx: TokenContext }
  | { ok: false; status: number; message: string };

/**
 * Validasi token isi-data mandiri (§ rancangan token-per-dosen): token harus
 * ada, aktif, DAN terikat ke periode yang SEDANG berjalan sekarang — bukan
 * sekadar periode saat token dibuat. Ini membuat token otomatis kedaluwarsa
 * begitu periode berganti/terkunci, tanpa perlu pencabutan manual.
 */
export async function validateToken(token: string | null | undefined): Promise<TokenValidation> {
  if (!token) return { ok: false, status: 400, message: 'Token wajib diisi.' };
  const db = getAdminDb();

  const tokenSnap = await db.doc(`tokenIsiData/${token}`).get();
  if (!tokenSnap.exists) {
    return { ok: false, status: 404, message: 'Link tidak ditemukan — periksa kembali link yang Anda buka.' };
  }
  const data = tokenSnap.data() as any;
  if (data.active === false) {
    return { ok: false, status: 410, message: 'Link ini sudah tidak aktif. Minta dosen PA Anda membuat link baru.' };
  }

  const periode = await findActivePeriodeAdmin();
  if (!periode || periode.id !== data.periodeId) {
    return {
      ok: false,
      status: 410,
      message: 'Link ini untuk periode sebelumnya dan sudah tidak berlaku. Minta dosen PA Anda membuat link baru.',
    };
  }
  // Periode ini sudah dikunci Wakil Dekan I (setelah verifikasi) — data
  // tidak boleh berubah lagi dari jalur mana pun, termasuk isi-data mandiri.
  if (periode.status === 'dikunci') {
    return {
      ok: false,
      status: 423,
      message: 'Periode ini sudah dikunci oleh Wakil Dekan I — data tidak bisa diubah lagi. Hubungi dosen PA Anda bila ada koreksi.',
    };
  }

  const dosenSnap = await db.doc(`users/${data.dosenUid}`).get();
  const dosenNama = dosenSnap.exists ? ((dosenSnap.data() as any).nama ?? '—') : '—';
  const periodeLabel = `${periode.tahunAkademik} — Semester ${periode.semester === 'genap' ? 'Genap' : 'Ganjil'}`;

  return {
    ok: true,
    ctx: { token, dosenUid: data.dosenUid, dosenNama, periodeId: periode.id, periodeLabel },
  };
}
