import { SEMKES_MAX } from './types';
import type { KonsultasiEntry, MahasiswaRecord } from './types';

/** Label tampilan satu entri konsultasi, mis. "KRS" atau custom "Bimbingan skripsi tambahan". */
export function konsultasiJenisLabel(entry: KonsultasiEntry): string {
  return entry.jenis === 'lainnya' ? entry.jenisLainnya?.trim() || 'Lainnya' : entry.jenis;
}

/**
 * Kelengkapan (completeness) — ported verbatim from the prototype
 * computeStatusPengisian. Cuti/non-aktif records only need a narrative;
 * active records need academic data + a recommendation to be "lengkap".
 */
export function computeStatusPengisian(rec: MahasiswaRecord): MahasiswaRecord['statusPengisian'] {
  // 'mengundurkan_diri' diperlakukan sama seperti cuti/non-aktif: mahasiswanya
  // sudah tidak berkuliah, jadi yang dibutuhkan hanya narasi — bukan KRS/KHS.
  if (rec.status === 'cuti' || rec.status === 'non_aktif' || rec.status === 'mengundurkan_diri') {
    return rec.permasalahan && rec.permasalahan.trim() ? 'lengkap' : 'kosong';
  }
  const a = rec.akademik;
  const akademikFilled = a.sksKrs != null && a.ipKhs != null;
  const hasRekomendasi = !!(rec.rekomendasi && rec.rekomendasi.trim());
  const anyFilled =
    akademikFilled ||
    a.konsultasi.length > 0 ||
    !!(rec.permasalahan && rec.permasalahan.trim()) ||
    hasRekomendasi;
  if (akademikFilled && hasRekomendasi) return 'lengkap';
  return anyFilled ? 'sebagian' : 'kosong';
}

export interface Badge {
  label: string;
}

/**
 * Early-warning badges (PRD §5.2 D4) di halaman riwayat per-mahasiswa.
 *
 * Sekadar pembungkus alasanPerhatian: kriterianya persis sama, dan dulu
 * ditulis terpisah sehingga sempat berselisih — syarat semkes ada di sini
 * tapi tidak ikut menghitung angka "perlu perhatian" di dashboard.
 */
export function computeBadges(rec: MahasiswaRecord | null): Badge[] {
  if (!rec) return [];
  return alasanPerhatian(rec).map((label) => ({ label }));
}

/**
 * Alasan mengapa seorang mahasiswa masuk hitungan "perlu perhatian".
 *
 * Satu-satunya definisi kriteria itu: needsAttention hanya memeriksa apakah
 * daftar ini kosong, dan panel rinciannya menampilkan isinya. Dengan begitu
 * angka pada dashboard dan daftar nama yang muncul saat diklik tidak mungkin
 * berbeda — dulu keduanya akan gampang berselisih karena kriterianya ditulis
 * dua kali.
 *
 * computeBadges di halaman riwayat per-mahasiswa membaca daftar yang sama,
 * sehingga penanda di kedua tempat selalu berarti hal yang persis sama.
 */
export function alasanPerhatian(m: MahasiswaRecord): string[] {
  const out: string[] = [];
  const h = m.ipHistory;
  if (
    h.length >= 3 &&
    h[h.length - 1].ip < h[h.length - 2].ip &&
    h[h.length - 2].ip < h[h.length - 3].ip
  ) {
    out.push('IP turun 2 semester berturut-turut');
  }
  if (m.akademik.ipKhs != null && m.akademik.ipKhs < 2.75) {
    // Nilai 0 hampir selalu berarti IP-nya belum diisi, bukan prestasi nol —
    // dibedakan supaya dosen tidak mengira ada 45 mahasiswa bermasalah berat.
    out.push(
      m.akademik.ipKhs === 0
        ? 'IP tercatat 0 — kemungkinan besar belum diisi, bukan nilai sebenarnya'
        : `IP ${m.akademik.ipKhs.toFixed(2)} di bawah 2,75`
    );
  }
  if (!m.toefl && m.semesterKe >= 6) {
    out.push(`Belum TOEFL padahal sudah semester ${m.semesterKe}`);
  }
  if (m.semkes.length < SEMKES_MAX && m.semesterKe >= 7) {
    out.push(`Baru ${m.semkes.length} dari ${SEMKES_MAX} semkes padahal sudah semester ${m.semesterKe} (menjelang skripsi)`);
  }
  if (m.status === 'aktif' && m.akademik.konsultasi.length === 0) {
    out.push('Belum ada catatan konsultasi pada periode ini');
  }
  return out;
}

