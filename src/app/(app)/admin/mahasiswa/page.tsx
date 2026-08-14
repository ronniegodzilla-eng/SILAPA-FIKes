'use client';

import { useState } from 'react';
import { useData } from '@/lib/data-context';
import { colors, statusPill, STATUS_LABEL } from '@/lib/theme';
import { Icon, Pill, inputStyle, labelStyle } from '@/components/ui';
import { PaginationBar, SortableTh, useTableSort, usePagination } from '@/components/table-tools';
import type { MahasiswaRecord } from '@/lib/types';

/** Kolom yang bisa diurutkan pada tabel master mahasiswa. */
type SortKey = 'npm' | 'nama' | 'prodi' | 'angkatan' | 'kelas' | 'dosen' | 'status';

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase',
};

interface Draft {
  npm: string;
  nama: string;
  prodi: string;
  kelas: string;
  angkatan: number;
}

export default function MasterMahasiswaPage() {
  const { recordList, dosenRoster, addMahasiswa, editMahasiswaMaster, toggleNonaktif } = useData();
  const namaByUid = new Map(dosenRoster.map((d) => [d.dosenUid, d.nama]));
  const [search, setSearch] = useState('');
  const [filterProdi, setFilterProdi] = useState('semua');
  const [mode, setMode] = useState<'add' | 'edit' | null>(null);
  const [editNpm, setEditNpm] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ npm: '', nama: '', prodi: 'K3', kelas: 'REG A', angkatan: 2026 });

  const sort = useTableSort<SortKey>();
  const q = search.trim().toLowerCase();
  const filtered = recordList.filter((m) => {
    const matchesQ =
      !q ||
      m.nama.toLowerCase().includes(q) ||
      m.npm.includes(q) ||
      (namaByUid.get(m.dosenPaUid ?? '') ?? '').toLowerCase().includes(q);
    const matchesProdi = filterProdi === 'semua' || m.prodi === filterProdi;
    return matchesQ && matchesProdi;
  });
  const sorted = sort.sortRows(filtered, (m, key) =>
    key === 'dosen' ? namaByUid.get(m.dosenPaUid ?? '') ?? '' : (m[key as keyof MahasiswaRecord] as never)
  );
  // Data riil ±1.500 baris — dipaginasi (dulu dipotong keras di 200 baris,
  // sisanya tidak bisa dilihat sama sekali).
  const p = usePagination(sorted, undefined, sort.sortSig);
  const rows = p.pageRows;

  function openAdd() {
    const newNpm = '26' + String(1000000000 + Math.floor(Math.random() * 89999999)).slice(0, 10);
    setDraft({ npm: newNpm, nama: '', prodi: 'K3', kelas: 'REG A', angkatan: 2026 });
    setEditNpm(null);
    setMode('add');
  }

  function openEdit(m: MahasiswaRecord) {
    setDraft({ npm: m.npm, nama: m.nama, prodi: m.prodi, kelas: m.kelas, angkatan: m.angkatan });
    setEditNpm(m.npm);
    setMode('edit');
  }

  function close() {
    setMode(null);
    setEditNpm(null);
  }

  async function save() {
    if (mode === 'edit' && editNpm) {
      await editMahasiswaMaster(editNpm, { nama: draft.nama, prodi: draft.prodi, kelas: draft.kelas, angkatan: draft.angkatan });
    } else if (mode === 'add') {
      const rec: MahasiswaRecord = {
        npm: draft.npm, nama: draft.nama || 'Mahasiswa Baru', prodi: draft.prodi as MahasiswaRecord['prodi'],
        angkatan: draft.angkatan, kelas: draft.kelas as MahasiswaRecord['kelas'], semesterKe: 2, status: 'aktif',
        pkkmb: false, toefl: false, esq: false, semkesCount: 0,
        akademik: { sksKrs: null, ipKhs: null, konsultasi: [], mkNilaiDE: [] },
        nonAkademik: { ukm: false, hima: false, bem: false, beasiswa: { ada: false, jenis: null, keterangan: '' }, prestasi: { ada: false, jenis: null, tingkat: null } },
        skripsi: { tahap: 'belum', kendala: '' },
        permasalahan: '', rekomendasi: '', statusPengisian: 'kosong', ipHistory: [],
      };
      await addMahasiswa(rec);
    }
    close();
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240, flexWrap: 'wrap' }}>
          <input placeholder="Cari nama, NPM, atau dosen PA..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, maxWidth: 320, padding: '10px 14px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13.5, outline: 'none' }} />
          <select value={filterProdi} onChange={(e) => setFilterProdi(e.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13, color: colors.ink, background: colors.surface }}>
            <option value="semua">Semua prodi</option>
            <option value="K3">K3</option>
            <option value="KL">KL</option>
            <option value="S2KM">S2KM</option>
          </select>
        </div>
        <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Icon path="M12 5v14 M5 12h14" size={15} width={2} />
          Tambah Mahasiswa
        </button>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.subtle }}>
              {([
                ['NPM', 'npm'], ['Nama', 'nama'], ['Prodi', 'prodi'], ['Angkatan', 'angkatan'],
                ['Kelas', 'kelas'], ['Dosen PA', 'dosen'], ['Status', 'status'],
              ] as [string, SortKey][]).map(([label, key]) => (
                <SortableTh key={key} label={label} sortKey={key} sort={sort} style={TH} />
              ))}
              <th style={{ ...TH, textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const sp = statusPill(m.status);
              return (
                <tr key={m.npm} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>{m.npm}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 600, color: colors.ink }}>{m.nama}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{m.prodi}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{m.angkatan}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{m.kelas}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>
                    {namaByUid.get(m.dosenPaUid ?? '') ?? '—'}
                  </td>
                  <td style={{ padding: '11px 16px' }}><Pill label={STATUS_LABEL[m.status]} color={sp.color} bg={sp.bg} capitalize /></td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span onClick={() => openEdit(m)} style={{ fontSize: 12, fontWeight: 700, color: colors.green, cursor: 'pointer', marginRight: 14 }}>Edit</span>
                    <span onClick={() => toggleNonaktif(m.npm)} style={{ fontSize: 12, fontWeight: 700, color: colors.danger, cursor: 'pointer' }}>
                      {m.status === 'non_aktif' ? 'Aktifkan' : 'Nonaktifkan'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginationBar
        p={p}
        itemLabel="mahasiswa"
        note={filtered.length !== recordList.length ? `(hasil saring dari ${recordList.length} mahasiswa terdaftar di fakultas)` : undefined}
      />

      {mode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: '26px 28px', width: 420, maxWidth: '90vw', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink, display: 'block', marginBottom: 16 }}>
              {mode === 'edit' ? 'Edit Data Mahasiswa' : 'Tambah Mahasiswa Baru'}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>NPM</label>
                <input value={draft.npm} onChange={(e) => setDraft({ ...draft, npm: e.target.value })} disabled={mode === 'edit'} style={{ ...inputStyle, background: mode === 'edit' ? colors.subtle : colors.surface }} />
              </div>
              <div>
                <label style={labelStyle}>Nama</label>
                <input value={draft.nama} onChange={(e) => setDraft({ ...draft, nama: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Prodi</label>
                  <select value={draft.prodi} onChange={(e) => setDraft({ ...draft, prodi: e.target.value })} style={inputStyle}>
                    <option value="K3">K3</option>
                    <option value="KL">KL</option>
                    <option value="S2KM">S2KM</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Kelas</label>
                  <select value={draft.kelas} onChange={(e) => setDraft({ ...draft, kelas: e.target.value })} style={inputStyle}>
                    <option value="-">— (belum tercatat)</option>
                    <option value="REG A">REG A</option>
                    <option value="REG B">REG B</option>
                    <option value="REG C">REG C</option>
                    <option value="REG D">REG D</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Angkatan</label>
                <input type="number" value={draft.angkatan} onChange={(e) => setDraft({ ...draft, angkatan: Number(e.target.value) })} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={close} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button onClick={save} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
