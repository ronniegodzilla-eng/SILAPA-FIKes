'use client';

import { useEffect, useState } from 'react';
import { useData } from '@/lib/data-context';
import { fetchMahasiswaRecords } from '@/lib/firestore/data';
import { computeDosenStats, computeIpkPerProdi, type ProdiIpk } from '@/lib/compute';
import { colors, kirimPill, KIRIM_LABEL } from '@/lib/theme';
import { Pill } from '@/components/ui';
import { PaginationBar, SortableTh, useTableSort, usePagination } from '@/components/table-tools';

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase',
};

type SortKey = 'nama' | 'prodi' | 'jumlah' | 'statusKirim';

export default function VerifikasiPage() {
  const { periode, dosenRoster, setPeriodeStatus, verifTerima, verifKembalikan } = useData();
  const [openDosen, setOpenDosen] = useState<string | null>(null);
  const [catatan, setCatatan] = useState('');
  const [search, setSearch] = useState('');
  const [filterProdi, setFilterProdi] = useState('semua');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [detailStats, setDetailStats] = useState<ReturnType<typeof computeDosenStats> | null>(null);
  const [detailIpk, setDetailIpk] = useState<ProdiIpk[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const diverifikasi = dosenRoster.filter((d) => d.statusKirim === 'diverifikasi').length;
  const allVerified = dosenRoster.length > 0 && diverifikasi === dosenRoster.length;

  const sort = useTableSort<SortKey>();
  const q = search.trim().toLowerCase();
  const filtered = dosenRoster.filter((d) => {
    const matchesQ = !q || d.nama.toLowerCase().includes(q);
    const matchesProdi = filterProdi === 'semua' || d.prodi === filterProdi;
    const matchesStatus = filterStatus === 'semua' || d.statusKirim === filterStatus;
    return matchesQ && matchesProdi && matchesStatus;
  });
  const sorted = sort.sortRows(filtered, (d, key) => d[key]);
  const p = usePagination(sorted, undefined, sort.sortSig);
  const rows = p.pageRows;
  const prodiOptions = Array.from(new Set(dosenRoster.map((d) => d.prodi))).sort();

  const detail = openDosen ? dosenRoster.find((d) => d.nama === openDosen) : null;
  const detailPill = detail ? kirimPill(detail.statusKirim) : null;

  // Kelengkapan dosen ini — query terpisah yang dibatasi ke bimbingannya
  // sendiri (bounded, bukan pemindaian seluruh 1.500+ record fakultas).
  useEffect(() => {
    if (!detail || !periode) {
      setDetailStats(null);
      setDetailIpk([]);
      return;
    }
    setDetailLoading(true);
    fetchMahasiswaRecords(periode.id, { dosenPaUid: detail.dosenUid })
      .then((records) => {
        setDetailStats(computeDosenStats(records));
        setDetailIpk(computeIpkPerProdi(records));
      })
      .catch(() => { setDetailStats(null); setDetailIpk([]); })
      .finally(() => setDetailLoading(false));
  }, [detail, periode]);

  function open(nama: string) {
    setOpenDosen(nama);
    setCatatan('');
  }
  function close() {
    setOpenDosen(null);
    setCatatan('');
  }
  async function terima() {
    if (openDosen) await verifTerima(openDosen);
    close();
  }
  async function kembalikan() {
    if (openDosen) await verifKembalikan(openDosen, catatan);
    close();
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 13, color: colors.muted }}>{diverifikasi} dari {dosenRoster.length} dosen sudah diverifikasi.</span>
        <button
          onClick={() => allVerified && setPeriodeStatus('dikunci')}
          disabled={!allVerified}
          style={{ padding: '10px 18px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, color: colors.white, background: allVerified ? colors.danger : '#B7C2B1', cursor: allVerified ? 'pointer' : 'not-allowed' }}
        >
          Tutup Periode
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          placeholder="Cari nama dosen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 320, padding: '10px 14px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13.5, outline: 'none' }}
        />
        <select
          value={filterProdi}
          onChange={(e) => setFilterProdi(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13, color: colors.ink, background: colors.surface }}
        >
          <option value="semua">Semua prodi</option>
          {prodiOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13, color: colors.ink, background: colors.surface }}
        >
          <option value="semua">Semua status</option>
          <option value="draft">Belum mulai</option>
          <option value="dikirim">Dikirim</option>
          <option value="dikembalikan">Dikembalikan</option>
          <option value="diverifikasi">Diverifikasi</option>
        </select>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.subtle }}>
              <SortableTh label="Dosen PA" sortKey="nama" sort={sort} style={TH} />
              <SortableTh label="Prodi" sortKey="prodi" sort={sort} style={TH} />
              <SortableTh label="Jumlah Bimbingan" sortKey="jumlah" sort={sort} style={TH} />
              <SortableTh label="Status Kiriman" sortKey="statusKirim" sort={sort} style={TH} />
              <th style={{ ...TH, textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '16px', fontSize: 12.5, color: colors.faint, textAlign: 'center' }}>Tidak ada dosen yang cocok dengan pencarian/filter.</td></tr>
            )}
            {rows.map((d) => {
              const kp = kirimPill(d.statusKirim);
              return (
                <tr key={d.nama} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
                  <td style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 600, color: colors.ink }}>{d.nama}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{d.prodi}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{d.jumlah}</td>
                  <td style={{ padding: '11px 16px' }}><Pill label={KIRIM_LABEL[d.statusKirim]} color={kp.color} bg={kp.bg} /></td>
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span onClick={() => open(d.nama)} style={{ fontSize: 12, fontWeight: 700, color: colors.green, cursor: 'pointer' }}>
                      {d.statusKirim === 'diverifikasi' ? 'Lihat' : 'Buka Detail'}
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
        itemLabel="dosen PA"
        note={filtered.length !== dosenRoster.length ? `(hasil saring dari ${dosenRoster.length} dosen)` : undefined}
      />

      {detail && detailPill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: '26px 28px', width: 460, maxWidth: '92vw', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px 10px', marginBottom: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink }}>{detail.nama}</span>
              <Pill label={KIRIM_LABEL[detail.statusKirim]} color={detailPill.color} bg={detailPill.bg} fontSize={11} />
            </div>
            <span style={{ fontSize: 12.5, color: colors.muted, display: 'block', marginBottom: 16 }}>{detail.prodi} · {detail.jumlah} mahasiswa bimbingan</span>

            {detailLoading && (
              <span style={{ fontSize: 12, color: colors.faint, display: 'block', marginBottom: 16 }}>Memuat kelengkapan…</span>
            )}
            {detailStats && detailStats.total > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                <MiniStat value={detailStats.lengkap} label="Lengkap" color={colors.green} />
                <MiniStat value={detailStats.sebagian} label="Sebagian" color={colors.amber} />
                <MiniStat value={detailStats.kosong} label="Kosong" color={colors.danger} />
              </div>
            )}

            {detailIpk.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                  IPK rata-rata per prodi bimbingan
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(detailIpk.length, 3)},1fr)`, gap: 10 }}>
                  {detailIpk.map((p) => (
                    <div key={p.prodi} style={{ background: colors.subtle, borderRadius: 9, padding: 11, textAlign: 'center' }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: colors.ink }}>{p.rata}</div>
                      <span style={{ fontSize: 10.5, color: colors.muted }}>{p.prodi} · n={p.n}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>Catatan (untuk pengembalian)</label>
            <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={3} placeholder="Contoh: mohon lengkapi data akademik 3 mahasiswa yang masih kosong." style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', marginBottom: 18 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={close} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Tutup</button>
              <button onClick={kembalikan} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.danger, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Kembalikan</button>
              <button onClick={terima} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Terima &amp; Verifikasi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ background: colors.subtle, borderRadius: 9, padding: 11, textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 800, color }}>{value}</div>
      <span style={{ fontSize: 10.5, color: colors.muted }}>{label}</span>
    </div>
  );
}
