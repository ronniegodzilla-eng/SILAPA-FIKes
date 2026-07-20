/**
 * Domain types — mirror the Firestore data model in PRD §4.
 * HARD RULE (PRD §4): `npm` is ALWAYS a string. Never parse to number.
 */

export type Role = 'dosen_pa' | 'admin' | 'wadek1';
export type Prodi = 'K3' | 'KL' | 'S2KM';
/** '-' = belum tercatat (laporan distribusi SIAKAD tidak memuat kelas). */
export type Kelas = 'REG A' | 'REG B' | 'REG C' | 'REG D' | '-';
export type StatusMahasiswa = 'aktif' | 'cuti' | 'non_aktif' | 'lulus' | 'keluar';
export type StatusLaporan = 'aktif' | 'cuti' | 'non_aktif' | 'lulus';
export type StatusPengisian = 'kosong' | 'sebagian' | 'lengkap';
export type PeriodeStatus = 'draft' | 'dibuka' | 'verifikasi' | 'dikunci';
export type StatusKirim = 'draft' | 'dikirim' | 'dikembalikan' | 'diverifikasi';
export type Semester = 'ganjil' | 'genap';

export type BeasiswaJenis =
  | 'KIP'
  | 'UKT Kemendiktisaintek'
  | 'Yayasan'
  | 'Prestasi'
  | 'lainnya';

export type PrestasiTingkat =
  | 'prodi'
  | 'fakultas'
  | 'universitas'
  | 'kota'
  | 'provinsi'
  | 'nasional'
  | 'internasional';

export type SkripsiTahap =
  | 'belum'
  | 'pengajuan_judul'
  | 'acc_judul'
  | 'bimbingan_proposal'
  | 'sempro'
  | 'penelitian'
  | 'bimbingan_skripsi'
  | 'sidang'
  | 'lulus';

/** Preset jenis konsultasi — dropdown + "Lainnya" untuk ketik bebas. */
export const KONSULTASI_JENIS_PRESET = ['KRS', 'KHS', 'UTS', 'UAS', 'PBL', 'Magang', 'Proposal', 'Skripsi'] as const;
export type KonsultasiJenisPreset = (typeof KONSULTASI_JENIS_PRESET)[number];
export type KonsultasiJenis = KonsultasiJenisPreset | 'lainnya';

/** Preset jenis UKM (unit kegiatan mahasiswa) — dropdown + "Lainnya" ketik bebas. */
export const UKM_JENIS_PRESET = [
  'Agama, Seni dan Budaya',
  'Olahraga',
  'MAPAIS',
  'Pers (Sipena)',
  'Pramuka',
  'Wirausaha',
  'English Club',
] as const;
export type UkmJenisPreset = (typeof UKM_JENIS_PRESET)[number];

/**
 * Satu entri konsultasi (mis. "KRS — tanda tangan KRS"). "Jumlah konsultasi"
 * TIDAK PERNAH diketik langsung — selalu dihitung dari panjang daftar ini
 * (PRD P1: rekap dihitung otomatis, tidak diinput manual).
 */
export interface KonsultasiEntry {
  id: string;
  jenis: KonsultasiJenis;
  /** Diisi hanya saat jenis === 'lainnya'. */
  jenisLainnya?: string;
  keterangan: string;
}

/** users/{uid}. Satu akun dapat memiliki lebih dari satu peran sekaligus
 * (mis. Wakil Dekan I yang juga menjadi Dosen PA) — lihat AuthContext untuk
 * konsep "peran aktif" yang dipilih pengguna saat login. */
export interface AppUser {
  uid: string;
  nama: string;
  email: string;
  roles: Role[];
  prodiHomebase?: Prodi | null;
  aktif: boolean;
  jumlahBimbingan?: number; // convenience mirror for plotting/distribusi
}

export interface Akademik {
  sksKrs: number | null;
  ipKhs: number | null;
  /** Jumlah konsultasi = konsultasi.length — dihitung, bukan diketik. */
  konsultasi: KonsultasiEntry[];
  mkNilaiDE: string[];
}

export interface Beasiswa {
  ada: boolean;
  jenis: BeasiswaJenis | null;
  keterangan?: string;
  /** Link bukti (SK/surat keputusan) di Google Drive — opsional (§ keputusan pimpinan). */
  bukti?: string;
}

export interface Prestasi {
  ada: boolean;
  jenis: string | null;
  tingkat: PrestasiTingkat | null;
  /** Link bukti (sertifikat) di Google Drive — opsional (§ keputusan pimpinan). */
  bukti?: string;
}

export interface NonAkademik {
  ukm: boolean;
  /** Jenis UKM yang diikuti (preset UKM_JENIS_PRESET atau teks bebas bila
   * "Lainnya") — hanya relevan bila ukm === true. Opsional. */
  ukmJenis?: string | null;
  hima: boolean;
  bem: boolean;
  beasiswa: Beasiswa;
  prestasi: Prestasi;
  /** Link bukti keanggotaan/kepengurusan organisasi — opsional. */
  organisasiBukti?: string;
}

export interface Skripsi {
  tahap: SkripsiTahap;
  kendala: string;
}

export interface IpHistoryEntry {
  semesterKe: number;
  ip: number;
}

/**
 * A "mahasiswa view" — the composed record the UI works with. In the
 * prototype everything lived in one object; here it is the join of the
 * master `mahasiswa/{npm}` doc and the active-periode `laporan` doc.
 */
export interface MahasiswaRecord {
  // master
  npm: string;
  nama: string;
  prodi: Prodi;
  angkatan: number;
  kelas: Kelas;
  dosenPaUid?: string;
  // once-per-degree (master fields)
  pkkmb: boolean;
  toefl: boolean;
  esq: boolean;
  semkesCount: number;
  /** Link bukti (sertifikat) di Google Drive — opsional (§ keputusan pimpinan). Semkes sengaja tidak punya bukti. */
  pkkmbBukti?: string;
  toeflBukti?: string;
  esqBukti?: string;
  // per-periode (laporan)
  semesterKe: number;
  /** true bila semesterKe dikoreksi manual dosen (PRD §4.6), bukan hasil hitung otomatis. */
  semesterKeManual?: boolean;
  status: StatusLaporan;
  akademik: Akademik;
  nonAkademik: NonAkademik;
  skripsi: Skripsi;
  permasalahan: string;
  rekomendasi: string;
  statusPengisian: StatusPengisian;
  ipHistory: IpHistoryEntry[];
}

export interface Periode {
  id: string;
  tahunAkademik: string;
  semester: Semester;
  status: PeriodeStatus;
}

export interface PeriodeHistoryEntry {
  id: string;
  label: string;
  status: PeriodeStatus;
}

/** submissions/{periodeId}_{dosenUid} + roster convenience */
export interface DosenRosterEntry {
  dosenUid: string;
  nama: string;
  prodi: Prodi;
  jumlah: number;
  statusKirim: StatusKirim;
  catatanWadek?: string;
}

/** One row of laporan history for a mahasiswa across periodes (D4). */
export interface RiwayatLaporanRow {
  periodeId: string;
  semesterKe: number;
  status: StatusLaporan;
  jumlahKonsultasi: number;
  ipKhs: number | null;
  skripsiTahap: SkripsiTahap;
}
