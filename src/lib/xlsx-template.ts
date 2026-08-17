import * as XLSX from 'xlsx';
import type { DosenPaOption } from './firestore/data';
import type { MahasiswaRecord } from './types';

/**
 * Client-side .xlsx template generators. Every NPM cell is forced to TEXT
 * (cell type 's' + column format '@') so Excel never mangles it into a number
 * (PRD masalah #2).
 */

function forceTextColumn(sheet: XLSX.WorkSheet, colIdx: number, fromRow: number) {
  const ref = sheet['!ref'];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let r = fromRow; r <= range.e.r; r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: colIdx })];
    if (cell) {
      cell.t = 's';
      cell.v = String(cell.v);
      cell.z = '@';
    }
  }
}

/**
 * Template A2 (admin): mahasiswa baru + plotting dosen PA.
 *
 * `dosenList` harus datang dari dosenPaOptions (roster + akun ber-peran
 * dosen_pa), BUKAN dari dosenRoster saja — dosen yang baru didaftarkan belum
 * punya dokumen submissions, dan dulu karena itu tidak pernah ikut tercetak di
 * sheet DAFTAR DOSEN PA sehingga tidak bisa dipakai untuk plotting.
 */
export function downloadTemplateMahasiswa(dosenList: DosenPaOption[]) {
  const wb = XLSX.utils.book_new();

  const contohDosen = dosenList[0]?.nama ?? '(salin dari sheet DAFTAR DOSEN PA)';
  const data = XLSX.utils.aoa_to_sheet([
    ['npm', 'nama', 'prodi', 'angkatan', 'kelas', 'dosen_pa'],
    ['2610132410001', 'Contoh Mahasiswa Satu', 'K3', 2026, 'REG A', contohDosen],
    ['2610132410002', 'Contoh Mahasiswa Dua', 'KL', 2026, 'REG B', ''],
  ]);
  data['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 32 }];
  forceTextColumn(data, 0, 1);
  XLSX.utils.book_append_sheet(wb, data, 'MAHASISWA BARU');

  const petunjuk = XLSX.utils.aoa_to_sheet([
    ['PETUNJUK PENGISIAN'],
    [],
    ['Kolom', 'Aturan'],
    ['npm', 'WAJIB — format sel harus Teks. Jangan biarkan Excel mengubah jadi angka.'],
    ['nama', 'WAJIB'],
    ['prodi', 'WAJIB — salah satu: K3, KL, S2KM'],
    ['angkatan', 'WAJIB — tahun 4 digit, mis. 2026'],
    ['kelas', 'WAJIB — salah satu: REG A, REG B, REG C, REG D'],
    ['dosen_pa', 'OPSIONAL — nama dosen sesuai sheet DAFTAR DOSEN PA (boleh tanpa gelar asal unik). Kosongkan bila belum diplot.'],
    [],
    ['Baris dengan NPM duplikat (di dalam file maupun yang sudah terdaftar) akan gagal validasi.'],
    ['Dosen PA yang baru didaftarkan admin ikut tercantum di sheet DAFTAR DOSEN PA meski belum punya bimbingan.'],
  ]);
  petunjuk['!cols'] = [{ wch: 12 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, petunjuk, 'PETUNJUK');

  const dosen = XLSX.utils.aoa_to_sheet([
    ['DAFTAR DOSEN PA (salin persis ke kolom dosen_pa)'],
    [],
    ['Nama', 'Prodi Homebase', 'Bimbingan Saat Ini'],
    ...dosenList.map((d) => [
      d.nama,
      d.prodi,
      d.adaRoster ? d.jumlah : 'baru — belum ada bimbingan',
    ]),
  ]);
  dosen['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, dosen, 'DAFTAR DOSEN PA');

  XLSX.writeFile(wb, 'template_mahasiswa_plotting.xlsx');
}

/**
 * Header kolom template isi lengkap bimbingan (D2/D3) — urutan tetap.
 * Konsultasi TIDAK PERNAH diimport sebagai angka (jumlahnya selalu dihitung
 * dari daftar entri) — kolom `tambah_konsultasi_*` MENAMBAH satu entri baru
 * per baris, tidak menimpa entri yang sudah ada.
 */
export const BIMBINGAN_HEADERS = [
  'npm', 'nama', 'status',
  'pkkmb', 'toefl', 'esq',
  'sks_krs', 'ip_khs', 'jumlah_konsultasi_saat_ini',
  'tambah_konsultasi_jenis', 'tambah_konsultasi_keterangan',
  'mk_nilai_de',
  'ukm', 'hima', 'bem', 'beasiswa_jenis', 'prestasi_jenis', 'prestasi_tingkat',
  'skripsi_tahap', 'skripsi_kendala',
  'permasalahan', 'rekomendasi',
] as const;

const ya = (v: boolean) => (v ? 'ya' : 'tidak');

/**
 * Template D2 (dosen): sudah terprefill daftar bimbingan (NPM + nama dari
 * master yang telah diplot) beserta nilai yang sudah tercatat — dosen tinggal
 * melengkapi sel yang kosong. Sel kosong = tidak mengubah data.
 */
export function downloadTemplateBimbingan(records: MahasiswaRecord[]) {
  const wb = XLSX.utils.book_new();

  const rows = records
    .slice()
    .sort((a, b) => a.npm.localeCompare(b.npm))
    .map((m) => [
      m.npm, m.nama, m.status,
      ya(m.pkkmb), ya(m.toefl), ya(m.esq),
      m.akademik.sksKrs ?? '', m.akademik.ipKhs ?? '', m.akademik.konsultasi.length,
      '', '', // tambah_konsultasi_jenis / _keterangan — kosong, hanya diisi utk menambah
      m.akademik.mkNilaiDE.join(', '),
      ya(m.nonAkademik.ukm), ya(m.nonAkademik.hima), ya(m.nonAkademik.bem),
      m.nonAkademik.beasiswa.ada ? m.nonAkademik.beasiswa.jenis ?? 'lainnya' : 'tidak',
      m.nonAkademik.prestasi.ada ? m.nonAkademik.prestasi.jenis ?? '' : '',
      m.nonAkademik.prestasi.ada ? m.nonAkademik.prestasi.tingkat ?? '' : '',
      m.skripsi.tahap, m.skripsi.kendala,
      m.permasalahan, m.rekomendasi,
    ]);

  const data = XLSX.utils.aoa_to_sheet([[...BIMBINGAN_HEADERS], ...rows]);
  data['!cols'] = BIMBINGAN_HEADERS.map((h) =>
    h === 'npm' ? { wch: 16 } : h === 'nama' ? { wch: 28 } :
    ['permasalahan', 'rekomendasi', 'mk_nilai_de', 'skripsi_kendala', 'prestasi_jenis'].includes(h) ? { wch: 30 } : { wch: 12 }
  );
  forceTextColumn(data, 0, 1);
  XLSX.utils.book_append_sheet(wb, data, 'DATA BIMBINGAN');

  const petunjuk = XLSX.utils.aoa_to_sheet([
    ['PETUNJUK PENGISIAN — sel yang DIKOSONGKAN tidak mengubah data yang sudah ada'],
    [],
    ['Kolom', 'Aturan'],
    ['npm', 'JANGAN DIUBAH — identitas baris (teks)'],
    ['nama', 'Referensi saja — tidak diimport'],
    ['status', 'aktif | cuti | non_aktif | lulus'],
    ['pkkmb / toefl / esq', 'ya | tidak'],
    ['sks_krs', 'angka 0–200'],
    ['ip_khs', 'angka 0.00–4.00'],
    ['jumlah_konsultasi_saat_ini', 'REFERENSI SAJA (dihitung otomatis) — tidak diimport, boleh diabaikan.'],
    ['tambah_konsultasi_jenis', 'OPSIONAL — isi utk MENAMBAH satu entri konsultasi baru (tidak menghapus yang lama): KRS | KHS | UTS | UAS | PBL | Magang | Proposal | Skripsi | atau teks bebas (dianggap "Lainnya").'],
    ['tambah_konsultasi_keterangan', 'Keterangan entri konsultasi baru, mis. "Tanda tangan KRS". Wajib diisi bila tambah_konsultasi_jenis diisi.'],
    ['mk_nilai_de', 'nama mata kuliah dipisah koma, mis: Biokimia, Farmakologi Dasar'],
    ['ukm / hima / bem', 'ya | tidak'],
    ['beasiswa_jenis', 'tidak | KIP | UKT Kemendiktisaintek | Yayasan | Prestasi | lainnya'],
    ['prestasi_jenis', 'nama prestasi; kosongkan bila tidak ada'],
    ['prestasi_tingkat', 'prodi | fakultas | universitas | kota | provinsi | nasional | internasional'],
    ['skripsi_tahap', 'belum | pengajuan_judul | acc_judul | bimbingan_proposal | sempro | penelitian | bimbingan_skripsi | sidang | lulus'],
    ['skripsi_kendala', 'teks bebas'],
    ['permasalahan / rekomendasi', 'teks bebas — wajib diisi agar record berstatus LENGKAP (rekomendasi utk aktif; permasalahan utk cuti/non-aktif)'],
  ]);
  petunjuk['!cols'] = [{ wch: 26 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, petunjuk, 'PETUNJUK');

  XLSX.writeFile(wb, 'template_isi_bimbingan.xlsx');
}

/** Template A2 (admin) nilai KRS/KHS — .xlsx dengan NPM teks. */
export function downloadTemplateNilai() {
  const wb = XLSX.utils.book_new();
  const data = XLSX.utils.aoa_to_sheet([
    ['npm', 'nama', 'sks_krs', 'ip_khs'],
    ['2210132410101', 'Ahmad Zulkarnain', 144, 3.52],
    ['2210132410102', 'Siti Nurhaliza Putri', 140, 3.1],
  ]);
  data['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 10 }];
  forceTextColumn(data, 0, 1);
  XLSX.utils.book_append_sheet(wb, data, 'NILAI');
  XLSX.writeFile(wb, 'template_import_nilai.xlsx');
}
