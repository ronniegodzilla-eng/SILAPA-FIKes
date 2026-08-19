'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';
import { computeDosenStats } from '@/lib/compute';
import { NPM_RE, parseSheetFile, failedRowsCsv } from '@/lib/import-utils';
import { downloadTemplateBimbingan } from '@/lib/xlsx-template';
import { colors, statusPill, kelengkapanPill, STATUS_LABEL, KELENGKAPAN_LABEL } from '@/lib/theme';
import { Icon, Pill, inputStyle, labelStyle } from '@/components/ui';
import { PaginationBar, SortableTh, useTableSort, usePagination } from '@/components/table-tools';
import { updateSubmissionJumlah, type ImportLengkapRow } from '@/lib/firestore/data';
import { KELAS_PILIHAN, KONSULTASI_JENIS_PRESET, type KonsultasiEntry, type MahasiswaRecord } from '@/lib/types';

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4,
};
const numInput: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 7, border: `1px solid ${colors.border}`, fontSize: 12.5,
};

const STATUS_ENUM = ['aktif', 'cuti', 'non_aktif', 'lulus'];
/** Nilai filter khusus untuk melihat mahasiswa yang sudah keluar. */
const FILTER_MENGUNDURKAN = 'mengundurkan_diri_disetujui';
const BEASISWA_ENUM = ['KIP', 'UKT Kemendiktisaintek', 'Yayasan', 'Prestasi', 'lainnya'];
const TINGKAT_ENUM = ['prodi', 'fakultas', 'universitas', 'kota', 'provinsi', 'nasional', 'internasional'];
const TAHAP_ENUM = ['belum', 'pengajuan_judul', 'acc_judul', 'bimbingan_proposal', 'sempro', 'penelitian', 'bimbingan_skripsi', 'sidang', 'lulus'];

interface ImportRow {
  npm: string;
  nama: string;
  sks: string;
  ip: string;
  konsul: string;
  valid: boolean;
  msg: string;
  payload?: ImportLengkapRow;
}

/** Kolom yang bisa diurutkan pada tabel daftar bimbingan. */
type SortKey = 'npm' | 'nama' | 'prodi' | 'semesterKe' | 'kelas' | 'sks' | 'ip' | 'konsul' | 'status' | 'statusPengisian';

interface TambahDraft {
  npm: string;
  nama: string;
  prodi: string;
  kelas: string;
  angkatan: number;
}

/** '' → undefined (tidak diubah); ya/tidak → boolean; lainnya → error string. */
function parseBool(v: string): boolean | undefined | 'ERR' {
  const s = v.trim().toLowerCase();
  if (s === '') return undefined;
  if (['ya', 'y', 'true', '1'].includes(s)) return true;
  if (['tidak', 'tdk', 't', 'no', 'false', '0'].includes(s)) return false;
  return 'ERR';
}

function parseNum(v: string, opts: { int?: boolean; min: number; max: number }): number | undefined | 'ERR' {
  const s = v.trim().replace(',', '.');
  if (s === '') return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < opts.min || n > opts.max) return 'ERR';
  if (opts.int && !Number.isInteger(n)) return 'ERR';
  return n;
}