/** True when the student meets any early-warning condition (dashboard "perhatian"). */
export function needsAttention(m: MahasiswaRecord): boolean {
  return alasanPerhatian(m).length > 0;
}

export interface DosenStats {
  total: number;
  lengkap: number;
  sebagian: number;
  kosong: number;
  percent: number;
  allLengkap: boolean;
  notLengkap: number;
}

export function computeDosenStats(list: MahasiswaRecord[]): DosenStats {
  const total = list.length;
  const lengkap = list.filter((m) => m.statusPengisian === 'lengkap').length;
  const sebagian = list.filter((m) => m.statusPengisian === 'sebagian').length;
  const kosong = list.filter((m) => m.statusPengisian === 'kosong').length;
  const percent = total ? Math.round((lengkap / total) * 100) : 0;
  return { total, lengkap, sebagian, kosong, percent, allLengkap: lengkap === total, notLengkap: total - lengkap };
}

export interface ProdiIpk {
  prodi: string;
  /** Rata-rata IP semester (KHS periode ini). */
  rataIp: string;
  nIp: number;
  /** Rata-rata IPK kumulatif. */
  rataIpk: string;
  nIpk: number;
}

/**
 * Rata-rata satu kolom akademik, "—" bila belum ada yang terisi.
 * Dipakai bersama oleh dashboard dosen, dashboard wadek, dan ekspor.
 */
/**
 * Mahasiswa semester 1 TIDAK ikut dihitung dalam rata-rata IP/IPK.
 *
 * Pada penomoran laporan, semester 1 berarti mahasiswa yang baru AKAN memulai
 * kuliah — belum ada satu pun nilai yang sah untuk dirata-ratakan. Yang
 * terlanjur terisi hampir seluruhnya berupa 0 pengisi tempat (pada periode
 * 2025/2026 Genap: 284 dari 287 record ber-IP, dan 267 dari 272 ber-IPK), dan
 * itu menyeret rata-rata fakultas turun jauh — IPK K3 terbaca 3,17 padahal
 * tanpa mereka 3,95.
 *
 * Yang dikecualikan hanya PERHITUNGAN rata-ratanya. Barisnya tetap tampil di
 * tabel, daftar bimbingan, dan ekspor seperti biasa.
 */
export function ikutRataAkademik(m: { semesterKe: number }): boolean {
  return m.semesterKe !== 1;
}

function rataKolom(
  list: MahasiswaRecord[],
  ambil: (m: MahasiswaRecord) => number | null | undefined
): { rata: string; n: number } {
  const terisi = list.filter((m) => ikutRataAkademik(m) && ambil(m) != null);
  if (!terisi.length) return { rata: '—', n: 0 };
  const mean = terisi.reduce((sum, m) => sum + (ambil(m) as number), 0) / terisi.length;
  return { rata: mean.toFixed(2), n: terisi.length };
}

/**
 * Rata-rata IP semester DAN IPK per prodi dari satu kumpulan record (mis.
 * bimbingan seorang dosen PA). Hanya prodi yang punya ≥1 mahasiswa AKTIF yang
 * dikembalikan. Dipakai di dashboard dosen dan modal verifikasi wadek.
 *
 * Keduanya dilaporkan terpisah, dengan n masing-masing: IP semester bisa belum
 * terisi sementara IPK sudah, dan sebaliknya — menggabungkannya jadi satu angka
 * pernah membuat prodi tampak ber-rata-rata 0,00 padahal IPK-nya baik.
 */
export function computeIpkPerProdi(list: MahasiswaRecord[]): ProdiIpk[] {
  const order = ['K3', 'KL', 'S2KM'];
  const activeProdi = new Set<string>();
  list.forEach((m) => { if (m.status === 'aktif') activeProdi.add(m.prodi); });
  return Array.from(activeProdi)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((prodi) => {
      const aktif = list.filter((m) => m.prodi === prodi && m.status === 'aktif');
      const ip = rataKolom(aktif, (m) => m.akademik.ipKhs);
      const ipk = rataKolom(aktif, (m) => m.akademik.ipk);
      return { prodi, rataIp: ip.rata, nIp: ip.n, rataIpk: ipk.rata, nIpk: ipk.n };
    });
}

