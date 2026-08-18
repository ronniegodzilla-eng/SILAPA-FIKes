import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Validasi pengunduran diri mahasiswa oleh Wakil Dekan I.
 *
 * Lewat route server (Admin SDK), BUKAN tulis langsung dari klien: Security
 * Rules sengaja tidak mengizinkan peran wadek1 menulis koleksi `laporan`
 * maupun `mahasiswa`, dan itu dipertahankan. Route ini satu-satunya jalan
 * keputusan ditulis, sehingga transisinya bisa dipaksa utuh — status laporan,
 * penanda di master, dan beban bimbingan dosen berubah bersama-sama atau tidak
 * sama sekali.
 *
 * Disetujui  → laporan.status 'non_aktif', master statusGlobal 'non_aktif' +
 *              mengundurkanDiri true, beban bimbingan dosen berkurang 1.
 * Ditolak    → laporan.status dikembalikan ke pengunduran.statusSebelum,
 *              catatan Wakil Dekan wajib diisi supaya dosen tahu alasannya.
 */
export async function POST(req: NextRequest) {
  const caller = await requireRole(req, ['wadek1']);
  if (caller instanceof Response) return caller;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body bukan JSON yang sah.', { status: 400 });
  }

  const npm = String(body?.npm ?? '').trim();
  const periodeId = String(body?.periodeId ?? '').trim();
  const keputusan = String(body?.keputusan ?? '').trim();
  const catatan = String(body?.catatan ?? '').trim();

  if (!npm || !periodeId) {
    return new Response('npm dan periodeId wajib diisi.', { status: 400 });
  }
  if (keputusan !== 'setuju' && keputusan !== 'tolak') {
    return new Response("keputusan harus 'setuju' atau 'tolak'.", { status: 400 });
  }
  // Penolakan tanpa alasan membuat dosen PA menebak-nebak apa yang harus
  // diperbaiki — karena itu diwajibkan di sisi server, bukan hanya di form.
  if (keputusan === 'tolak' && catatan.length < 5) {
    return new Response('Alasan penolakan wajib diisi (minimal 5 karakter).', { status: 400 });
  }

  try {
    const db = getAdminDb();

    const periodeSnap = await db.doc(`periode/${periodeId}`).get();
    if (!periodeSnap.exists) return new Response('Periode tidak ditemukan.', { status: 404 });
    if ((periodeSnap.data() as any)?.status === 'dikunci') {
      return new Response('Periode sudah dikunci — data tidak bisa diubah lagi.', { status: 423 });
    }

    const lapRef = db.doc(`laporan/${periodeId}_${npm}`);
    const lapSnap = await lapRef.get();
    if (!lapSnap.exists) return new Response('Laporan mahasiswa tidak ditemukan.', { status: 404 });

    const lap = lapSnap.data() as any;
    const pengajuan = lap.pengunduran;
    if (!pengajuan || pengajuan.status !== 'diajukan') {
      return new Response('Tidak ada pengajuan pengunduran diri yang menunggu validasi.', {
        status: 409,
      });
    }

    const jejak = {
      catatanWadek: catatan,
      divalidasiOlehNama: caller.nama,
      divalidasiPada: new Date().toISOString(),
    };

    if (keputusan === 'tolak') {
      await lapRef.set(
        {
          status: pengajuan.statusSebelum ?? 'aktif',
          pengunduran: { ...pengajuan, ...jejak, status: 'ditolak' },
        },
        { merge: true }
      );
      return Response.json({
        ok: true,
        keputusan: 'ditolak',
        statusDipulihkan: pengajuan.statusSebelum ?? 'aktif',
      });
    }

    const batch = db.batch();
    batch.set(
      lapRef,
      { status: 'non_aktif', pengunduran: { ...pengajuan, ...jejak, status: 'disetujui' } },
      { merge: true }
    );
    // dosenPaUid di master sengaja TIDAK dihapus: mahasiswa keluar dari daftar
    // bimbingan aktif lewat penanda mengundurkanDiri, sementara jejak siapa
    // pembimbingnya tetap utuh untuk audit AMI/LAM-PTKes.
    batch.set(
      db.doc(`mahasiswa/${npm}`),
      {
        statusGlobal: 'non_aktif',
        mengundurkanDiri: true,
        tanggalMengundurkanDiri: jejak.divalidasiPada,
      },
      { merge: true }
    );

    // Beban bimbingan dosen berkurang satu — kalau tidak, angka di halaman
    // Plotting dan rekap Wakil Dekan akan terus menghitung mahasiswa ini.
    const dosenUid = lap.dosenPaUid ?? '';
    if (dosenUid) {
      const subs = await db
        .collection('submissions')
        .where('periodeId', '==', periodeId)
        .where('dosenUid', '==', dosenUid)
        .get();
      subs.docs.forEach((d) =>
        batch.update(d.ref, { jumlah: Math.max(0, ((d.data() as any).jumlah ?? 0) - 1) })
      );
    }
    await batch.commit();

    return Response.json({ ok: true, keputusan: 'disetujui' });
  } catch (e: any) {
    return new Response(`Gagal memproses validasi: ${e?.message ?? e}`, { status: 500 });
  }
}
