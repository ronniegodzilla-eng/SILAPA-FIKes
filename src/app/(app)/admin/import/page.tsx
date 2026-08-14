'use client';

import { useRef, useState } from 'react';
import { useData } from '@/lib/data-context';
import { updateSubmissionJumlah } from '@/lib/firestore/data';
import { NPM_RE, parseSheetFile, failedRowsCsv } from '@/lib/import-utils';
import { downloadTemplateMahasiswa, downloadTemplateNilai } from '@/lib/xlsx-template';
import { colors } from '@/lib/theme';
import { Icon, Card } from '@/components/ui';
import { PaginationBar, SortableTh, TableSearch, useTableSort, usePagination } from '@/components/table-tools';
import type { DosenRosterEntry, MahasiswaRecord } from '@/lib/types';

type SortKey = 'npm' | 'nama' | 'c3' | 'c4' | 'c5' | 'valid';

type Mode = 'nilai' | 'mahasiswa';
type Stage = 'idle' | 'preview' | 'done';

interface PreviewRow {
  npm: string;
  nama: string;
  c3: string; // sks | prodi
  c4: string; // ip  | kelas+angkatan
  c5?: string; // — | dosen PA
  valid: boolean;
  msg: string;
  payload?: any;
  dosenNama?: string; // resolved roster name for plotting count updates
}

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase',
};

const PRODI = ['K3', 'KL', 'S2KM'];
const KELAS = ['REG A', 'REG B', 'REG C', 'REG D'];

/** Kolom wajib per mode — file tanpa kolom ini ditolak sebelum preview. */
const REQUIRED_COLS: Record<Mode, { cols: string[][]; label: string }> = {
  nilai: { cols: [['npm'], ['sks_krs', 'sks'], ['ip_khs', 'ip', 'ipk']], label: 'npm, sks_krs, ip_khs' },
  mahasiswa: { cols: [['npm'], ['nama'], ['prodi'], ['angkatan'], ['kelas']], label: 'npm, nama, prodi, angkatan, kelas' },
};

function missingColumns(mode: Mode, sample: Record<string, string>): string[] {
  const keys = new Set(Object.keys(sample));
  return REQUIRED_COLS[mode].cols
    .filter((alts) => !alts.some((a) => keys.has(a)))
    .map((alts) => alts[0]);
}

