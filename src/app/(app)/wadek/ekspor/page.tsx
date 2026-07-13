'use client';

import { useState } from 'react';
import { useData } from '@/lib/data-context';
import { downloadWithAuth } from '@/lib/download';
import { colors } from '@/lib/theme';
import { Card, Icon } from '@/components/ui';

export default function EksporPage() {
  const { periode, dosenRoster, periodeHistory } = useData();
  const [eksporDosen, setEksporDosen] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const selected = eksporDosen || dosenRoster[0]?.nama || '';

  async function unduh(key: string, url: string, filename: string) {
    if (busy) return;
    setBusy(key);
    setErr('');
    try {
      await downloadWithAuth(url, filename);
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal mengunduh.');
    } finally {
      setBusy('');
    }
  }

  const fileSlug = selected.replace(/[^a-zA-Z0-9]+/g, '_');

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
      {err && (
        <div style={{ background: colors.dangerBg, border: `1px solid ${colors.dangerBorder}`, borderRadius: 12, padding: '11px 16px', fontSize: 12.5, fontWeight: 600, color: colors.danger }}>
          {err}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 6 }}>PDF Laporan per Dosen</span>
          <span style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.5, display: 'block', marginBottom: 14 }}>
            Kop FIKes UIS, identitas dosen, tabel akademik/non-akademik/non-aktif-cuti, tanda pengesahan &amp; QR verifikasi.
          </span>
          <select value={selected} onChange={(e) => setEksporDosen(e.target.value)} style={{ width: '100%', padding: '10px 10px', borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 13, marginBottom: 12 }}>
            {dosenRoster.map((d) => (
              <option key={d.nama} value={d.nama}>{d.nama}</option>
            ))}
          </select>
          <button
            onClick={() => unduh('pdf', `/api/export/pdf?dosen=${encodeURIComponent(selected)}${periode ? `&periodeId=${periode.id}` : ''}`, `Laporan_PA_${fileSlug}_${periode?.id ?? ''}.pdf`)}
            disabled={busy === 'pdf'}
            style={dlBtn}
          >
            <Icon path="M12 4v12 M7 11l5 5 5-5 M4 20h16" size={15} />
            {busy === 'pdf' ? 'Menyiapkan…' : 'Unduh PDF'}
          </button>
        </Card>

        <Card>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 6 }}>Excel Rekap Fakultas</span>
          <span style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.5, display: 'block', marginBottom: 14 }}>
            Struktur kolom setara REKAPAN LAPORAN PA (dihitung otomatis dari record laporan), plus sheet Proposal Skripsi &amp; Distribusi Dosen PA.
          </span>
          <div style={{ height: 41 }} />
          <button
            onClick={() => unduh('xlsx', `/api/export/rekap${periode ? `?periodeId=${periode.id}` : ''}`, `Rekap_Fakultas_${periode?.id ?? 'aktif'}.xlsx`)}
            disabled={busy === 'xlsx'}
            style={dlBtn}
          >
            <Icon path="M12 4v12 M7 11l5 5 5-5 M4 20h16" size={15} />
            {busy === 'xlsx' ? 'Menyiapkan…' : 'Unduh Excel'}
          </button>
        </Card>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.rowBorder}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>Arsip periode terkunci</span>
        </div>
        {periodeHistory.length === 0 && (
          <div style={{ padding: '14px 24px', fontSize: 12.5, color: colors.faint }}>Belum ada periode terkunci.</div>
        )}
        {periodeHistory.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 24px', borderTop: `1px solid ${colors.rowBorder}` }}>
            <span style={{ fontSize: 13, color: colors.ink, fontWeight: 600 }}>{p.label}</span>
            <button
              onClick={() => unduh(p.id, `/api/export/rekap?periodeId=${p.id}`, `Rekap_Fakultas_${p.id}.xlsx`)}
              disabled={busy === p.id}
              style={{ fontSize: 12.5, fontWeight: 700, color: colors.green, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {busy === p.id ? 'Menyiapkan…' : 'Unduh ↓'}
            </button>
          </div>
        ))}
      </div>

      <span style={{ fontSize: 11.5, color: colors.faint, lineHeight: 1.5 }}>
        Seluruh ekspor di-generate server-side dari data laporan saat diunduh dan hanya dapat diakses oleh
        peran yang berwenang (endpoint terproteksi token — PRD §7.5), sehingga arsip periode terkunci selalu
        dapat diunduh ulang kapan pun (bukti AMI lintas tahun — PRD §5.4 W3).
      </span>
    </div>
  );
}

const dlBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 8, padding: 11, borderRadius: 9, background: colors.green, color: colors.white,
  fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', width: '100%',
};
