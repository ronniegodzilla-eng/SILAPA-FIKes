'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import { colors } from '@/lib/theme';
import { Card } from '@/components/ui';

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase',
};
const selStyle: React.CSSProperties = {
  width: '100%', padding: '10px 10px', borderRadius: 9,
  border: `1px solid ${colors.border}`, fontSize: 13,
};

export default function PlottingPage() {
  const { recordList, dosenRoster, movePlotting } = useData();

  // per-mahasiswa move
  const [selectedNpm, setSelectedNpm] = useState('');
  const [targetUid, setTargetUid] = useState('');
  const [alsoCurrent, setAlsoCurrent] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  // bulk move
  const [bulkAngkatan, setBulkAngkatan] = useState('');
  const [bulkKelas, setBulkKelas] = useState('');
  const [bulkProdi, setBulkProdi] = useState('');
  const [bulkTargetUid, setBulkTargetUid] = useState('');
  const [bulkToast, setBulkToast] = useState('');

  const namaByUid = useMemo(() => new Map(dosenRoster.map((d) => [d.dosenUid, d.nama])), [dosenRoster]);
  const angkatanOptions = useMemo(
    () => Array.from(new Set(recordList.map((m) => m.angkatan))).sort(),
    [recordList]
  );

  const bulkMatches = recordList.filter(
    (m) =>
      (!bulkAngkatan || String(m.angkatan) === bulkAngkatan) &&
      (!bulkKelas || m.kelas === bulkKelas) &&
      (!bulkProdi || m.prodi === bulkProdi)
  );
  const bulkFiltered = !!(bulkAngkatan || bulkKelas || bulkProdi);

  const canMove = !!selectedNpm && !!targetUid;
  const canBulk = bulkFiltered && bulkMatches.length > 0 && !!bulkTargetUid;
  const total = dosenRoster.reduce((sum, d) => sum + d.jumlah, 0);

  async function moveSingle() {
    if (!canMove || busy) return;
    setBusy(true);
    try {
      const m = recordList.find((r) => r.npm === selectedNpm);
      await movePlotting([selectedNpm], targetUid, alsoCurrent);
      setToast(`${m?.nama ?? 'Mahasiswa'} dipindahkan ke ${namaByUid.get(targetUid) ?? targetUid}${alsoCurrent ? ' (termasuk laporan periode aktif)' : ' (berlaku periode berikutnya)'}.`);
      setSelectedNpm('');
      setTargetUid('');
    } finally {
      setBusy(false);
    }
  }

  async function moveBulk() {
    if (!canBulk || busy) return;
    setBusy(true);
    try {
      await movePlotting(bulkMatches.map((m) => m.npm), bulkTargetUid, alsoCurrent);
      setBulkToast(`${bulkMatches.length} mahasiswa dipindahkan ke ${namaByUid.get(bulkTargetUid) ?? bulkTargetUid}.`);
      setBulkAngkatan(''); setBulkKelas(''); setBulkProdi(''); setBulkTargetUid('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Pindahkan mahasiswa antar dosen PA</span>
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>Mahasiswa</label>
            <select value={selectedNpm} onChange={(e) => setSelectedNpm(e.target.value)} style={selStyle}>
              <option value="">Pilih mahasiswa...</option>
              {recordList.map((m) => (
                <option key={m.npm} value={m.npm}>
                  {m.nama} ({m.npm}) — {namaByUid.get(m.dosenPaUid ?? '') ?? 'belum diplot'}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>Dosen PA tujuan</label>
            <select value={targetUid} onChange={(e) => setTargetUid(e.target.value)} style={selStyle}>
              <option value="">Pilih dosen...</option>
              {dosenRoster.map((d) => (
                <option key={d.dosenUid} value={d.dosenUid}>{d.nama}</option>
              ))}
            </select>
          </div>
          <button onClick={moveSingle} disabled={!canMove || busy} style={{ padding: '11px 22px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, color: colors.white, background: canMove ? colors.green : colors.disabled, cursor: canMove ? 'pointer' : 'not-allowed' }}>Pindahkan</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.ink, marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={alsoCurrent} onChange={(e) => setAlsoCurrent(e.target.checked)} />
          Terapkan juga ke record laporan periode aktif (default: perpindahan berlaku mulai periode berikutnya)
        </label>
        {toast && <span style={{ display: 'block', marginTop: 12, fontSize: 12.5, fontWeight: 700, color: colors.green }}>✓ {toast}</span>}
      </Card>

      <Card>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 4 }}>Pindah massal per angkatan / kelas</span>
        <span style={{ fontSize: 12, color: colors.faint, display: 'block', marginBottom: 14 }}>Saring dulu, lalu pindahkan seluruh hasil saringan ke satu dosen PA.</span>
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 120 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>Angkatan</label>
            <select value={bulkAngkatan} onChange={(e) => setBulkAngkatan(e.target.value)} style={selStyle}>
              <option value="">Semua</option>
              {angkatanOptions.map((a) => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 120 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>Kelas</label>
            <select value={bulkKelas} onChange={(e) => setBulkKelas(e.target.value)} style={selStyle}>
              <option value="">Semua</option>
              {['REG A', 'REG B', 'REG C', 'REG D'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 110 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>Prodi</label>
            <select value={bulkProdi} onChange={(e) => setBulkProdi(e.target.value)} style={selStyle}>
              <option value="">Semua</option>
              {['K3', 'KL', 'S2KM'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>Dosen PA tujuan</label>
            <select value={bulkTargetUid} onChange={(e) => setBulkTargetUid(e.target.value)} style={selStyle}>
              <option value="">Pilih dosen...</option>
              {dosenRoster.map((d) => (
                <option key={d.dosenUid} value={d.dosenUid}>{d.nama}</option>
              ))}
            </select>
          </div>
          <button onClick={moveBulk} disabled={!canBulk || busy} style={{ padding: '11px 22px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, color: colors.white, background: canBulk ? colors.green : colors.disabled, cursor: canBulk ? 'pointer' : 'not-allowed' }}>
            Pindahkan {bulkFiltered ? bulkMatches.length : 0}
          </button>
        </div>
        {bulkToast && <span style={{ display: 'block', marginTop: 12, fontSize: 12.5, fontWeight: 700, color: colors.green }}>✓ {bulkToast}</span>}
      </Card>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.subtle }}>
              <th style={TH}>Dosen PA</th>
              <th style={TH}>Prodi Homebase</th>
              <th style={TH}>Jumlah Bimbingan</th>
            </tr>
          </thead>
          <tbody>
            {dosenRoster.map((d) => (
              <tr key={d.nama} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
                <td style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 600, color: colors.ink }}>{d.nama}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{d.prodi}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink, fontWeight: 700 }}>{d.jumlah}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${colors.border}`, background: colors.subtle }}>
              <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 800, color: colors.ink }}>Total</td>
              <td />
              <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 800, color: colors.ink }}>{total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