export default function ImportPage() {
  const { records, dosenRoster, periode, importNilai, addMahasiswa, reload } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('nilai');
  const [stage, setStage] = useState<Stage>('idle');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');
  const [parseErr, setParseErr] = useState('');

  const failed = rows.filter((r) => !r.valid);
  const valid = rows.filter((r) => r.valid);

  // Pratinjau bisa memuat ribuan baris (import satu angkatan penuh) — dicari,
  // diurut (mis. "Validasi" untuk mengumpulkan baris gagal), dan dipaginasi.
  // Indeks asli disimpan sebagai key React karena NPM bisa duplikat: justru
  // duplikat itulah salah satu kasus gagal validasi yang ingin ditampilkan.
  const sort = useTableSort<SortKey>();
  const [previewQ, setPreviewQ] = useState('');
  const previewNeedle = previewQ.trim().toLowerCase();
  const previewFiltered = rows
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        !previewNeedle ||
        r.npm.toLowerCase().includes(previewNeedle) ||
        r.nama.toLowerCase().includes(previewNeedle) ||
        r.msg.toLowerCase().includes(previewNeedle)
    );
  const previewSorted = sort.sortRows(previewFiltered, ({ r }, key) => (key === 'c5' ? r.c5 ?? '' : r[key]));
  const previewPage = usePagination(previewSorted, undefined, sort.sortSig);

  async function onFile(file: File) {
    setParseErr('');
    try {
      const mapped = await parseSheetFile(file);
      if (!mapped.length) {
        setParseErr('File kosong atau header tidak terbaca.');
        return;
      }
      // Cek struktur template: kolom wajib harus ada di header.
      const missing = missingColumns(mode, mapped[0]);
      if (missing.length) {
        setParseErr(
          `Struktur file tidak sesuai template — kolom wajib hilang: ${missing.join(', ')}. ` +
          `Kolom yang dibutuhkan: ${REQUIRED_COLS[mode].label}. Unduh template terbaru lalu isi ulang.`
        );
        return;
      }
      setRows(
        mode === 'nilai'
          ? validateNilai(mapped, records)
          : validateMahasiswa(mapped, records, dosenRoster)
      );
      setFileName(file.name);
      setStage('preview');
    } catch (e: any) {
      setParseErr(`Gagal membaca file: ${e?.message ?? e}`);
    }
  }

  async function commit() {
    setBusy(true);
    try {
      if (mode === 'nilai') {
        const res = await importNilai(valid.map((r) => r.payload));
        setDoneMsg(`${res.committed} baris nilai berhasil di-commit ke basis data.` +
          (res.missing.length ? ` ${res.missing.length} NPM tanpa record laporan dilewati.` : ''));
      } else {
        for (const r of valid) await addMahasiswa(r.payload as MahasiswaRecord);
        // Plotting sekaligus: update jumlah bimbingan per dosen di distribusi.
        if (periode) {
          const perDosen = new Map<string, number>();
          valid.forEach((r) => {
            if (r.dosenNama) perDosen.set(r.dosenNama, (perDosen.get(r.dosenNama) ?? 0) + 1);
          });
          await Promise.all(
            Array.from(perDosen.entries()).map(([nama, n]) =>
              updateSubmissionJumlah(periode.id, nama, n)
            )
          );
        }
        const plotted = valid.filter((r) => r.dosenNama).length;
        setDoneMsg(
          `${valid.length} mahasiswa baru berhasil ditambahkan` +
            (plotted ? `, ${plotted} langsung terplot ke dosen PA.` : '.')
        );
        await reload();
      }
      setStage('done');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage('idle');
    setRows([]);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 920 }}>
      <Card>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 6 }}>Import massal</span>
        <span style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.5, display: 'block', marginBottom: 16 }}>
          Unggah Excel/CSV. NPM selalu dibaca sebagai teks — baris dengan NPM notasi ilmiah otomatis gagal validasi.
          Mode <b>mahasiswa baru</b> mendukung kolom <code>dosen_pa</code> untuk plotting sekaligus (isi nama dosen sesuai daftar distribusi; boleh dikosongkan).
        </span>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <ModeBtn active={mode === 'nilai'} onClick={() => { setMode('nilai'); reset(); }} label="Nilai KRS/KHS per NPM" />
          <ModeBtn active={mode === 'mahasiswa'} onClick={() => { setMode('mahasiswa'); reset(); }} label="Mahasiswa baru + plotting dosen PA" />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => (mode === 'nilai' ? downloadTemplateNilai() : downloadTemplateMahasiswa(dosenRoster))}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 12.5, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}
          >
            <Icon path="M12 4v12 M7 11l5 5 5-5 M4 20h16" size={15} />
            Unduh Template (.xlsx)
          </button>
        </div>
      </Card>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />

      {stage === 'idle' && (
        <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${colors.scrollThumb}`, borderRadius: 14, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', background: colors.surface }}>
          <Icon path="M12 16V4 M7 9l5-5 5 5 M4 20h16" size={30} stroke={colors.green} width={1.6} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>Klik untuk memilih file</span>
          <span style={{ fontSize: 12, color: colors.faint }}>.xlsx atau .csv, maksimal 5MB</span>
          {parseErr && <span style={{ fontSize: 12.5, color: colors.danger, fontWeight: 600 }}>{parseErr}</span>}
        </div>
      )}

      {stage === 'preview' && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Pratinjau &amp; validasi — {fileName}</span>
            {failed.length > 0 ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.danger, background: colors.dangerBg, padding: '5px 10px', borderRadius: 999 }}>{failed.length} baris gagal validasi</span>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.green, background: colors.greenSoftBg, padding: '5px 10px', borderRadius: 999 }}>Semua baris valid</span>
            )}
          </div>
          <div style={{ display: 'flex', marginBottom: 10 }}>
            <TableSearch value={previewQ} onChange={setPreviewQ} placeholder="Cari NPM, nama, atau pesan validasi..." width={9999} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
              <thead>
                <tr style={{ background: colors.subtle }}>
                  {([
                    ['NPM (mentah)', 'npm'], ['Nama', 'nama'],
                    [mode === 'nilai' ? 'SKS' : 'Prodi', 'c3'],
                    [mode === 'nilai' ? 'IP' : 'Kelas · Angkatan', 'c4'],
                    ...(mode === 'mahasiswa' ? ([['Dosen PA', 'c5']] as [string, SortKey][]) : []),
                    ['Validasi', 'valid'],
                  ] as [string, SortKey][]).map(([label, key]) => (
                    <SortableTh key={key} label={label} sortKey={key} sort={sort} style={TH} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewPage.total === 0 && (
                  <tr><td colSpan={mode === 'mahasiswa' ? 6 : 5} style={{ padding: '12px 14px', fontSize: 12.5, color: colors.faint }}>Tidak ada baris yang cocok dengan pencarian.</td></tr>
                )}
                {previewPage.pageRows.map(({ r, i }) => (
                  <tr key={i} style={{ borderTop: `1px solid ${colors.rowBorder}`, background: r.valid ? colors.surface : colors.dangerBg }}>
                    <td style={{ padding: '9px 14px', fontSize: 12.5, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{r.npm}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12.5, color: colors.ink }}>{r.nama}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12.5, color: colors.ink }}>{r.c3}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12.5, color: colors.ink }}>{r.c4}</td>
                    {mode === 'mahasiswa' && (
                      <td style={{ padding: '9px 14px', fontSize: 12.5, color: colors.ink }}>{r.c5 ?? '—'}</td>
                    )}
                    <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 700, color: r.valid ? colors.green : colors.danger }}>{r.valid ? '✓ Valid' : `✗ ${r.msg}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginBottom: 14 }}>
            <PaginationBar p={previewPage} itemLabel="baris" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            {failed.length > 0 ? (
              <a href={failedRowsCsv(failed)} download="baris_gagal_import.csv" style={{ fontSize: 12.5, fontWeight: 700, color: colors.green, textDecoration: 'none' }}>Unduh laporan baris gagal ↓</a>
            ) : <span />}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={reset} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button
                onClick={commit}
                disabled={busy || valid.length === 0}
                style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: valid.length ? colors.green : colors.disabled, color: colors.white, fontSize: 13, fontWeight: 700, cursor: valid.length ? 'pointer' : 'not-allowed' }}
              >
                {busy ? 'Memproses…' : `Commit ${valid.length} Baris Valid`}
              </button>
            </div>
          </div>
        </Card>
      )}

      {stage === 'done' && (
        <div style={{ background: colors.greenSoftBg, border: `1px solid ${colors.greenSoftBorder}`, borderRadius: 14, padding: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Icon path="M5 13l4 4L19 7" size={26} stroke={colors.green} width={2.4} />
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.green, display: 'block' }}>{doneMsg}</span>
            <span onClick={reset} style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, cursor: 'pointer', textDecoration: 'underline' }}>Import file lain</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{ padding: '9px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${active ? colors.green : colors.border}`, background: active ? colors.green : colors.surface, color: active ? colors.white : colors.ink }}>
      {label}
    </button>
  );
}

