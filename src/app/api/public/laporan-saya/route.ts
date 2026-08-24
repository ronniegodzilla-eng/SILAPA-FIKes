import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { getAdminDb } from '@/lib/firebase-admin';
import { validateToken } from '@/lib/token-isi-data';
import { LaporanMahasiswaPdf } from '@/lib/pdf/laporan-mahasiswa-pdf';
import { STATUS_LABEL } from '@/lib/theme';
import { konsultasiJenisLabel } from '@/lib/compute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Laporan PA perorangan untuk mahasiswa, TANPA login — lewat token isi data
 * mandiri yang sama seperti form pengisian.
 *
 *   GET ?token=X&npm=Y            → daftar periode yang laporannya sudah
 *                                   disahkan Wakil Dekan I dan dapat diunduh.
 *   GET ?token=X&npm=Y&periodeId= → berkas PDF periode tersebut.
 *
 * Hanya periode ber-status submission 'diverifikasi' yang dilayani: dokumen
 * yang belum disahkan tidak boleh beredar sebagai bukti bimbingan. Token
 * membuktikan pemegangnya bagian dari bimbingan dosen tertentu, dan npm harus
 * benar-benar milik dosen itu — persis batas yang sama dengan form pengisian.
 */

const TAHAP_LABEL: Record<string, string> = {
  belum: 'Belum mulai', pengajuan_judul: 'Pengajuan judul', acc_judul: 'ACC judul',
  bimbingan_proposal: 'Bimbingan proposal', sempro: 'Seminar proposal', penelitian: 'Penelitian',
  bimbingan_skripsi: 'Bimbingan skripsi', sidang: 'Sidang', lulus: 'Lulus',
};

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const npm = (req.nextUrl.searchParams.get('npm') ?? '').trim();
  const periodeId = (req.nextUrl.searchParams.get('periodeId') ?? '').trim();

  const v = await validateToken(token);
  if (!v.ok) return new Response(v.message, { status: v.status });
  if (!npm) return new Response('npm wajib diisi.', { status: 400 });

  const db = getAdminDb();

  const masterSnap = await db.doc(`mahasiswa/${npm}`).get();
  if (!masterSnap.exists) return new Response('Mahasiswa tidak ditemukan.', { status: 404 });
  const master = masterSnap.data() as any;
  if (master.dosenPaUid !== v.ctx.dosenUid) {
    return new Response('Mahasiswa ini bukan bimbingan dosen pemilik link.', { status: 403 });
  }

  // Periode mana saja yang laporannya sudah disahkan untuk dosen ini.
  const subsSnap = await db
    .collection('submissions')
    .where('dosenUid', '==', v.ctx.dosenUid)
    .where('status', '==', 'diverifikasi')
    .get();
  const tervalidasi = new Map<string, any>();
  subsSnap.docs.forEach((d) => tervalidasi.set(String((d.data() as any).periodeId), d.data()));

  const periodeSnap = await db.collection('periode').get();
  const labelPeriode = new Map<string, string>();
  periodeSnap.docs.forEach((d) => {
    const p = d.data() as any;
    labelPeriode.set(d.id, `${p.tahunAkademik} — Semester ${p.semester === 'genap' ? 'Genap' : 'Ganjil'}`);
  });

  // ── Daftar periode yang tersedia ──
  if (!periodeId) {
    const lapSnap = await db.collection('laporan').where('npm', '==', npm).get();
    const punyaLaporan = new Set(lapSnap.docs.map((d) => String((d.data() as any).periodeId)));
    const daftar = Array.from(tervalidasi.keys())
      .filter((pid) => punyaLaporan.has(pid))
      .map((pid) => ({
        periodeId: pid,
        periodeLabel: labelPeriode.get(pid) ?? pid,
        disahkanPada: tervalidasi.get(pid)?.ttdWadek?.waktu ?? null,
      }))
      .sort((a, b) => b.periodeId.localeCompare(a.periodeId));
    return Response.json({ nama: master.nama, daftar });
  }

  // ── Berkas PDF satu periode ──
  const sub = tervalidasi.get(periodeId);
  if (!sub) {
    return new Response(
      'Laporan periode ini belum disahkan Wakil Dekan I, jadi belum dapat diunduh.',
      { status: 409 }
    );
  }

  const lapSnap = await db.doc(`laporan/${periodeId}_${npm}`).get();
  if (!lapSnap.exists) {
    return new Response('Tidak ada laporan Anda pada periode tersebut.', { status: 404 });
  }
  const l = lapSnap.data() as any;

  try {
    const wadekSnap = await db.collection('users').where('roles', 'array-contains', 'wadek1').get();
    const wadekNama =
      (wadekSnap.docs.map((d) => d.data() as any).find((u) => u.aktif !== false)?.nama as string | undefined) ?? '';

    const ttdDosen = sub.ttdDosen ?? null;
    const ttdWadek = sub.ttdWadek ?? null;
    const verifikasiKode = ttdWadek?.kode ?? ttdDosen?.kode ?? `SILAPA/${periodeId}/${npm}`.toUpperCase();

    const qrDataUrl = await QRCode.toDataURL(
      JSON.stringify({ sistem: 'SILAPA-FIKes', periode: periodeId, npm, kode: verifikasiKode }),
      { margin: 1, width: 256 }
    );
    const logoBuf = readFileSync(resolve(process.cwd(), 'public/logo-uis-hd.png'));

    const ukmLabel = l.nonAkademik?.ukm
      ? `UKM${l.nonAkademik?.ukmJenis ? ` (${l.nonAkademik.ukmJenis})` : ''}`
      : null;
    const organisasi = [ukmLabel, l.nonAkademik?.hima && 'HIMA', l.nonAkademik?.bem && 'BEM']
      .filter(Boolean)
      .join(', ');

    const buf = await renderToBuffer(
      createElement(LaporanMahasiswaPdf, {
        data: {
          npm: String(npm),
          nama: master.nama ?? npm,
          prodi: master.prodi ?? l.prodi ?? '—',
          kelas: master.kelas ?? '-',
          angkatan: master.angkatan ?? 0,
          semesterKe: l.semesterKe ?? 0,
          status: l.status ?? 'aktif',
          statusLabel: STATUS_LABEL[l.status ?? 'aktif'] ?? String(l.status ?? 'aktif'),

          sksKrs: l.akademik?.sksKrs ?? null,
          ipKhs: l.akademik?.ipKhs ?? null,
          ipk: l.akademik?.ipk ?? null,
          mkNilaiDE: l.akademik?.mkNilaiDE ?? [],
          konsultasi: (l.akademik?.konsultasi ?? []).map((k: any) => ({
            jenis: konsultasiJenisLabel(k),
            keterangan: k?.keterangan ?? '',
          })),

          pkkmb: !!master.pkkmb,
          toefl: !!master.toefl,
          esq: !!master.esq,
          semkes: Array.isArray(master.semkes) ? master.semkes.map((x: any) => ({ judul: x?.judul ?? '' })) : [],

          organisasi: organisasi || 'Tidak ada',
          beasiswa: l.nonAkademik?.beasiswa?.ada ? l.nonAkademik.beasiswa.jenis ?? 'Ya' : 'Tidak ada',
          prestasi: l.nonAkademik?.prestasi?.ada
            ? `${l.nonAkademik.prestasi.jenis ?? ''} (${l.nonAkademik.prestasi.tingkat ?? ''})`
            : 'Tidak ada',
          skripsiTahap: TAHAP_LABEL[l.skripsi?.tahap ?? 'belum'] ?? String(l.skripsi?.tahap ?? ''),
          skripsiKendala: l.skripsi?.kendala ?? '',

          permasalahan: l.permasalahan ?? '',
          rekomendasi: l.rekomendasi ?? '',

          dosenNama: v.ctx.dosenNama,
          wadekNama,
          ttdDosen,
          ttdWadek,

          periodeLabel: labelPeriode.get(periodeId) ?? periodeId,
          tanggal: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
          qrDataUrl,
          verifikasiKode,
          logoDataUrl: `data:image/png;base64,${logoBuf.toString('base64')}`,
        },
      }) as any
    );

    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Laporan_PA_${npm}_${periodeId}.pdf"`,
      },
    });
  } catch (e: any) {
    return new Response(`Gagal membuat PDF: ${e?.message ?? e}`, { status: 500 });
  }
}
