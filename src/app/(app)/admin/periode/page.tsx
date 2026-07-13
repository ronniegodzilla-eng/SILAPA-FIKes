'use client';

import { useState } from 'react';
import { useData } from '@/lib/data-context';
import { colors, periodePill } from '@/lib/theme';
import { Card, Pill } from '@/components/ui';

const STATUS_DESC: Record<string, string> = {
  draft: 'Periode belum dibuka. Buka periode untuk men-generate record laporan seluruh mahasiswa aktif sesuai plotting saat ini.',
  dibuka: 'Periode sedang berjalan. Dosen PA dapat mengisi laporan bimbingan untuk seluruh mahasiswa aktif.',
  verifikasi: 'Pengisian ditutup. Wakil Dekan I sedang memverifikasi kiriman tiap dosen PA.',
  dikunci: 'Periode terkunci. Seluruh data bersifat read-only dan menjadi arsip bukti mutu (AMI/akreditasi).',
};

/**
 * Opsi tahun akademik untuk periode baru: diturunkan dari periode terakhir di
 * database (sumber kebenaran tunggal — tidak bergantung jam perangkat), dengan
 * deteksi tanggal hanya sebagai fallback bila belum ada periode sama sekali.
 */
function tahunOptions(currentTA: string | null): string[] {
  let baseYear: number;
  if (currentTA && /^\d{4}\/\d{4}$/.test(currentTA)) {
    baseYear = Number(currentTA.split('/')[0]);
  } else {
    const now = new Date();
    // Tahun akademik baru dimulai sekitar September; sebelum Juli masih TA lalu.
    baseYear = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  }
  return [0, 1, 2].map((i) => `${baseYear + i}/${baseYear + i + 1}`);
}

export default function PeriodePage() {
  const { periode, periodeHistory, setPeriodeStatus, bukaPeriode, buatPeriode, reload } = useData();
  const [genToast, setGenToast] = useState('');
  const [busy, setBusy] = useState(false);

  // Default pintar: ganjil selesai → genap TA yang sama; genap selesai → ganjil TA berikutnya.
  const taOptions = tahunOptions(periode?.tahunAkademik ?? null);
  const defaultTahun = periode
    ? periode.semester === 'ganjil'
      ? periode.tahunAkademik
      : taOptions[1]
    : taOptions[0];
  const defaultSemester: 'ganjil' | 'genap' = periode?.semester === 'ganjil' ? 'genap' : 'ganjil';
  const [newTahun, setNewTahun] = useState(defaultTahun);
  const [newSemester, setNewSemester] = useState<'ganjil' | 'genap'>(defaultSemester);
  const [createErr, setCreateErr] = useState('');

  if (!periode) return <div style={{ fontSize: 13, color: colors.muted }}>Tidak ada periode.</div>;

  const pill = periodePill(periode.status);
  const semLabel = periode.semester === 'genap' ? 'Genap' : 'Ganjil';

  async function doBuka() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await bukaPeriode();
      setGenToast(`Periode dibuka — ${res.generated} record laporan digenerate${res.skipped ? `, ${res.skipped} sudah ada (dilewati)` : ''}.`);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function doCreate() {
    setCreateErr('');
    const id = `${newTahun.replace('/', '-')}-${newSemester}`;
    const exists =
      periode?.id === id || periodeHistory.some((p) => p.id === id);
    if (exists) {
      setCreateErr(`Periode ${newTahun} ${newSemester} sudah pernah dibuat.`);
      return;
    }
    setBusy(true);
    try {
      await buatPeriode(newTahun, newSemester);
      setGenToast('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
      <Card padding="24px">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px 12px', marginBottom: 10 }}>
          <span style={{ fontFamily: "'Lora',serif", fontSize: 19, fontWeight: 700, color: colors.ink }}>
            Periode {periode.tahunAkademik} · {semLabel}
          </span>
          <Pill label={periode.status} color={pill.color} bg={pill.bg} capitalize fontSize={11.5} />
        </div>
        <span style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.6, display: 'block', marginBottom: 18 }}>{STATUS_DESC[periode.status]}</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {periode.status === 'draft' && (
            <button onClick={doBuka} disabled={busy} style={btn(colors.green)}>
              {busy ? 'Men-generate…' : 'Buka Periode & Generate Laporan'}
            </button>
          )}
          {periode.status === 'dibuka' && (
            <button onClick={() => setPeriodeStatus('verifikasi')} style={btn(colors.amber)}>Tutup Pengisian → Mulai Verifikasi</button>
          )}
          {periode.status === 'verifikasi' && (
            <>
              <button onClick={() => setPeriodeStatus('dikunci')} style={btn(colors.danger)}>Kunci Periode</button>
              <button onClick={() => setPeriodeStatus('dibuka')} style={btnOutline()}>Buka Kembali Pengisian</button>
            </>
          )}
          {periode.status === 'dikunci' && (
            <button onClick={() => setPeriodeStatus('verifikasi')} style={btnOutline()}>
              Buka Kunci → Kembali ke Verifikasi
            </button>
          )}
        </div>
        {periode.status === 'dikunci' && (
          <span style={{ display: 'block', marginTop: 10, fontSize: 11.5, color: colors.faint, lineHeight: 1.5 }}>
            Buka kunci mengembalikan periode ke tahap verifikasi sehingga data dapat dikoreksi (atas persetujuan Wakil Dekan I), lalu dikunci kembali.
          </span>
        )}
        {genToast && <span style={{ display: 'block', marginTop: 12, fontSize: 12.5, fontWeight: 700, color: colors.green }}>✓ {genToast}</span>}
      </Card>

      {periode.status === 'dikunci' && (
        <Card padding="24px">
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 4 }}>Buat periode baru</span>
          <span style={{ fontSize: 12, color: colors.faint, display: 'block', marginBottom: 14 }}>
            Periode aktif sudah dikunci. Buat periode berikutnya, lalu buka untuk men-generate laporan dari plotting terbaru.
          </span>
          <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 160 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>Tahun akademik</label>
              <select value={newTahun} onChange={(e) => setNewTahun(e.target.value)} style={{ width: '100%', padding: '10px 10px', borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 13, background: colors.surface }}>
                {taOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 140 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>Semester</label>
              <select value={newSemester} onChange={(e) => setNewSemester(e.target.value as 'ganjil' | 'genap')} style={{ width: '100%', padding: '10px 10px', borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 13 }}>
                <option value="ganjil">Ganjil</option>
                <option value="genap">Genap</option>
              </select>
            </div>
            <button onClick={doCreate} disabled={busy} style={btn(colors.green)}>Buat Periode</button>
          </div>
          {createErr && <span style={{ display: 'block', marginTop: 10, fontSize: 12.5, fontWeight: 600, color: colors.danger }}>{createErr}</span>}
        </Card>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.rowBorder}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>Riwayat periode</span>
        </div>
        {periodeHistory.map((p) => {
          const pp = periodePill(p.status);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 24px', borderTop: `1px solid ${colors.rowBorder}` }}>
              <span style={{ fontSize: 13, color: colors.ink, fontWeight: 600 }}>{p.label}</span>
              <Pill label={p.status} color={pp.color} bg={pp.bg} capitalize fontSize={11} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { padding: '11px 18px', borderRadius: 9, border: 'none', background: bg, color: '#FFFFFF', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
}

function btnOutline(): React.CSSProperties {
  return { padding: '11px 18px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
}