export default function DaftarBimbinganPage() {
  const router = useRouter();
  const { appUser } = useAuth();
  const { recordList, records, updateField, importLengkap, submitDosenLaporan, reload, addMahasiswa, checkNpmExists, periode } = useData();
  const fileRef = useRef<HTMLInputElement>(null);

  // Muat ulang setiap kali halaman ini dibuka — supaya perubahan yang baru
  // diisi mahasiswa lewat link isi-data mandiri langsung terlihat, tanpa
  // dosen perlu tahu harus refresh manual.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [filterProdi, setFilterProdi] = useState('semua');
  const [quickEdit, setQuickEdit] = useState(false);

  // Tambah Mahasiswa (dosen menambah bimbingannya sendiri)
  const [tambahOpen, setTambahOpen] = useState(false);
  const [tambahDraft, setTambahDraft] = useState<TambahDraft>({ npm: '', nama: '', prodi: 'K3', kelas: '-', angkatan: new Date().getFullYear() });
  const [tambahErr, setTambahErr] = useState('');
  const [tambahBusy, setTambahBusy] = useState(false);

  // Kirim laporan
  const stats = computeDosenStats(recordList.filter((m) => !m.mengundurkanDiri));
  const [kirimAttempted, setKirimAttempted] = useState(false);
  const [kirimToast, setKirimToast] = useState('');
  const [kirimBusy, setKirimBusy] = useState(false);

  // Import Excel (isi lengkap)
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFile, setImportFile] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importToast, setImportToast] = useState('');
  const [importErr, setImportErr] = useState('');

  const sort = useTableSort<SortKey>();
  const q = query.trim().toLowerCase();
  const prodiOptions = Array.from(new Set(recordList.map((m) => m.prodi))).sort();
  // Pengunduran diri yang sudah disahkan Wakil Dekan I mengeluarkan mahasiswa
  // dari daftar bimbingan aktif — datanya tetap ada dan bisa dibuka lewat
  // pilihan "Sudah mengundurkan diri" pada filter status.
  const keluar = recordList.filter((m) => m.mengundurkanDiri);
  const aktifList = recordList.filter((m) => !m.mengundurkanDiri);
  const basis = filterStatus === FILTER_MENGUNDURKAN ? keluar : aktifList;
  const filtered = basis.filter((m) => {
    const matchesQ = !q || m.nama.toLowerCase().includes(q) || m.npm.includes(q);
    const matchesStatus =
      filterStatus === 'semua' || filterStatus === FILTER_MENGUNDURKAN || m.status === filterStatus;
    const matchesProdi = filterProdi === 'semua' || m.prodi === filterProdi;
    return matchesQ && matchesStatus && matchesProdi;
  });
  const sorted = sort.sortRows(filtered, (m, key) => {
    switch (key) {
      case 'sks': return m.akademik.sksKrs;
      case 'ip': return m.akademik.ipKhs;
      case 'konsul': return m.akademik.konsultasi.length;
      default: return m[key as keyof typeof m] as never;
    }
  });
  const p = usePagination(sorted, undefined, sort.sortSig);
  const rows = p.pageRows;

  const importValid = importRows.filter((r) => r.valid);
  const importFailed = importRows.filter((r) => !r.valid);

  // Pratinjau import — diurut & dipaginasi seperti pratinjau import admin.
  const importSort = useTableSort<'npm' | 'nama' | 'sks' | 'ip' | 'konsul' | 'valid'>();
  const importSorted = importSort.sortRows(
    importRows.map((r, i) => ({ r, i })),
    ({ r }, key) => r[key]
  );
  const importPage = usePagination(importSorted, 10, importSort.sortSig);

  async function kirimLaporan() {
    if (kirimBusy) return;
    if (!stats.allLengkap) {
      setKirimAttempted(true);
      setKirimToast('');
      return;
    }
    setKirimBusy(true);
    try {
      if (appUser) await submitDosenLaporan(appUser.nama);
      setKirimAttempted(false);
      setKirimToast('✓ Laporan berhasil dikirim ke Wakil Dekan I.');
    } finally {
      setKirimBusy(false);
    }
  }

  function openTambah() {
    setTambahDraft({ npm: '', nama: '', prodi: prodiOptions[0] ?? 'K3', kelas: '-', angkatan: new Date().getFullYear() });
    setTambahErr('');
    setTambahOpen(true);
  }

  function closeTambah() {
    setTambahOpen(false);
    setTambahErr('');
  }

  async function saveTambah() {
    if (tambahBusy || !appUser) return;
    const npm = tambahDraft.npm.trim();
    const nama = tambahDraft.nama.trim();
    if (!NPM_RE.test(npm)) {
      setTambahErr('NPM harus berupa angka, minimal 8 digit.');
      return;
    }
    if (!nama) {
      setTambahErr('Nama wajib diisi.');
      return;
    }
    if (!Number.isInteger(tambahDraft.angkatan) || tambahDraft.angkatan < 2000 || tambahDraft.angkatan > 2100) {
      setTambahErr('Angkatan tidak valid.');
      return;
    }
    setTambahBusy(true);
    setTambahErr('');
    try {
      if (await checkNpmExists(npm)) {
        setTambahErr('NPM sudah terdaftar di sistem.');
        return;
      }
      const rec: MahasiswaRecord = {
        npm, nama, prodi: tambahDraft.prodi as MahasiswaRecord['prodi'],
        angkatan: tambahDraft.angkatan, kelas: tambahDraft.kelas as MahasiswaRecord['kelas'],
        dosenPaUid: appUser.uid, semesterKe: 2, status: 'aktif',
        pkkmb: false, toefl: false, esq: false, semkes: [],
        akademik: { sksKrs: null, ipKhs: null, konsultasi: [], mkNilaiDE: [] },
        nonAkademik: { ukm: false, hima: false, bem: false, beasiswa: { ada: false, jenis: null, keterangan: '' }, prestasi: { ada: false, jenis: null, tingkat: null } },
        skripsi: { tahap: 'belum', kendala: '' },
        permasalahan: '', rekomendasi: '', statusPengisian: 'kosong', ipHistory: [],
      };
      await addMahasiswa(rec);
      // Naikkan juga hitungan bimbingan di dokumen `submissions` dosen ini —
      // itulah angka "Jumlah Bimbingan" yang dibaca halaman Plotting &
      // Verifikasi Wadek. Tanpa ini mahasiswa baru tampil di daftar bimbingan
      // dan master data, tapi rekap per-dosen tertinggal satu.
      // (Jalur admin — import massal & plotting — mengurus hitungannya sendiri,
      // jadi sengaja TIDAK ditaruh di dalam addMahasiswa agar tidak dobel.)
      if (periode) {
        await updateSubmissionJumlah(periode.id, appUser.nama, 1).catch(() => {});
      }
      await reload();
      setTambahOpen(false);
    } catch (e: any) {
      setTambahErr(e?.message || 'Gagal menyimpan — coba lagi.');
    } finally {
      setTambahBusy(false);
    }
  }

  async function onImportFile(file: File) {
    setImportErr('');
    try {
      const raw = await parseSheetFile(file);
      if (!raw.length) {
        setImportErr('File kosong atau header tidak terbaca.');
        return;
      }
      if (!raw[0] || !('npm' in raw[0])) {
        setImportErr('Kolom "npm" tidak ditemukan — unduh template terbaru lalu isi ulang.');
        return;
      }
      const seen = new Set<string>();
      setImportRows(
        raw.map((r) => {
          const npm = r.npm ?? '';
          const own = records[npm];
          const nama = own?.nama || r.nama || '(bukan bimbingan Anda)';
          const dup = seen.has(npm);
          seen.add(npm);

          let msg = '';
          const payload: ImportLengkapRow = { npm };
          let konsulJenisRaw = '';
          let konsulKet = '';

          if (!NPM_RE.test(npm)) msg = 'NPM notasi ilmiah / bukan teks';
          else if (dup) msg = 'NPM duplikat di dalam file';
          else if (!own) msg = 'Bukan mahasiswa bimbingan Anda';

          if (!msg) {
            // status
            const status = (r.status ?? '').trim().toLowerCase();
            if (status) {
              if (!STATUS_ENUM.includes(status)) msg = `status harus ${STATUS_ENUM.join('/')}`;
              else payload.status = status;
            }
            // booleans
            const boolFields: [string, keyof ImportLengkapRow][] = [
              ['pkkmb', 'pkkmb'], ['toefl', 'toefl'], ['esq', 'esq'],
              ['ukm', 'ukm'], ['hima', 'hima'], ['bem', 'bem'],
            ];
            for (const [col, key] of boolFields) {
              if (msg) break;
              const b = parseBool(r[col] ?? '');
              if (b === 'ERR') msg = `${col} harus ya/tidak`;
              else if (b !== undefined) (payload as any)[key] = b;
            }
            // numbers
            if (!msg) {
              const sks = parseNum(r.sks_krs ?? r.sks ?? '', { int: true, min: 0, max: 200 });
              if (sks === 'ERR') msg = 'sks_krs tidak valid (0–200)';
              else if (sks !== undefined) payload.sksKrs = sks;
            }
            if (!msg) {
              const ip = parseNum(r.ip_khs ?? r.ip ?? '', { min: 0, max: 4 });
              if (ip === 'ERR') msg = 'ip_khs di luar rentang 0.00–4.00';
              else if (ip !== undefined) payload.ipKhs = ip;
            }
            // Konsultasi: MENAMBAH satu entri (tidak pernah mengganti jumlah langsung).
            konsulJenisRaw = (r.tambah_konsultasi_jenis ?? '').trim();
            konsulKet = (r.tambah_konsultasi_keterangan ?? '').trim();
            if (!msg && (konsulJenisRaw !== '' || konsulKet !== '')) {
              if (!konsulKet) msg = 'tambah_konsultasi_keterangan wajib diisi bila tambah_konsultasi_jenis diisi';
              else {
                const preset = KONSULTASI_JENIS_PRESET.find((j) => j.toLowerCase() === konsulJenisRaw.toLowerCase());
                const entry: KonsultasiEntry = preset
                  ? { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, jenis: preset, keterangan: konsulKet }
                  : { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, jenis: 'lainnya', jenisLainnya: konsulJenisRaw, keterangan: konsulKet };
                payload.tambahKonsultasi = entry;
              }
            }
            // mk nilai D/E
            const mk = (r.mk_nilai_de ?? '').trim();
            if (!msg && mk !== '') {
              payload.mkNilaiDE = mk === '-' ? [] : mk.split(',').map((x) => x.trim()).filter(Boolean);
            }
            // beasiswa
            const bea = (r.beasiswa_jenis ?? '').trim();
            if (!msg && bea !== '') {
              if (bea.toLowerCase() === 'tidak') payload.beasiswa = { ada: false, jenis: null };
              else {
                const found = BEASISWA_ENUM.find((x) => x.toLowerCase() === bea.toLowerCase());
                if (!found) msg = `beasiswa_jenis harus tidak/${BEASISWA_ENUM.join('/')}`;
                else payload.beasiswa = { ada: true, jenis: found };
              }
            }
            // prestasi
            const pJenis = (r.prestasi_jenis ?? '').trim();
            const pTingkat = (r.prestasi_tingkat ?? '').trim().toLowerCase();
            if (!msg && (pJenis !== '' || pTingkat !== '')) {
              if (pJenis.toLowerCase() === 'tidak') payload.prestasi = { ada: false, jenis: null, tingkat: null };
              else if (!pJenis) msg = 'prestasi_jenis wajib bila prestasi_tingkat diisi';
              else if (!TINGKAT_ENUM.includes(pTingkat)) msg = `prestasi_tingkat harus ${TINGKAT_ENUM.join('/')}`;
              else payload.prestasi = { ada: true, jenis: pJenis, tingkat: pTingkat };
            }
            // skripsi
            const tahap = (r.skripsi_tahap ?? '').trim().toLowerCase();
            if (!msg && tahap !== '') {
              if (!TAHAP_ENUM.includes(tahap)) msg = 'skripsi_tahap tidak dikenal';
              else payload.skripsiTahap = tahap;
            }
            const kendala = (r.skripsi_kendala ?? '').trim();
            if (!msg && kendala !== '') payload.skripsiKendala = kendala;
            // narasi
            const perm = (r.permasalahan ?? '').trim();
            if (!msg && perm !== '') payload.permasalahan = perm;
            const rek = (r.rekomendasi ?? '').trim();
            if (!msg && rek !== '') payload.rekomendasi = rek;
          }

          return {
            npm, nama,
            sks: (r.sks_krs ?? r.sks ?? '').trim() || '—',
            ip: (r.ip_khs ?? r.ip ?? '').trim() || '—',
            konsul: konsulJenisRaw || konsulKet ? `+ ${konsulJenisRaw || 'Lainnya'}: ${konsulKet}` : '—',
            valid: !msg, msg,
            payload: msg ? undefined : payload,
          };
        })
      );
      setImportFile(file.name);
    } catch (e: any) {
      setImportErr(`Gagal membaca file: ${e?.message ?? e}`);
    }
  }

  async function commitImport() {
    if (!importValid.length || importBusy) return;
    setImportBusy(true);
    try {
      const res = await importLengkap(importValid.map((r) => r.payload!));
      await reload();
      setImportToast(`✓ ${res.committed} baris berhasil diisi lengkap ke daftar bimbingan.`);
      setImportRows([]);
      setImportFile('');
      setImportOpen(false);
    } finally {
      setImportBusy(false);
    }
  }

  function closeImport() {
    setImportOpen(false);
    setImportRows([]);
    setImportFile('');
    setImportErr('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240, flexWrap: 'wrap' }}>
          <input
            placeholder="Cari nama atau NPM..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, maxWidth: 320, padding: '10px 14px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13.5, outline: 'none' }}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13, color: colors.ink, background: colors.surface }}
          >
            <option value="semua">Semua status</option>
            <option value="aktif">Aktif</option>
            <option value="cuti">Cuti</option>
            <option value="non_aktif">Non-aktif</option>
            <option value="mengundurkan_diri">Mengundurkan diri (menunggu WD1)</option>
            {keluar.length > 0 && (
              <option value={FILTER_MENGUNDURKAN}>Sudah mengundurkan diri ({keluar.length})</option>
            )}
          </select>
          {prodiOptions.length > 1 && (
            <select
              value={filterProdi}
              onChange={(e) => setFilterProdi(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13, color: colors.ink, background: colors.surface }}
            >
              <option value="semua">Semua prodi</option>
              {prodiOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            onClick={openTambah}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10,
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              border: `1px solid ${colors.border}`, color: colors.ink, background: colors.surface,
            }}
          >
            <Icon path="M12 5v14 M5 12h14" size={15} width={2} />
            Tambah Mahasiswa
          </div>
          <div
            onClick={() => setImportOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10,
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              border: `1px solid ${colors.border}`, color: colors.ink, background: colors.surface,
            }}
          >
            <Icon path="M12 16V4 M7 9l5-5 5 5 M4 20h16" size={15} />
            Import Excel
          </div>
          <div
            onClick={() => setQuickEdit((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10,
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              border: `1px solid ${quickEdit ? colors.green : colors.border}`,
              color: quickEdit ? colors.white : colors.ink,
              background: quickEdit ? colors.green : colors.surface,
            }}
          >
            <Icon path="M4 17l4 4L20 9l-4-4L4 17Z M13 4l4 4" size={15} />
            Mode isi cepat
          </div>
          <button
            onClick={kirimLaporan}
            disabled={kirimBusy}
            title={stats.allLengkap ? 'Semua record lengkap — siap dikirim' : `${stats.notLengkap} record belum lengkap`}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10,
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              border: `1px solid ${stats.allLengkap ? colors.green : colors.border}`,
              color: stats.allLengkap ? colors.white : colors.ink,
              background: stats.allLengkap ? colors.green : colors.surface,
            }}
          >
            <Icon path="M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7Z" size={15} />
            {kirimBusy ? 'Mengirim…' : 'Kirim Laporan'}
          </button>
        </div>
      </div>

      {kirimToast && (
        <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.green }}>{kirimToast}</span>
      )}
      {kirimAttempted && !stats.allLengkap && (
        <div style={{ background: colors.dangerBg, border: `1px solid ${colors.dangerBorder}`, borderRadius: 12, padding: '12px 16px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.danger, display: 'block', marginBottom: 2 }}>
            ⚠ Laporan belum bisa dikirim — {stats.notLengkap} mahasiswa belum lengkap (baris ditandai merah).
          </span>
          <span style={{ fontSize: 12, color: colors.ink, lineHeight: 1.5 }}>
            Bagian wajib: SKS, IP, dan rekomendasi untuk mahasiswa aktif; permasalahan untuk mahasiswa cuti/non-aktif.
          </span>
        </div>
      )}
      {importToast && (
        <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.green }}>{importToast}</span>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.subtle }}>
              {([
                ['NPM', 'npm'], ['Nama', 'nama'], ['Prodi', 'prodi'], ['Smt', 'semesterKe'], ['Kelas', 'kelas'],
                ['SKS', 'sks'], ['IP', 'ip'], ['Konsul', 'konsul'], ['Status', 'status'], ['Kelengkapan', 'statusPengisian'],
              ] as [string, SortKey][]).map(([label, key]) => (
                <SortableTh key={key} label={label} sortKey={key} sort={sort} style={TH} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const sp = statusPill(m.status);
              const kp = kelengkapanPill(m.statusPengisian);
              const flagged = kirimAttempted && m.statusPengisian !== 'lengkap';
              return (
                <tr
                  key={m.npm}
                  style={{
                    borderTop: `1px solid ${colors.rowBorder}`,
                    background: flagged ? 'rgba(176,69,58,0.08)' : undefined,
                    boxShadow: flagged ? `inset 3px 0 0 ${colors.danger}` : undefined,
                  }}
                >
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>{m.npm}</td>
                  <td
                    onClick={() => router.push(`/dosen/bimbingan/${m.npm}`)}
                    className="silapa-name-cell"
                    title="Klik untuk membuka form laporan"
                    style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 600, color: colors.ink, cursor: 'pointer' }}
                  >
                    <span className="silapa-name-link">{m.nama}</span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{m.prodi}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{m.semesterKe}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{m.kelas}</td>
                  <td style={{ padding: '8px 16px' }}>
                    {quickEdit ? (
                      <input
                        type="number"
                        value={m.akademik.sksKrs ?? ''}
                        onChange={(e) => updateField(m.npm, 'akademik.sksKrs', e.target.value === '' ? null : Number(e.target.value))}
                        style={{ ...numInput, width: 56 }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: colors.ink }}>{m.akademik.sksKrs ?? '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    {quickEdit ? (
                      <input
                        type="number"
                        step="0.01"
                        value={m.akademik.ipKhs ?? ''}
                        onChange={(e) => updateField(m.npm, 'akademik.ipKhs', e.target.value === '' ? null : Number(e.target.value))}
                        style={{ ...numInput, width: 56 }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: colors.ink }}>{m.akademik.ipKhs != null ? m.akademik.ipKhs.toFixed(2) : '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <span title="Kelola jenis &amp; keterangan konsultasi di form lengkap" style={{ fontSize: 13, color: colors.ink }}>
                      {m.akademik.konsultasi.length}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <Pill label={STATUS_LABEL[m.status]} color={sp.color} bg={sp.bg} capitalize />
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <Pill label={KELENGKAPAN_LABEL[m.statusPengisian]} color={kp.color} bg={kp.bg} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PaginationBar
        p={p}
        itemLabel="mahasiswa bimbingan"
        note={filtered.length !== aktifList.length ? `(hasil saring dari ${aktifList.length} bimbingan aktif Anda)` : undefined}
      />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && onImportFile(e.target.files[0])}
      />

      {importOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: '24px 26px', width: 680, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink, display: 'block', marginBottom: 4 }}>Import Excel — isi lengkap data bimbingan</span>
            <span style={{ fontSize: 12.5, color: colors.muted, display: 'block', marginBottom: 16, lineHeight: 1.5 }}>
              Template .xlsx sudah berisi seluruh mahasiswa bimbingan Anda (NPM + nama dari data master yang telah diplot) dan mencakup semua kolom form isian.
              Sel yang dikosongkan tidak mengubah data. Kolom <code>tambah_konsultasi_*</code> MENAMBAH satu entri konsultasi baru, bukan menimpa jumlah — lihat sheet PETUNJUK.
            </span>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <button onClick={() => downloadTemplateBimbingan(aktifList)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 12.5, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>
                <Icon path="M12 4v12 M7 11l5 5 5-5 M4 20h16" size={14} />
                Unduh Template (.xlsx, terisi daftar bimbingan)
              </button>
              <button onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                <Icon path="M12 16V4 M7 9l5-5 5 5 M4 20h16" size={14} />
                Pilih File
              </button>
              {importFile && <span style={{ fontSize: 12.5, color: colors.muted, alignSelf: 'center' }}>{importFile}</span>}
            </div>
            {importErr && <span style={{ display: 'block', fontSize: 12.5, color: colors.danger, fontWeight: 600, marginBottom: 12 }}>{importErr}</span>}

            {importRows.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  {importFailed.length > 0 ? (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.danger, background: colors.dangerBg, padding: '4px 10px', borderRadius: 999 }}>{importFailed.length} baris gagal validasi</span>
                  ) : (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.green, background: colors.greenSoftBg, padding: '4px 10px', borderRadius: 999 }}>Semua baris valid</span>
                  )}
                </div>
                <div style={{ overflowX: 'auto', border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: colors.subtle }}>
                        {([
                          ['NPM', 'npm'], ['Nama', 'nama'], ['SKS', 'sks'],
                          ['IP', 'ip'], ['Konsul', 'konsul'], ['Validasi', 'valid'],
                        ] as [string, 'npm' | 'nama' | 'sks' | 'ip' | 'konsul' | 'valid'][]).map(([label, key]) => (
                          <SortableTh
                            key={key}
                            label={label}
                            sortKey={key}
                            sort={importSort}
                            style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: colors.muted, textTransform: 'uppercase' }}
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPage.pageRows.map(({ r, i }) => (
                        <tr key={i} style={{ borderTop: `1px solid ${colors.rowBorder}`, background: r.valid ? colors.surface : colors.dangerBg }}>
                          <td style={{ padding: '7px 10px', fontSize: 12, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{r.npm}</td>
                          <td style={{ padding: '7px 10px', fontSize: 12, color: colors.ink }}>{r.nama}</td>
                          <td style={{ padding: '7px 10px', fontSize: 12, color: colors.ink }}>{r.sks}</td>
                          <td style={{ padding: '7px 10px', fontSize: 12, color: colors.ink }}>{r.ip}</td>
                          <td style={{ padding: '7px 10px', fontSize: 12, color: colors.ink }}>{r.konsul}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11.5, fontWeight: 700, color: r.valid ? colors.green : colors.danger }}>{r.valid ? '✓ Valid' : `✗ ${r.msg}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <PaginationBar p={importPage} itemLabel="baris" />
                </div>
                {importFailed.length > 0 && (
                  <a href={failedRowsCsv(importFailed)} download="baris_gagal_import.csv" style={{ fontSize: 12, fontWeight: 700, color: colors.green, textDecoration: 'none', display: 'inline-block', marginBottom: 14 }}>
                    Unduh laporan baris gagal ↓
                  </a>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={closeImport} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button
                onClick={commitImport}
                disabled={importBusy || importValid.length === 0}
                style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: importValid.length ? colors.green : colors.disabled, color: colors.white, fontSize: 13, fontWeight: 700, cursor: importValid.length ? 'pointer' : 'not-allowed' }}
              >
                {importBusy ? 'Memproses…' : `Isi ${importValid.length} Baris ke Bimbingan`}
              </button>
            </div>
          </div>
        </div>
      )}

      {tambahOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: '26px 28px', width: 420, maxWidth: '90vw', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink, display: 'block', marginBottom: 4 }}>Tambah Mahasiswa Baru</span>
            <span style={{ fontSize: 12.5, color: colors.muted, display: 'block', marginBottom: 16, lineHeight: 1.5 }}>
              Mahasiswa ini otomatis menjadi bimbingan Anda. NPM, nama, prodi, angkatan, dan kelas tidak bisa diubah lagi setelah tersimpan lewat sini.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>NPM</label>
                <input value={tambahDraft.npm} onChange={(e) => setTambahDraft({ ...tambahDraft, npm: e.target.value })} placeholder="Mis. 261013241001" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Nama</label>
                <input value={tambahDraft.nama} onChange={(e) => setTambahDraft({ ...tambahDraft, nama: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Prodi</label>
                  <select value={tambahDraft.prodi} onChange={(e) => setTambahDraft({ ...tambahDraft, prodi: e.target.value })} style={inputStyle}>
                    <option value="K3">K3</option>
                    <option value="KL">KL</option>
                    <option value="S2KM">S2KM</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Kelas</label>
                  <select value={tambahDraft.kelas} onChange={(e) => setTambahDraft({ ...tambahDraft, kelas: e.target.value })} style={inputStyle}>
                    <option value="-">— (belum tercatat)</option>
                    {KELAS_PILIHAN.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Angkatan</label>
                <input type="number" value={tambahDraft.angkatan} onChange={(e) => setTambahDraft({ ...tambahDraft, angkatan: Number(e.target.value) })} style={inputStyle} />
              </div>
            </div>
            {tambahErr && <span style={{ display: 'block', fontSize: 12.5, color: colors.danger, fontWeight: 600, marginTop: 12 }}>{tambahErr}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={closeTambah} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button onClick={saveTambah} disabled={tambahBusy} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: tambahBusy ? 'wait' : 'pointer' }}>
                {tambahBusy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
