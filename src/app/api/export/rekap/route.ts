import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Excel Rekap Fakultas (PRD §5.4 W3 + §6 + §10): sheet REKAPITULASI LAPORAN PA
 * mereplikasi struktur kolom file lama "REKAPAN LAPORAN PA" (persis, per
 * kesepakatan: tabel utama saja — TANPA blok "INFORMASI"/tanda tangan manual
 * di file lama, karena itu sudah tercakup live di dashboard W1). Semua angka
 * dihitung dari `laporan`, tidak pernah diinput manual — sehingga baris TOTAL
 * tidak bisa rusak seperti file lama (mis. sel `46268.0`/`2571.28`).
 *
 * Kolom "UPLOAD LAPORAN PA (link)" dari file lama sengaja TIDAK direplikasi
 * (PRD §10: "Tidak diperlukan — data sudah di sistem; PDF di-generate").
 *
 * Akses (PRD §3, §7.5): hanya Wakil Dekan I dan admin.
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
    const periodeId = target.id;
    const periodeLabel = `${target.tahunAkademik} ${target.semester === 'genap' ? 'Genap' : 'Ganjil'}`;

    const [lapSnap, subsSnap, mhsSnap] = await Promise.all([
      db.collection('laporan').where('periodeId', '==', periodeId).get(),
      db.collection('submissions').where('periodeId', '==', periodeId).get(),
      db.collection('mahasiswa').get(),
    ]);
    const laporan = lapSnap.docs.map((d) => d.data() as any);
    const subs = subsSnap.docs.map((d) => d.data() as any).sort((a, b) => a.nama.localeCompare(b.nama));
    const masterByNpm = new Map(mhsSnap.docs.map((d) => [(d.data() as any).npm, d.data() as any]));
    const masterOf = (l: any) => masterByNpm.get(l.npm) ?? {};

    // ── Sheet 1: REKAPITULASI LAPORAN PA ────────────────────────────────
    // Label semester mengikuti paritas periode (genap → 2,4,6..14; ganjil →
    // 1,3,5..13), sama seperti file lama yang selalu genap karena diekspor
    // pada periode genap. S2KM dibatasi 2 kolom (PRD §7.6: opsi 1–4).
    const genap = target.semester === 'genap';
    const semK3KL = genap ? [2, 4, 6, 8, 10, 12, 14] : [1, 3, 5, 7, 9, 11, 13];
    const semS2KM = genap ? [2, 4] : [1, 3];

    function prodiStats(records: any[], semesters: number[]): (number | string)[] {
      const semCounts = semesters.map(
        (s) => records.filter((l) => l.status === 'aktif' && l.semesterKe === s).length
      );
      const withIp = records.filter((l) => l.status === 'aktif' && l.akademik?.ipKhs != null);
      const ipk = withIp.length
        ? Number((withIp.reduce((sum, l) => sum + l.akademik.ipKhs, 0) / withIp.length).toFixed(2))
        : '—';
      return [...semCounts, ipk];
    }

    let totCuti = 0, totNonaktif = 0, totRekDO = 0, totHima = 0, totUkm = 0;
    let totPrestasi = 0, totBeasiswa = 0;
    let totSudahPkkmb = 0, totSudahToefl = 0, totSudahEsq = 0, totSudahSemkes = 0;
    let totBelumPkkmb = 0, totBelumToefl = 0, totBelumEsq = 0, totBelumSemkes = 0;
    let totLulusK3 = 0, totLulusKL = 0;

    const rekapRows = subs.map((s) => {
      const own = laporan.filter((l) => l.dosenPaUid === s.dosenUid);
      const k3 = own.filter((l) => l.prodi === 'K3');
      const kl = own.filter((l) => l.prodi === 'KL');
      const s2km = own.filter((l) => l.prodi === 'S2KM');

      const cuti = own.filter((l) => l.status === 'cuti').length;
      const nonaktif = own.filter((l) => l.status === 'non_aktif').length;
      // Rekomendasi DO hanya sah untuk mahasiswa non-aktif — status ikut
      // diperiksa agar flag lama yang tertinggal tidak ikut terhitung.
      const rekDO = own.filter((l) => l.status === 'non_aktif' && l.rekomendasiDO).length;
      const hima = own.filter((l) => l.nonAkademik?.hima).length;
      const ukmRecs = own.filter((l) => l.nonAkademik?.ukm);
      const ukm = ukmRecs.length;
      const ukmJenis = Array.from(
        new Set(ukmRecs.map((l) => l.nonAkademik?.ukmJenis).filter(Boolean))
      ).join(', ');

      const prestasiRecs = own.filter((l) => l.nonAkademik?.prestasi?.ada);
      const prestasiJenis = Array.from(
        new Set(prestasiRecs.map((l) => l.nonAkademik.prestasi.jenis).filter(Boolean))
      ).join(', ');
      const beasiswaRecs = own.filter((l) => l.nonAkademik?.beasiswa?.ada);
      const beasiswaJenis = Array.from(
        new Set(beasiswaRecs.map((l) => l.nonAkademik.beasiswa.jenis).filter(Boolean))
      ).join(', ');

      const sudahPkkmb = own.filter((l) => !!masterOf(l).pkkmb).length;
      const sudahToefl = own.filter((l) => !!masterOf(l).toefl).length;
      const sudahEsq = own.filter((l) => !!masterOf(l).esq).length;
      const sudahSemkes = own.filter((l) => (masterOf(l).semkesCount ?? 0) >= 8).length;
      const lulusK3 = k3.filter((l) => l.status === 'lulus').length;
      const lulusKL = kl.filter((l) => l.status === 'lulus').length;

      totCuti += cuti; totNonaktif += nonaktif; totRekDO += rekDO; totHima += hima; totUkm += ukm;
      totPrestasi += prestasiRecs.length; totBeasiswa += beasiswaRecs.length;
      totSudahPkkmb += sudahPkkmb; totSudahToefl += sudahToefl; totSudahEsq += sudahEsq; totSudahSemkes += sudahSemkes;
      totBelumPkkmb += own.length - sudahPkkmb; totBelumToefl += own.length - sudahToefl;
      totBelumEsq += own.length - sudahEsq; totBelumSemkes += own.length - sudahSemkes;
      totLulusK3 += lulusK3; totLulusKL += lulusKL;

      return [
        s.nama,
        ...prodiStats(k3, semK3KL),
        ...prodiStats(kl, semK3KL),
        ...prodiStats(s2km, semS2KM),
        cuti, nonaktif, rekDO,
        hima, ukm, ukmJenis,
        prestasiRecs.length, prestasiJenis,
        beasiswaRecs.length, beasiswaJenis,
        sudahPkkmb, sudahToefl, sudahEsq, sudahSemkes,
        own.length - sudahPkkmb, own.length - sudahToefl, own.length - sudahEsq, own.length - sudahSemkes,
        lulusK3, lulusKL,
      ];
    });

    // TOTAL: IPK per prodi = mean SELURUH record fakultas (PRD §6) — bukan
    // jumlah/rata-rata dari baris per dosen.
    const totalRow: (string | number)[] = [
      'TOTAL',
      ...prodiStats(laporan.filter((l) => l.prodi === 'K3'), semK3KL),
      ...prodiStats(laporan.filter((l) => l.prodi === 'KL'), semK3KL),
      ...prodiStats(laporan.filter((l) => l.prodi === 'S2KM'), semS2KM),
      totCuti, totNonaktif, totRekDO,
      totHima, totUkm, '',
      totPrestasi, '',
      totBeasiswa, '',
      totSudahPkkmb, totSudahToefl, totSudahEsq, totSudahSemkes,
      totBelumPkkmb, totBelumToefl, totBelumEsq, totBelumSemkes,
      totLulusK3, totLulusKL,
    ];

    // Header 3-baris meniru file lama (grup prodi bertingkat + grup 2-baris
    // sederhana) — dibangun terprogram karena lebar grup mengikuti paritas semester.
    const HEADER_ROWS = 3;
    const TITLE_ROWS = 3; // judul + label periode + baris kosong, mendahului header
    const row0: any[] = ['NAMA DOSEN PA'];
    const row1: any[] = [''];
    const row2: any[] = [''];
    const merges: XLSX.Range[] = [
      { s: { r: TITLE_ROWS, c: 0 }, e: { r: TITLE_ROWS + HEADER_ROWS - 1, c: 0 } },
    ];
    let col = 1;

    function prodiGroup(label: string, semesters: number[]) {
      const start = col;
      semesters.forEach((s) => {
        row0[col] = ''; row1[col] = ''; row2[col] = `SEM ${s}`;
        col++;
      });
      const semEnd = col - 1;
      row0[col] = ''; row1[col] = 'IPK RATA-RATA'; row2[col] = '';
      merges.push({ s: { r: TITLE_ROWS + 1, c: col }, e: { r: TITLE_ROWS + 2, c: col } });
      const ipkCol = col;
      col++;
      row0[start] = label;
      merges.push({ s: { r: TITLE_ROWS, c: start }, e: { r: TITLE_ROWS, c: ipkCol } });
      row1[start] = 'JUMLAH MAHASISWA BIMBINGAN AKTIF';
      if (semEnd > start) merges.push({ s: { r: TITLE_ROWS + 1, c: start }, e: { r: TITLE_ROWS + 1, c: semEnd } });
    }

    function simpleGroup(label: string, leaves: string[]) {
      const start = col;
      leaves.forEach((l) => { row0[col] = ''; row1[col] = ''; row2[col] = l; col++; });
      const end = col - 1;
      row0[start] = label;
      merges.push({ s: { r: TITLE_ROWS, c: start }, e: { r: TITLE_ROWS + 1, c: end } });
    }

    prodiGroup('PRODI K3', semK3KL);
    prodiGroup('PRODI KESEHATAN LINGKUNGAN', semK3KL);
    prodiGroup('PRODI MAGISTER KESEHATAN MASYARAKAT', semS2KM);
    simpleGroup('JUMLAH MAHASISWA', ['CUTI', 'TIDAK AKTIF', 'REKOMENDASI DO']);
    simpleGroup('JUMLAH MAHASISWA DALAM KEIKUTSERTAAN ORGANISASI', ['HIMA', 'UKM', 'JENIS UKM']);
    simpleGroup('PRESTASI', ['JUMLAH', 'JENIS']);
    simpleGroup('BEASISWA', ['JUMLAH', 'JENIS']);
    simpleGroup('JUMLAH MAHASISWA SUDAH MENGIKUTI', ['PKKMB', 'TOEFL', 'ESQ', 'SEMINAR/WORKSHOP']);
    simpleGroup('JUMLAH MAHASISWA YANG BELUM MENGIKUTI', ['PKKMB', 'TOEFL', 'ESQ', 'SEMINAR/WORKSHOP']);
    simpleGroup('JUMLAH MAHASISWA PA YANG LULUS', ['K3', 'KL']);

    const sheet1 = XLSX.utils.aoa_to_sheet([
      ['REKAPITULASI LAPORAN PEMBIMBING AKADEMIK — FIKes UIS'],
      [`Periode ${periodeLabel}`],
      [],
      row0, row1, row2,
      ...rekapRows,
      totalRow,
      [],
      ['Catatan: seluruh angka rekap dihitung otomatis dari record laporan (PRD §6) — tidak pernah diinput manual,'],
      ['sehingga baris TOTAL tidak dapat rusak seperti pada file rekap manual periode sebelumnya.'],
      ['Struktur kolom mengikuti format REKAPAN LAPORAN PA yang sudah dikenal (PRD §5.4, §10).'],
    ]);
    sheet1['!merges'] = merges;
    sheet1['!cols'] = row2.map((_, i) => ({ wch: i === 0 ? 32 : 8 }));
    // Kolom teks bebas (JENIS UKM/prestasi/beasiswa) dan header panjang
    // ("REKOMENDASI DO") dilebarkan. Indeksnya DITURUNKAN dari label header,
    // bukan di-hardcode — tiap kali satu kolom baru disisipkan di grup
    // sebelumnya, indeks kolom JENIS ikut bergeser dan pernah salah karenanya.
    row2.forEach((label: any, c: number) => {
      if (typeof label !== 'string' || !sheet1['!cols']![c]) return;
      if (label.includes('JENIS')) sheet1['!cols']![c] = { wch: 20 };
      else if (label === 'REKOMENDASI DO') sheet1['!cols']![c] = { wch: 16 };
    });

    // ── Sheet 2: PROPOSAL SKRIPSI — urutan kolom identik file lama ──────
    const tahapLabel: Record<string, string> = {
      belum: 'Belum mulai', pengajuan_judul: 'Pengajuan judul', acc_judul: 'ACC judul',
      bimbingan_proposal: 'Bimbingan proposal', sempro: 'Seminar proposal', penelitian: 'Penelitian',
      bimbingan_skripsi: 'Bimbingan skripsi', sidang: 'Sidang', lulus: 'Lulus',
    };
    const namaByUid = new Map(subs.map((s) => [s.dosenUid, s.nama]));
    const finalYear = laporan
      .filter((l) => (l.semesterKe ?? 0) >= 7)
      .sort((a, b) => String(a.npm).localeCompare(String(b.npm)));
    const sheet2 = XLSX.utils.aoa_to_sheet([
      ['PROPOSAL SKRIPSI — MAHASISWA TINGKAT AKHIR'],
      [`Periode ${periodeLabel}`],
      [],
      ['No', 'Dosen PA', 'Nama Mahasiswa', 'NPM', 'Prodi', 'Progres', 'Kendala'],
      ...finalYear.map((l, i) => [
        i + 1,
        namaByUid.get(l.dosenPaUid) ?? '—',
        (masterByNpm.get(l.npm) ?? {}).nama ?? '',
        String(l.npm), // NPM as text — never a number (PRD §4, bug lama: notasi ilmiah)
        l.prodi,
        tahapLabel[l.skripsi?.tahap] ?? l.skripsi?.tahap ?? '',
        l.skripsi?.kendala || '—',
      ]),
    ]);
    sheet2['!cols'] = [{ wch: 4 }, { wch: 30 }, { wch: 28 }, { wch: 16 }, { wch: 7 }, { wch: 20 }, { wch: 34 }];

    // ── Sheet 3: DISTRIBUSI DOSEN PA ─────────────────────────────────────
    // Struktur inti file lama (No/Nama/Prodi K3-KL-S2KM/Total) direplikasi;
    // 6 kolom tambahan tanpa judul di file lama TIDAK direplikasi — terbukti
    // saling tidak konsisten (mis. total silang 84 vs Total resmi 72 untuk
    // salah satu dosen), jadi tidak layak dijadikan acuan struktur baku.
    let sh3TotK3 = 0, sh3TotKL = 0, sh3TotS2KM = 0;
    const sheet3Rows = subs.map((s, i) => {
      const own = laporan.filter((l) => l.dosenPaUid === s.dosenUid);
      const k3n = own.filter((l) => l.prodi === 'K3').length;
      const kln = own.filter((l) => l.prodi === 'KL').length;
      const s2n = own.filter((l) => l.prodi === 'S2KM').length;
      sh3TotK3 += k3n; sh3TotKL += kln; sh3TotS2KM += s2n;
      return [i + 1, s.nama, k3n, kln, s2n, k3n + kln + s2n];
    });
    const sheet3 = XLSX.utils.aoa_to_sheet([
      ['DISTRIBUSI DOSEN PA'],
      [`Periode ${periodeLabel}`],
      [],
      ['NO', 'NAMA DOSEN PA', 'PRODI', '', '', 'TOTAL'],
      ['', '', 'K3', 'KESEHATAN LINGKUNGAN', 'S2 KESEHATAN MASYARAKAT', ''],
      ...sheet3Rows,
      ['TOTAL', '', sh3TotK3, sh3TotKL, sh3TotS2KM, sh3TotK3 + sh3TotKL + sh3TotS2KM],
    ]);
    sheet3['!merges'] = [
      { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
      { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
      { s: { r: 3, c: 2 }, e: { r: 3, c: 4 } },
      { s: { r: 3, c: 5 }, e: { r: 4, c: 5 } },
    ];
    sheet3['!cols'] = [{ wch: 4 }, { wch: 32 }, { wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 9 }];

    // ── Sheet 4: BUKTI — lampiran audit (AMI/LAM-PTKes), 1 baris per item ──
    // bukti yang benar-benar diunggah (opsional — lihat PRD diskusi bukti).
    // Tidak ada acuan format lama untuk sheet ini (fitur baru), jadi bebas
    // dirancang: satu mahasiswa bisa muncul >1 baris bila punya >1 bukti.
    const buktiRows: { npm: string; nama: string; prodi: string; dosen: string; jenis: string; link: string }[] = [];
    laporan.forEach((l) => {
      const m = masterByNpm.get(l.npm) ?? {};
      const nama = m.nama ?? String(l.npm);
      const dosen = namaByUid.get(l.dosenPaUid) ?? '—';
      const push = (jenis: string, link?: string) => {
        if (link) buktiRows.push({ npm: String(l.npm), nama, prodi: l.prodi, dosen, jenis, link });
      };
      push('PKKMB', m.pkkmbBukti);
      push('TOEFL', m.toeflBukti);
      push('ESQ', m.esqBukti);
      push('Organisasi', l.nonAkademik?.organisasiBukti);
      push('Beasiswa', l.nonAkademik?.beasiswa?.bukti);
      push('Prestasi', l.nonAkademik?.prestasi?.bukti);
    });
    buktiRows.sort((a, b) => a.npm.localeCompare(b.npm) || a.jenis.localeCompare(b.jenis));

    const sheet4 = XLSX.utils.aoa_to_sheet([
      ['LAMPIRAN BUKTI — untuk audit mutu internal (AMI/LAM-PTKes)'],
      [`Periode ${periodeLabel}`],
      [],
      ['No', 'NPM', 'Nama', 'Prodi', 'Dosen PA', 'Jenis Bukti', 'Link'],
      ...(buktiRows.length
        ? buktiRows.map((r, i) => [i + 1, r.npm, r.nama, r.prodi, r.dosen, r.jenis, r.link])
        : [['—', '—', 'Belum ada bukti yang diunggah pada periode ini.', '', '', '', '']]),
    ]);
    sheet4['!cols'] = [{ wch: 4 }, { wch: 16 }, { wch: 28 }, { wch: 7 }, { wch: 30 }, { wch: 12 }, { wch: 55 }];

    // ── Sheet 5: REKOMENDASI DO — daftar nama yang bisa ditindaklanjuti ──
    // Sheet REKAPITULASI hanya memuat JUMLAH per dosen; Wakil Dekan I perlu
    // tahu SIAPA saja mahasiswanya tanpa harus membuka PDF tiap dosen satu
    // per satu. Status non-aktif ikut difilter (bukan hanya flag-nya) supaya
    // flag lama yang tertinggal dari status sebelumnya tidak ikut terdaftar.
    const doRows = laporan
      .filter((l) => l.status === 'non_aktif' && l.rekomendasiDO)
      .sort((a, b) => String(a.npm).localeCompare(String(b.npm)));

    const sheet5 = XLSX.utils.aoa_to_sheet([
      ['REKOMENDASI DROP OUT (DO) — usulan Dosen PA atas mahasiswa non-aktif'],
      [`Periode ${periodeLabel}`],
      [],
      ['No', 'NPM', 'Nama', 'Prodi', 'Smt', 'Dosen PA', 'Permasalahan', 'Rekomendasi'],
      ...(doRows.length
        ? doRows.map((l, i) => [
            i + 1,
            String(l.npm), // NPM sebagai teks — jangan pernah jadi angka (PRD §4)
            (masterByNpm.get(l.npm) ?? {}).nama ?? '',
            l.prodi,
            l.semesterKe ?? '',
            namaByUid.get(l.dosenPaUid) ?? '—',
            l.permasalahan || '—',
            l.rekomendasi || '—',
          ])
        : [['—', '—', 'Tidak ada mahasiswa yang direkomendasikan DO pada periode ini.', '', '', '', '', '']]),
      [],
      ['Catatan: usulan ini berasal dari Dosen PA melalui form laporan bimbingan dan bukan keputusan akhir fakultas.'],
    ]);
    sheet5['!cols'] = [{ wch: 4 }, { wch: 16 }, { wch: 28 }, { wch: 7 }, { wch: 5 }, { wch: 30 }, { wch: 45 }, { wch: 45 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet1, 'REKAPITULASI');
    XLSX.utils.book_append_sheet(wb, sheet2, 'PROPOSAL SKRIPSI');
    XLSX.utils.book_append_sheet(wb, sheet3, 'DISTRIBUSI DOSEN PA');
    XLSX.utils.book_append_sheet(wb, sheet4, 'BUKTI');
    XLSX.utils.book_append_sheet(wb, sheet5, 'REKOMENDASI DO');
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Rekap_Fakultas_${periodeId}.xlsx"`,
      },
    });
  } catch (e: any) {
    return new Response(`Gagal membuat Excel: ${e?.message ?? e}`, { status: 500 });
  }
}
