import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ekspor DATA MASTER MAHASISWA — satu baris per mahasiswa, datar, siap disaring
 * dan di-pivot sendiri di Excel.
 *
 * Berbeda dari /api/export/rekap yang seluruh sheet-nya rekap agregat per dosen:
 * di sini tidak ada angka yang dijumlahkan, hanya data apa adanya. Itu yang
 * dibutuhkan saat data harus diserahkan ke pihak lain (akreditasi, yayasan)
 * atau diolah dengan cara yang belum tentu terpikir saat aplikasi ini dibuat.
 *
 * Tiga sheet, karena bentuk datanya memang berbeda dan memaksakannya jadi satu
 * baris akan membuat kolom judul semkes berisi delapan judul berhimpitan:
 *   MASTER MAHASISWA — identitas + kegiatan wajib + isian periode berjalan
 *   SEMKES           — satu baris per seminar, lengkap dengan tautan sertifikat
 *   RIWAYAT IP       — satu baris per semester yang tercatat di ipHistory
 *
 * Akses: Wakil Dekan I dan admin, sama seperti ekspor rekap.
 */
export async function GET(req: NextRequest) {
  const caller = await requireRole(req, ['wadek1', 'admin']);
  if (caller instanceof Response) return caller;

  const periodeParam = req.nextUrl.searchParams.get('periodeId');
  try {
    const db = getAdminDb();

    const periodeSnap = await db.collection('periode').get();
    const periodes = periodeSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const target = periodeParam
      ? periodes.find((p) => p.id === periodeParam)
      : periodes.find((p) => p.status !== 'dikunci') ?? periodes[0];
    if (!target) return new Response('Periode tidak ditemukan', { status: 404 });
    const periodeLabel = `${target.tahunAkademik} — Semester ${target.semester === 'genap' ? 'Genap' : 'Ganjil'}`;

    const [mhsSnap, lapSnap, subsSnap] = await Promise.all([
      db.collection('mahasiswa').get(),
      db.collection('laporan').where('periodeId', '==', target.id).get(),
      db.collection('submissions').where('periodeId', '==', target.id).get(),
    ]);

    const laporanByNpm = new Map<string, any>(
      lapSnap.docs.map((d) => [(d.data() as any).npm, d.data() as any])
    );
    // Nama dosen diambil dari roster submissions — dokumen mahasiswa hanya
    // menyimpan uid, dan uid tidak berguna bagi pembaca file Excel.
    const namaDosen = new Map<string, string>(
      subsSnap.docs.map((d) => [(d.data() as any).dosenUid, (d.data() as any).nama])
    );

    const ya = (v: unknown) => (v ? 'Ya' : 'Tidak');
    const teks = (v: unknown) => (v == null || v === '' ? '' : String(v));
    /** Angka dibiarkan sebagai angka agar bisa dihitung di Excel; kosong tetap kosong. */
    const angka = (v: unknown) => (typeof v === 'number' ? v : '');

    const STATUS_LABEL: Record<string, string> = {
      aktif: 'Aktif',
      cuti: 'Cuti',
      non_aktif: 'Non-aktif',
      lulus: 'Lulus',
      mengundurkan_diri: 'Mengundurkan diri',
    };
    const KELENGKAPAN: Record<string, string> = {
      lengkap: 'Lengkap',
      sebagian: 'Sebagian',
      kosong: 'Kosong',
    };

    const mahasiswa = mhsSnap.docs
      .map((d) => d.data() as any)
      .sort((a, b) => String(a.npm).localeCompare(String(b.npm)));

    // ── Sheet 1: MASTER MAHASISWA ───────────────────────────────────────────
    const HEAD_MASTER = [
      'NPM', 'Nama', 'Prodi', 'Angkatan', 'Kelas', 'Dosen PA', 'Status lintas periode',
      'PKKMB', 'Bukti PKKMB', 'TOEFL', 'Bukti TOEFL', 'ESQ', 'Bukti ESQ', 'Jumlah semkes',
      'Semester (periode ini)', 'Status (periode ini)', 'SKS KRS', 'IP semester (KHS)', 'IPK',
      'Jumlah konsultasi', 'MK nilai D/E',
      'UKM', 'Jenis UKM', 'HIMA', 'BEM',
      'Beasiswa', 'Jenis beasiswa', 'Keterangan beasiswa',
      'Prestasi', 'Jenis prestasi', 'Tingkat prestasi',
      'Tahap skripsi', 'Kendala skripsi',
      'Permasalahan', 'Rekomendasi', 'Rekomendasi DO',
      'Kelengkapan pengisian', 'Pengunduran diri', 'Dikunci dari isi mandiri',
    ];

    const barisMaster = mahasiswa.map((m) => {
      const l = laporanByNpm.get(m.npm) ?? {};
      const ak = l.akademik ?? {};
      const na = l.nonAkademik ?? {};
      const semkes = Array.isArray(m.semkes) ? m.semkes : [];
      return [
        teks(m.npm), teks(m.nama), teks(m.prodi), angka(m.angkatan), teks(m.kelas),
        teks(namaDosen.get(m.dosenPaUid) ?? ''),
        STATUS_LABEL[m.statusGlobal ?? 'aktif'] ?? teks(m.statusGlobal),
        ya(m.pkkmb), teks(m.pkkmbBukti), ya(m.toefl), teks(m.toeflBukti), ya(m.esq), teks(m.esqBukti),
        semkes.length,
        angka(l.semesterKe), STATUS_LABEL[l.status ?? ''] ?? teks(l.status),
        angka(ak.sksKrs), angka(ak.ipKhs), angka(ak.ipk),
        Array.isArray(ak.konsultasi) ? ak.konsultasi.length : '',
        Array.isArray(ak.mkNilaiDE) ? ak.mkNilaiDE.join(', ') : '',
        ya(na.ukm), teks(na.ukmJenis), ya(na.hima), ya(na.bem),
        ya(na.beasiswa?.ada), teks(na.beasiswa?.jenis), teks(na.beasiswa?.keterangan),
        ya(na.prestasi?.ada), teks(na.prestasi?.jenis), teks(na.prestasi?.tingkat),
        teks(l.skripsi?.tahap), teks(l.skripsi?.kendala),
        teks(l.permasalahan), teks(l.rekomendasi), ya(l.rekomendasiDO),
        KELENGKAPAN[l.statusPengisian ?? ''] ?? teks(l.statusPengisian),
        teks(l.pengunduran?.status), ya(l.dikunciMandiri),
      ];
    });

    // ── Sheet 2: SEMKES (satu baris per seminar) ────────────────────────────
    const barisSemkes: (string | number)[][] = [];
    mahasiswa.forEach((m) => {
      (Array.isArray(m.semkes) ? m.semkes : []).forEach((e: any, i: number) => {
        barisSemkes.push([
          teks(m.npm), teks(m.nama), teks(m.prodi),
          teks(namaDosen.get(m.dosenPaUid) ?? ''),
          i + 1, teks(e?.judul), teks(e?.bukti),
        ]);
      });
    });

    // ── Sheet 3: RIWAYAT IP (satu baris per semester tercatat) ──────────────
    const barisRiwayat: (string | number)[][] = [];
    mahasiswa.forEach((m) => {
      (Array.isArray(m.ipHistory) ? m.ipHistory : []).forEach((h: any) => {
        barisRiwayat.push([
          teks(m.npm), teks(m.nama), teks(m.prodi),
          teks(namaDosen.get(m.dosenPaUid) ?? ''),
          teks(h?.periodeId ?? h?.label), angka(h?.semesterKe), angka(h?.ip),
        ]);
      });
    });

    const judul = (t: string, head: string[], rows: (string | number)[][]) =>
      XLSX.utils.aoa_to_sheet([
        [t],
        [`Periode ${periodeLabel} · diekspor ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`],
        [],
        head,
        ...rows,
      ]);

    const s1 = judul('DATA MASTER MAHASISWA — FIKes UIS', HEAD_MASTER, barisMaster);
    const s2 = judul('RINCIAN SEMINAR KESEHATAN (SEMKES)',
      ['NPM', 'Nama', 'Prodi', 'Dosen PA', 'No', 'Judul seminar', 'Link sertifikat'], barisSemkes);
    // Sheet ini kosong selama ipHistory belum pernah terisi. Field-nya memang
    // ada dan dibaca di tiga tempat (grafik riwayat, penanda "IP turun 2
    // semester berturut-turut", dan sheet ini), tetapi TIDAK ADA kode yang
    // pernah menambahkan entri ke dalamnya. Barisnya diberi keterangan supaya
    // sheet kosong tidak terbaca sebagai ekspor yang rusak.
    const s3 = judul('RIWAYAT IP PER SEMESTER',
      ['NPM', 'Nama', 'Prodi', 'Dosen PA', 'Periode', 'Semester', 'IP'],
      barisRiwayat.length
        ? barisRiwayat
        : [['(Belum ada riwayat IP tersimpan — data ini baru terisi bila sistem mulai mencatat IP tiap kali periode ditutup.)']]);

    // Lebar kolom: kolom teks bebas dilebarkan, sisanya secukupnya. Diturunkan
    // dari label headernya, bukan indeks tetap, supaya tidak salah geser saat
    // ada kolom baru disisipkan di tengah.
    const lebar = (head: string[]) =>
      head.map((h) => {
        if (/bukti|link/i.test(h)) return { wch: 42 };
        if (/permasalahan|rekomendasi$|kendala|judul/i.test(h)) return { wch: 40 };
        if (/nama|dosen pa|keterangan/i.test(h)) return { wch: 26 };
        if (/npm/i.test(h)) return { wch: 16 };
        return { wch: Math.max(10, Math.min(22, h.length + 2)) };
      });
    s1['!cols'] = lebar(HEAD_MASTER);
    s2['!cols'] = lebar(['NPM', 'Nama', 'Prodi', 'Dosen PA', 'No', 'Judul seminar', 'Link sertifikat']);
    s3['!cols'] = lebar(['NPM', 'Nama', 'Prodi', 'Dosen PA', 'Periode', 'Semester', 'IP']);
    // Baris header dibekukan agar tetap terlihat saat menggulir 2.000 baris.
    s1['!freeze'] = { xSplit: '0', ySplit: '4' } as any;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, s1, 'MASTER MAHASISWA');
    XLSX.utils.book_append_sheet(wb, s2, 'SEMKES');
    XLSX.utils.book_append_sheet(wb, s3, 'RIWAYAT IP');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const namaBerkas = `Data Master Mahasiswa FIKes — ${target.id}.xlsx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(namaBerkas)}`,
      },
    });
  } catch (e: any) {
    console.error('Ekspor master mahasiswa gagal:', e?.message ?? e);
    return new Response('Gagal menyusun berkas ekspor.', { status: 500 });
  }
}
