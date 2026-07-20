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
  if (rec.status === 'cuti' || rec.status === 'non_aktif') {
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

/** Early-warning badges (PRD §5.2 D4) — ported from prototype computeBadges. */
export function computeBadges(rec: MahasiswaRecord | null): Badge[] {
  const list: Badge[] = [];
  if (!rec) return list;
  const h = rec.ipHistory;
  if (
    h.length >= 3 &&
    h[h.length - 1].ip < h[h.length - 2].ip &&
    h[h.length - 2].ip < h[h.length - 3].ip
  ) {
    list.push({ label: 'IP turun 2 semester berturut-turut' });
  }
  if (rec.akademik.ipKhs != null && rec.akademik.ipKhs < 2.75) {
    list.push({ label: 'IP di bawah 2.75' });
  }
  if (!rec.toefl && rec.semesterKe >= 6) {
    list.push({ label: 'Belum TOEFL padahal semester ≥ 6' });
  }
  if (rec.semkesCount < 8 && rec.semesterKe >= 7) {
    list.push({ label: 'Semkes < 8 menjelang skripsi' });
  }
  if (rec.status === 'aktif' && rec.akademik.konsultasi.length === 0) {
    list.push({ label: 'Konsultasi 0 semester ini' });
  }
  return list;
}

/** True when the student meets any early-warning condition (dashboard "perhatian"). */
export function needsAttention(m: MahasiswaRecord): boolean {
  const h = m.ipHistory;
  const turun =
    h.length >= 3 &&
    h[h.length - 1].ip < h[h.length - 2].ip &&
    h[h.length - 2].ip < h[h.length - 3].ip;
  const rendah = m.akademik.ipKhs != null && m.akademik.ipKhs < 2.75;
  const belumToefl = !m.toefl && m.semesterKe >= 6;
  const konsul0 = m.status === 'aktif' && m.akademik.konsultasi.length === 0;
  return turun || rendah || belumToefl || konsul0;
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
  rata: string;
  n: number;
}

/**
 * IPK rata-rata per prodi dari satu kumpulan record (mis. bimbingan seorang
 * dosen PA). Hanya prodi yang punya ≥1 mahasiswa AKTIF yang dikembalikan; rata
 * = mean IP mahasiswa aktif yang IP-nya sudah terisi (atau "—" bila belum ada).
 * Dipakai di dashboard dosen dan modal verifikasi wadek (PRD §6) — "pembimbing
 * melihat rata-rata IP per prodi dari anak bimbingannya".
 */
export function computeIpkPerProdi(list: MahasiswaRecord[]): ProdiIpk[] {
  const order = ['K3', 'KL', 'S2KM'];
  const activeProdi = new Set<string>();
  list.forEach((m) => { if (m.status === 'aktif') activeProdi.add(m.prodi); });
  return Array.from(activeProdi)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((prodi) => {
      const withIp = list.filter(
        (m) => m.prodi === prodi && m.status === 'aktif' && m.akademik.ipKhs != null
      );
      const mean = withIp.length
        ? withIp.reduce((s, m) => s + (m.akademik.ipKhs as number), 0) / withIp.length
        : 0;
      return { prodi, rata: withIp.length ? mean.toFixed(2) : '—', n: withIp.length };
    });
}

export interface DosenRekap {
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
  const aktifWithIp = list.filter((m) => m.status === 'aktif' && m.akademik.ipKhs != null);
  const ipkRata = aktifWithIp.length
    ? aktifWithIp.reduce((sum, m) => sum + (m.akademik.ipKhs as number), 0) / aktifWithIp.length
    : 0;
  return {
    ipkRataStr: ipkRata ? ipkRata.toFixed(2) : '—',
    ipkPerProdi: computeIpkPerProdi(list),
    organisasi: list.filter((m) => m.nonAkademik.ukm || m.nonAkademik.hima || m.nonAkademik.bem).length,
    beasiswa: list.filter((m) => m.nonAkademik.beasiswa.ada).length,
    prestasi: list.filter((m) => m.nonAkademik.prestasi.ada).length,
    cutiNonaktif: list.filter((m) => m.status === 'cuti' || m.status === 'non_aktif').length,
    perhatian: list.filter(needsAttention).length,
  };
}

/**
 * semesterKe formula (PRD §4.6):
 * (tahunPeriode − angkatan) × 2 + (semester == "genap" ? 2 : 1)
 */
export function computeSemesterKe(
  angkatan: number,
  tahunPeriodeAwal: number,
  semester: 'ganjil' | 'genap'
): number {
  return (tahunPeriodeAwal - angkatan) * 2 + (semester === 'genap' ? 2 : 1);
}

// ─── W1: Faculty-wide aggregates (PRD §6) ────────────────────────────────
// Every number is computed from laporan records — never entered manually.

export interface WadekAggregates {
  status: { aktif: number; cuti: number; nonAktif: number; lulus: number };
  prodiIpk: { prodi: string; rata: string; n: number }[];
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
  const prodiIpk = (['K3', 'KL', 'S2KM'] as const).map((prodi) => {
    const withIp = records.filter(
      (m) => m.prodi === prodi && m.status === 'aktif' && m.akademik.ipKhs != null
    );
    const mean = withIp.length
      ? withIp.reduce((s, m) => s + (m.akademik.ipKhs as number), 0) / withIp.length
      : 0;
    return { prodi, rata: withIp.length ? mean.toFixed(2) : '—', n: withIp.length };
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
    count: records.filter((m) => test(m.semkesCount)).length,
  }));

  return {
    status: {
      aktif: count((m) => m.status === 'aktif'),
      cuti: count((m) => m.status === 'cuti'),
      nonAktif: count((m) => m.status === 'non_aktif'),
      lulus: count((m) => m.status === 'lulus'),
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
      semkes: `${count((m) => m.semkesCount >= 8)}/${total}`,
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
  rata: string;
  n: number;
}

/** IPK rata-rata per dosen PA dalam satu prodi (untuk drill-down kartu IPK prodi). */
export function computeIpkPerDosen(
  records: MahasiswaRecord[],
  dosenNamaByUid: Map<string, string>,
  prodi: string
): DosenIpkRow[] {
  const scoped = records.filter(
    (m) => m.prodi === prodi && m.status === 'aktif' && m.akademik.ipKhs != null
  );
  const byDosen = new Map<string, { sum: number; n: number }>();
  scoped.forEach((m) => {
    const uid = m.dosenPaUid ?? '';
    const cur = byDosen.get(uid) ?? { sum: 0, n: 0 };
    cur.sum += m.akademik.ipKhs as number;
    cur.n += 1;
    byDosen.set(uid, cur);
  });
  return Array.from(byDosen.entries())
    .map(([uid, { sum, n }]) => ({
      dosenUid: uid,
      dosen: dosenNamaByUid.get(uid) ?? '—',
      rata: (sum / n).toFixed(2),
      n,
    }))
    .sort((a, b) => b.n - a.n);
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
