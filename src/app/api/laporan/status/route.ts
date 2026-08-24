import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';
import type { TandaTangan } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Perpindahan status laporan periode BESERTA tanda tangan elektroniknya.
 *
 * Ketiga transisi dijadikan satu rute server (Admin SDK) dan bukan tulis
 * langsung dari klien, karena tanda tangan hanya bernilai bila:
 *  - waktunya berasal dari jam server, bukan jam perangkat penandatangan;
 *  - dosen tidak bisa membubuhkan tanda tangan Wakil Dekan I;
 *  - status, tanda tangan, dan penguncian data berubah bersama-sama.
 * Security Rules menolak klien yang menyentuh ttdDosen/ttdWadek maupun
 * mengubah `status` submissions, jadi rute ini satu-satunya jalan.
 *
 *  kirim       (dosen_pa) → 'dikirim'      + ttdDosen. Laporan terkunci.
 *  verifikasi  (wadek1)   → 'diverifikasi' + ttdWadek.
 *  kembalikan  (wadek1)   → 'dikembalikan', KEDUA tanda tangan dihapus dan
 *                           laporan terbuka lagi. Dosen menandatangani ulang
 *                           saat mengirim kembali, sehingga tanda tangan
 *                           selalu cocok dengan isi dokumen yang berlaku.
 */

/** Kode verifikasi pendek yang tercetak di PDF; acak, tidak bisa ditebak dari isi. */
function buatKode(periodeId: string, uid: string): string {
  const acak = randomBytes(6).toString('hex');
  const sidik = createHash('sha256').update(`${periodeId}|${uid}|${acak}`).digest('hex').slice(0, 8);
  return `${acak}${sidik}`.toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
}

function stempel(uid: string, nama: string, jabatan: string, periodeId: string): TandaTangan {
  return { uid, nama, jabatan, waktu: new Date().toISOString(), kode: buatKode(periodeId, uid) };
}

export async function POST(req: NextRequest) {
  const caller = await requireRole(req, ['dosen_pa', 'wadek1']);
  if (caller instanceof Response) return caller;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body bukan JSON yang sah.', { status: 400 });
  }

  const aksi = String(body?.aksi ?? '');
  const periodeId = String(body?.periodeId ?? '').trim();
  const dosenUid = String(body?.dosenUid ?? '').trim();
  const catatan = String(body?.catatan ?? '').trim();

  if (!periodeId || !dosenUid) return new Response('periodeId dan dosenUid wajib diisi.', { status: 400 });
  if (!['kirim', 'verifikasi', 'kembalikan'].includes(aksi)) {
    return new Response("aksi harus 'kirim', 'verifikasi', atau 'kembalikan'.", { status: 400 });
  }

  // Dosen hanya boleh mengirim laporannya SENDIRI; validasi/pengembalian
  // adalah wewenang Wakil Dekan I. Akun multi-peran diperiksa per aksi,
  // bukan sekadar "punya salah satu peran".
  const bolehWadek = caller.roles.includes('wadek1');
  const bolehDosen = caller.roles.includes('dosen_pa');
  if (aksi === 'kirim') {
    if (!bolehDosen || caller.uid !== dosenUid) {
      return new Response('Anda hanya dapat mengirim laporan milik Anda sendiri.', { status: 403 });
    }
  } else if (!bolehWadek) {
    return new Response('Hanya Wakil Dekan I yang dapat memvalidasi atau mengembalikan laporan.', { status: 403 });
  }

  try {
    const db = getAdminDb();

    const periodeSnap = await db.doc(`periode/${periodeId}`).get();
    if (!periodeSnap.exists) return new Response('Periode tidak ditemukan.', { status: 404 });
    if ((periodeSnap.data() as any)?.status === 'dikunci') {
      return new Response('Periode sudah dikunci — status laporan tidak dapat diubah lagi.', { status: 423 });
    }

    const subRef = db.doc(`submissions/${periodeId}_${dosenUid}`);
    const subSnap = await subRef.get();
    if (!subSnap.exists) {
      return new Response('Data pengiriman laporan dosen ini belum ada pada periode tersebut.', { status: 404 });
    }
    const sub = subSnap.data() as any;

    if (aksi === 'kirim' && sub.status === 'diverifikasi') {
      return new Response('Laporan ini sudah divalidasi Wakil Dekan I — tidak perlu dikirim ulang.', { status: 409 });
    }
    if (aksi === 'verifikasi' && sub.status !== 'dikirim') {
      return new Response('Laporan ini belum dikirim dosen PA, jadi belum bisa divalidasi.', { status: 409 });
    }
    // Pengembalian juga berlaku atas laporan yang TERLANJUR divalidasi —
    // kekeliruan kerap baru ketahuan setelah disahkan, dan satu-satunya cara
    // membukanya kembali untuk diperbaiki adalah mengembalikannya. Tanda
    // tangan yang sudah terbit ikut dicabut, jadi tidak ada dokumen bertanda
    // tangan yang isinya masih boleh berubah.
    if (aksi === 'kembalikan' && !['dikirim', 'diverifikasi'].includes(sub.status)) {
      return new Response('Laporan ini belum dikirim dosen PA, jadi tidak ada yang perlu dikembalikan.', { status: 409 });
    }
    if (aksi === 'kembalikan' && catatan.length < 5) {
      return new Response('Catatan pengembalian wajib diisi (minimal 5 karakter).', { status: 400 });
    }

    const batch = db.batch();

    if (aksi === 'kirim') {
      const ttd = stempel(caller.uid, caller.nama, 'Dosen Pembimbing Akademik', periodeId);
      batch.update(subRef, { status: 'dikirim', ttdDosen: ttd, ttdWadek: FieldValue.delete() });
      // Stempel waktu kirim pada setiap laporan bimbingan (jejak audit §4.4).
      const lap = await db
        .collection('laporan')
        .where('periodeId', '==', periodeId)
        .where('dosenPaUid', '==', dosenUid)
        .get();
      lap.docs.forEach((d) => batch.update(d.ref, { submittedAt: FieldValue.serverTimestamp() }));
      await batch.commit();
      return Response.json({ ok: true, status: 'dikirim', ttdDosen: ttd });
    }

    if (aksi === 'verifikasi') {
      const ttd = stempel(caller.uid, caller.nama, 'Wakil Dekan I', periodeId);
      batch.update(subRef, { status: 'diverifikasi', ttdWadek: ttd, catatanWadek: catatan });
      await batch.commit();
      return Response.json({ ok: true, status: 'diverifikasi', ttdWadek: ttd });
    }

    // kembalikan — kedua tanda tangan dicabut supaya tidak ada dokumen
    // bertanda tangan yang isinya masih boleh berubah.
    batch.update(subRef, {
      status: 'dikembalikan',
      catatanWadek: catatan,
      ttdDosen: FieldValue.delete(),
      ttdWadek: FieldValue.delete(),
    });
    await batch.commit();
    return Response.json({ ok: true, status: 'dikembalikan' });
  } catch (e: any) {
    return new Response(`Gagal memproses status laporan: ${e?.message ?? e}`, { status: 500 });
  }
}