export interface DosenRekap {
  /** Rata-rata IP semester seluruh bimbingan aktif. */
  ipRataStr: string;
  /** Rata-rata IPK kumulatif seluruh bimbingan aktif. */
  ipkRataStr: string;
  /** Rincian IPK rata-rata per prodi bimbingan (dosen sering lintas prodi). */
  ipkPerProdi: ProdiIpk[];
  organisasi: number;
  beasiswa: number;
  prestasi: number;
  cutiNonaktif: number;
  perhatian: number;
}

/** Personal live rekap for a dosen (PRD §6, §5.2 D1). */
export function computeDosenRekap(list: MahasiswaRecord[]): DosenRekap {
  const aktif = list.filter((m) => m.status === 'aktif');
  return {
    ipRataStr: rataKolom(aktif, (m) => m.akademik.ipKhs).rata,
    ipkRataStr: rataKolom(aktif, (m) => m.akademik.ipk).rata,
    ipkPerProdi: computeIpkPerProdi(list),
    organisasi: list.filter((m) => m.nonAkademik.ukm || m.nonAkademik.hima || m.nonAkademik.bem).length,
    beasiswa: list.filter((m) => m.nonAkademik.beasiswa.ada).length,
    prestasi: list.filter((m) => m.nonAkademik.prestasi.ada).length,
    cutiNonaktif: list.filter(
      (m) => m.status === 'cuti' || m.status === 'non_aktif' || m.status === 'mengundurkan_diri'
    ).length,
    perhatian: list.filter(needsAttention).length,
  };
}

/**
 * Nomor semester yang DITULIS pada laporan periode.
 *
 *   (tahunPeriodeAwal − angkatan) × 2 + (genap ? 3 : 2)
 *
 * Satu lebih tinggi daripada semester yang sedang berjalan, dan itu memang
 * disengaja: laporan disusun dosen PA pada AWAL semester berikutnya, dan isinya
 * mencakup KRS semester yang akan dijalani beserta KHS semester yang baru saja
 * selesai. Jadi pada pelaporan genap 2025/2026, mahasiswa yang sedang di
 * semester 8 ditulis semester 9, dan mahasiswa baru angkatan 2026 — yang baru
 * akan memulai kuliah — ditulis semester 1.
 *
 * Berlaku untuk kedua jenis periode, sehingga penomorannya naik satu tiap
 * periode tanpa putus: 1, 2, 3, … Rumus lama (+2/+1) menulis semester yang
 * sedang berjalan, sehingga mahasiswa baru tidak punya nomor sama sekali (0).
 */
export function computeSemesterKe(
  angkatan: number,
  tahunPeriodeAwal: number,
  semester: 'ganjil' | 'genap'
): number {
  return (tahunPeriodeAwal - angkatan) * 2 + (semester === 'genap' ? 3 : 2);
}

/**
 * Keterangan untuk kolom SKS (KRS): semester mana yang SKS-nya diisi.
 *
 * Pasangan dari keteranganIpKhs, dan sengaja disandingkan: dua kolom yang
 * bersebelahan ini merujuk semester BERBEDA — SKS mengikuti semester yang
 * tertulis, IP mengikuti satu di bawahnya. Menjelaskan salah satunya saja
 * justru memancing pertanyaan tentang yang lain.
 *
 * Tidak ada kasus khusus semester 1: mahasiswa baru memang sudah mengambil
 * KRS untuk semester 1, jadi kolom ini bisa diisi sejak awal — berbeda dari
 * IP yang belum ada nilainya.
 */
export function keteranganSksKrs(semesterKe: number): string {
  if (!Number.isFinite(semesterKe) || semesterKe < 1) {
    return 'Diisi jumlah SKS yang diambil pada semester yang tertulis di atas.';
  }
  return `Diisi jumlah SKS yang diambil pada semester ${semesterKe} — semester yang tertulis di atas.`;
}

/**
 * Keterangan untuk kolom IP (KHS): semester mana yang nilainya diisi.
 *
 * Nomor semester pada laporan adalah semester yang AKAN dijalani (lihat
 * computeSemesterKe), sedangkan KHS yang dilaporkan berasal dari semester yang
 * BARU SELESAI — satu di bawahnya. Selisih satu langkah itu tidak terbaca dari
 * form, dan berulang kali membuat pengisi ragu: IP semester yang mana.
 *
 * Nomornya disebut apa adanya (mis. "IP semester 8") alih-alih kalimat umum
 * "semester sebelumnya", supaya tidak perlu dihitung sendiri saat mengisi.
 */