function validateNilai(
  raw: Record<string, string>[],
  records: Record<string, MahasiswaRecord>
): PreviewRow[] {
  const seen = new Set<string>();
  return raw.map((r) => {
    const npm = r.npm ?? '';
    const sksStr = r.sks_krs ?? r.sks ?? '';
    const ipStr = (r.ip_khs ?? r.ip ?? r.ipk ?? '').replace(',', '.');
    const known = records[npm];
    const nama = r.nama || known?.nama || '(tidak ditemukan)';
    const sks = Number(sksStr);
    const ip = Number(ipStr);
    const dup = seen.has(npm);
    seen.add(npm);

    let msg = '';
    if (!NPM_RE.test(npm)) msg = 'NPM notasi ilmiah / bukan teks';
    else if (dup) msg = 'NPM duplikat di dalam file';
    else if (!known) msg = 'NPM tidak dikenal';
    else if (!Number.isFinite(sks) || sks < 0 || sks > 200 || !Number.isInteger(sks)) msg = 'SKS tidak valid';
    else if (!Number.isFinite(ip) || ip < 0 || ip > 4) msg = 'IPK di luar rentang 0.00–4.00';

    return {
      npm, nama, c3: sksStr || '—', c4: ipStr || '—',
      valid: !msg, msg,
      payload: msg ? undefined : { npm, sksKrs: sks, ipKhs: ip },
    };
  });
}