export function keteranganIpKhs(semesterKe: number): string {
  if (!Number.isFinite(semesterKe) || semesterKe <= 1) {
    return 'Mahasiswa baru — belum ada semester yang selesai, jadi IP belum bisa diisi.';
  }
  return `Diisi IP semester ${semesterKe - 1} — semester yang baru selesai, bukan semester ${semesterKe} yang tertulis di atas.`;
}

// ─── W1: Faculty-wide aggregates (PRD §6) ────────────────────────────────
// Every number is computed from laporan records — never entered manually.

/**
 * Dinaikkan setiap kali DEFINISI sebuah angka rekap berubah (bukan sekadar
 * datanya). rekapCache yang versinya tidak cocok dihitung ulang sendiri —
 * tanpa itu Wakil Dekan I terus melihat angka lama sampai ada yang kebetulan
 * menekan Segarkan, dan tidak ada satu pun tanda bahwa angkanya usang.
 *
 * 2 — semester 1 dikeluarkan dari rata-rata IP/IPK (lihat ikutRataAkademik).
 * 1 — rata-rata IP semester dan IPK dipisah jadi dua angka.
 */
export const VERSI_REKAP = 2;

export interface WadekAggregates {
  /** Lihat VERSI_REKAP. Tidak ada pada cache yang ditulis sebelum penomoran ini. */
  versiRekap?: number;
  status: {
    aktif: number;
    cuti: number;
    nonAktif: number;
    lulus: number;
    /** Pengajuan pengunduran diri yang masih menunggu keputusan Wakil Dekan I.
     * Opsional: rekapCache yang tersimpan sebelum fitur ini ada tidak punya
     * angka tersebut, dan pembacanya harus tahan terhadap itu. */
    mengundurkanDiri?: number;
  };
  prodiIpk: ProdiIpk[];
  nonAkademik: { organisasi: number; beasiswa: number; prestasi: number };
  masterField: { pkkmb: string; toefl: string; esq: string; semkes: string };
  skripsiTahap: { label: string; count: number }[];
  /** Skripsi progress broken down per prodi — lets W1 filter without a re-fetch. */
  skripsiTahapByProdi: Record<string, { label: string; count: number }[]>;
  /** Distribusi mahasiswa per semester (PRD §5.4 W1). */
  semesterDistribution: { semesterKe: number; count: number }[];
  /** Breakdown beasiswa per jenis (PRD §6: "breakdown per jenis"). */
  beasiswaByJenis: { jenis: string; count: number }[];
  /** Breakdown prestasi per tingkat. */
  prestasiByTingkat: { tingkat: string; count: number }[];
  /** Distribusi jumlah semkes diikuti (PRD §6: "tampilkan juga distribusi"). */
  semkesDistribution: { label: string; count: number }[];
  krsFlag: { npm: string; nama: string; prodi: string; dosen: string }[];
  total: number;
}

const SKRIPSI_LABELS: [string, string][] = [
  ['belum', 'Belum mulai'],
  ['pengajuan_judul', 'Pengajuan judul'],
  ['acc_judul', 'ACC judul'],
  ['bimbingan_proposal', 'Bimbingan proposal'],
  ['sempro', 'Seminar proposal'],
  ['penelitian', 'Penelitian'],
  ['bimbingan_skripsi', 'Bimbingan skripsi'],
  ['sidang', 'Sidang'],
  ['lulus', 'Lulus'],
];

export function computeWadekAggregates(
  records: MahasiswaRecord[],
  dosenNamaByUid: Map<string, string>
): WadekAggregates {
  const total = records.length;
  const count = (f: (m: MahasiswaRecord) => boolean) => records.filter(f).length;

  // IPK rata-rata prodi: mean over ALL active records with ipKhs — never a
  // mean of per-dosen means (PRD §6).
  const prodiIpk: ProdiIpk[] = (['K3', 'KL', 'S2KM'] as const).map((prodi) => {
    const aktif = records.filter((m) => m.prodi === prodi && m.status === 'aktif');
    const ip = rataKolom(aktif, (m) => m.akademik.ipKhs);
    const ipk = rataKolom(aktif, (m) => m.akademik.ipk);
    return { prodi, rataIp: ip.rata, nIp: ip.n, rataIpk: ipk.rata, nIpk: ipk.n };
  });

  // Skripsi distribution over final-year students (semesterKe ≥ 7).
  const finalYear = records.filter((m) => m.semesterKe >= 7);
  const tahapCounts = (list: MahasiswaRecord[]) =>
    SKRIPSI_LABELS.map(([key, label]) => ({
      label,
      count: list.filter((m) => m.skripsi.tahap === key).length,
    }));
  const skripsiTahap = tahapCounts(finalYear);
  const skripsiTahapByProdi: Record<string, { label: string; count: number }[]> = {};
  for (const prodi of ['K3', 'KL', 'S2KM']) {
    skripsiTahapByProdi[prodi] = tahapCounts(finalYear.filter((m) => m.prodi === prodi));
  }

  // Sebaran mahasiswa per semester (PRD §5.4 W1).
  const semesterMap = new Map<number, number>();
  records.forEach((m) => semesterMap.set(m.semesterKe, (semesterMap.get(m.semesterKe) ?? 0) + 1));
  const semesterDistribution = Array.from(semesterMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([semesterKe, cnt]) => ({ semesterKe, count: cnt }));

  // Breakdown beasiswa per jenis & prestasi per tingkat (PRD §6).
  const beasiswaMap = new Map<string, number>();
  const prestasiMap = new Map<string, number>();
  records.forEach((m) => {
    if (m.nonAkademik.beasiswa.ada) {
      const jenis = m.nonAkademik.beasiswa.jenis ?? 'lainnya';
      beasiswaMap.set(jenis, (beasiswaMap.get(jenis) ?? 0) + 1);
    }
    if (m.nonAkademik.prestasi.ada) {
      const tingkat = m.nonAkademik.prestasi.tingkat ?? '—';
      prestasiMap.set(tingkat, (prestasiMap.get(tingkat) ?? 0) + 1);
    }
  });
  const beasiswaByJenis = Array.from(beasiswaMap.entries()).map(([jenis, cnt]) => ({ jenis, count: cnt }));
  const prestasiByTingkat = Array.from(prestasiMap.entries()).map(([tingkat, cnt]) => ({ tingkat, count: cnt }));

  // Distribusi jumlah semkes diikuti (PRD §6: "sudah = ≥8; tampilkan juga distribusi").
  const semkesBuckets: [string, (n: number) => boolean][] = [
    ['0', (n) => n === 0],
    ['1–3', (n) => n >= 1 && n <= 3],
    ['4–7', (n) => n >= 4 && n <= 7],
    ['8+', (n) => n >= 8],
  ];
  const semkesDistribution = semkesBuckets.map(([label, test]) => ({
    label,
    count: records.filter((m) => test(m.semkes.length)).length,
  }));

  return {
    versiRekap: VERSI_REKAP,
    status: {
      aktif: count((m) => m.status === 'aktif'),
      cuti: count((m) => m.status === 'cuti'),
      nonAktif: count((m) => m.status === 'non_aktif'),
      lulus: count((m) => m.status === 'lulus'),
      /** Pengajuan pengunduran diri yang masih menunggu keputusan Wakil Dekan I. */
      mengundurkanDiri: count((m) => m.status === 'mengundurkan_diri'),
    },
    prodiIpk,
    nonAkademik: {
      organisasi: count((m) => m.nonAkademik.ukm || m.nonAkademik.hima || m.nonAkademik.bem),
      beasiswa: count((m) => m.nonAkademik.beasiswa.ada),
      prestasi: count((m) => m.nonAkademik.prestasi.ada),
    },
    masterField: {
      pkkmb: `${count((m) => m.pkkmb)}/${total}`,
      toefl: `${count((m) => m.toefl)}/${total}`,
      esq: `${count((m) => m.esq)}/${total}`,
      semkes: `${count((m) => m.semkes.length >= SEMKES_MAX)}/${total}`,
    },
    skripsiTahap,
    skripsiTahapByProdi,
    semesterDistribution,
    beasiswaByJenis,
    prestasiByTingkat,
    semkesDistribution,
    krsFlag: records
      .filter((m) => m.status === 'aktif' && m.akademik.sksKrs == null)
      .map((m) => ({
        npm: m.npm,
        nama: m.nama,
        prodi: m.prodi,
        dosen: dosenNamaByUid.get(m.dosenPaUid ?? '') ?? '—',
      })),
    total,
  };
}

// ─── W1: drill-down detail (klik kartu IPK prodi / kotak rekap fakultas) ──

export interface DosenIpkRow {
  dosenUid: string;
  dosen: string;
  /** Rata-rata IP semester bimbingan dosen ini di prodi tsb. */
  rataIp: string;
  nIp: number;
  /** Rata-rata IPK kumulatif. */
  rataIpk: string;
  nIpk: number;
}