function validateMahasiswa(
  raw: Record<string, string>[],
  records: Record<string, MahasiswaRecord>,
  dosenRoster: DosenRosterEntry[]
): PreviewRow[] {
  // dosen_pa dicocokkan ke roster berdasarkan nama, case-insensitive; gelar
  // boleh dihilangkan asal awalan nama cocok unik.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  function resolveDosen(input: string): DosenRosterEntry | null | undefined {
    if (!input) return null; // kosong = belum diplot (valid)
    const q2 = norm(input);
    const exact = dosenRoster.find((d) => norm(d.nama) === q2);
    if (exact) return exact;
    const prefix = dosenRoster.filter((d) => norm(d.nama).startsWith(q2));
    return prefix.length === 1 ? prefix[0] : undefined; // undefined = tak dikenal/ambigu
  }

  const seen = new Set<string>();
  return raw.map((r) => {
    const npm = r.npm ?? '';
    const nama = r.nama ?? '';
    const prodi = (r.prodi ?? '').toUpperCase();
    const kelas = (r.kelas ?? '').toUpperCase();
    const angkatan = Number(r.angkatan ?? '');
    const dosenInput = r.dosen_pa ?? r.dosen ?? '';
    const dosen = resolveDosen(dosenInput);
    const dup = seen.has(npm);
    seen.add(npm);

    let msg = '';
    if (!NPM_RE.test(npm)) msg = 'NPM notasi ilmiah / bukan teks';
    else if (dup) msg = 'NPM duplikat di dalam file';
    else if (records[npm]) msg = 'NPM sudah terdaftar';
    else if (!nama) msg = 'Nama kosong';
    else if (!PRODI.includes(prodi)) msg = `Prodi harus ${PRODI.join('/')}`;
    else if (!KELAS.includes(kelas)) msg = `Kelas harus ${KELAS.join('/')}`;
    else if (!Number.isInteger(angkatan) || angkatan < 2000 || angkatan > 2100) msg = 'Angkatan tidak valid';
    else if (dosen === undefined) msg = 'Dosen PA tidak dikenal / ambigu';

    const payload: MahasiswaRecord | undefined = msg ? undefined : {
      npm, nama, prodi: prodi as MahasiswaRecord['prodi'], angkatan,
      kelas: kelas as MahasiswaRecord['kelas'], semesterKe: 2, status: 'aktif',
      dosenPaUid: dosen ? dosen.dosenUid : undefined,
      pkkmb: false, toefl: false, esq: false, semkesCount: 0,
      akademik: { sksKrs: null, ipKhs: null, konsultasi: [], mkNilaiDE: [] },
      nonAkademik: { ukm: false, hima: false, bem: false, beasiswa: { ada: false, jenis: null, keterangan: '' }, prestasi: { ada: false, jenis: null, tingkat: null } },
      skripsi: { tahap: 'belum', kendala: '' },
      permasalahan: '', rekomendasi: '', statusPengisian: 'kosong', ipHistory: [],
    };

    return {
      npm, nama: nama || '—', c3: prodi || '—',
      c4: `${kelas || '—'} · ${r.angkatan || '—'}`,
      c5: dosen ? dosen.nama : dosenInput ? dosenInput : 'belum diplot',
      valid: !msg, msg, payload,
      dosenNama: dosen ? dosen.nama : undefined,
    };
  });
}