/** Rata-rata IP & IPK per dosen PA dalam satu prodi (drill-down kartu prodi). */
export function computeIpkPerDosen(
  records: MahasiswaRecord[],
  dosenNamaByUid: Map<string, string>,
  prodi: string
): DosenIpkRow[] {
  // Dosen ikut terdaftar bila punya mahasiswa aktif di prodi ini, meski IP
  // maupun IPK-nya belum ada satu pun — barisnya tampil "—", bukan hilang,
  // supaya Wakil Dekan I melihat siapa yang datanya memang belum masuk.
  const scoped = records.filter((m) => m.prodi === prodi && m.status === 'aktif');
  const byDosen = new Map<string, MahasiswaRecord[]>();
  scoped.forEach((m) => {
    const uid = m.dosenPaUid ?? '';
    byDosen.set(uid, [...(byDosen.get(uid) ?? []), m]);
  });
  return Array.from(byDosen.entries())
    .map(([uid, list]) => {
      const ip = rataKolom(list, (m) => m.akademik.ipKhs);
      const ipk = rataKolom(list, (m) => m.akademik.ipk);
      return {
        dosenUid: uid,
        dosen: dosenNamaByUid.get(uid) ?? '—',
        rataIp: ip.rata,
        nIp: ip.n,
        rataIpk: ipk.rata,
        nIpk: ipk.n,
      };
    })
    .sort((a, b) => b.nIpk - a.nIpk || b.nIp - a.nIp);
}

export type DrilldownKey =
  | 'cuti'
  | 'non_aktif'
  | 'lulus'
  | 'organisasi'
  | 'beasiswa'
  | 'prestasi'
  | 'belum_toefl'
  | 'belum_pkkmb'
  | 'belum_esq';

export interface DrilldownRow {
  npm: string;
  nama: string;
  prodi: string;
  dosen: string;
}

const DRILLDOWN_PREDICATES: Record<DrilldownKey, (m: MahasiswaRecord) => boolean> = {
  cuti: (m) => m.status === 'cuti',
  non_aktif: (m) => m.status === 'non_aktif',
  lulus: (m) => m.status === 'lulus',
  organisasi: (m) => m.nonAkademik.ukm || m.nonAkademik.hima || m.nonAkademik.bem,
  beasiswa: (m) => m.nonAkademik.beasiswa.ada,
  prestasi: (m) => m.nonAkademik.prestasi.ada,
  belum_toefl: (m) => !m.toefl,
  belum_pkkmb: (m) => !m.pkkmb,
  belum_esq: (m) => !m.esq,
};

/** Daftar mahasiswa untuk satu kotak rekap fakultas (dikelompokkan per prodi oleh caller). */
export function computeDrilldownList(
  records: MahasiswaRecord[],
  dosenNamaByUid: Map<string, string>,
  key: DrilldownKey
): DrilldownRow[] {
  return records
    .filter(DRILLDOWN_PREDICATES[key])
    .map((m) => ({
      npm: m.npm,
      nama: m.nama,
      prodi: m.prodi,
      dosen: dosenNamaByUid.get(m.dosenPaUid ?? '') ?? '—',
    }))
    .sort((a, b) => a.prodi.localeCompare(b.prodi) || a.nama.localeCompare(b.nama));
}

/** Group generik-per-prodi, dipakai UI drill-down W1. */
export function groupByProdi<T extends { prodi: string }>(rows: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  rows.forEach((r) => {
    (out[r.prodi] ??= []).push(r);
  });
  return out;
}

/** SVG polyline geometry for the IP history chart (D4), ported from prototype. */
export function ipChartGeometry(pts: { semesterKe: number; ip: number }[]) {
  const n = pts.length;
  const xs =
    n > 1 ? pts.map((_, i) => 30 + i * ((390 - 30) / (n - 1))) : n === 1 ? [210] : [];
  const ys = pts.map((p) => {
    const c = Math.max(2, Math.min(4, p.ip));
    return 130 - ((c - 2) / 2) * 110;
  });
  const points = pts.map((p, i) => ({
    x: xs[i],
    y: ys[i],
    semesterKe: p.semesterKe,
    ipStr: p.ip.toFixed(2),
    labelY: ys[i] - 12 < 15 ? ys[i] + 18 : ys[i] - 12,
  }));
  const path = xs.length ? xs.map((x, i) => (i === 0 ? 'M' : 'L') + x + ' ' + ys[i]).join(' ') : '';
  return { points, path };
}
