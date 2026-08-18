'use client';

import { useState } from 'react';
import { colors } from '@/lib/theme';
import { labelStyle } from '@/components/ui';

/**
 * Form alasan pengunduran diri — dipakai dosen PA (form laporan) dan admin
 * (master data). Sengaja satu komponen: keduanya mengajukan hal yang persis
 * sama dan wajib menyertakan alasan, karena Wakil Dekan I memutuskan hanya
 * berdasarkan apa yang tertulis di sini.
 */
export function PengunduranModal({
  nama,
  npm,
  onBatal,
  onKirim,
}: {
  nama: string;
  npm: string;
  onBatal: () => void;
  onKirim: (alasan: string) => Promise<void>;
}) {
  const [alasan, setAlasan] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cukup = alasan.trim().length >= 5;

  async function kirim() {
    if (!cukup || busy) return;
    setBusy(true);
    setErr('');
    try {
      await onKirim(alasan.trim());
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal mengirim pengajuan.');
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: colors.surface, borderRadius: 16, padding: '26px 28px', width: 460, maxWidth: '92vw', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink, display: 'block', marginBottom: 6 }}>
          Ajukan Pengunduran Diri
        </span>
        <span style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.6, display: 'block', marginBottom: 16 }}>
          <b>{nama}</b> (NPM {npm}). Status belum berubah sekarang — pengajuan ini
          dikirim ke Wakil Dekan I. Setelah divalidasi, mahasiswa keluar dari
          daftar bimbingan dan datanya menjadi non-aktif.
        </span>

        <label style={labelStyle}>Alasan pengunduran diri</label>
        <textarea
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={4}
          autoFocus
          placeholder="mis. Surat pengunduran diri tertanggal 10 Agustus 2026, pindah ke perguruan tinggi lain."
          style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }}
        />
        <span style={{ fontSize: 11.5, color: cukup ? colors.muted : colors.danger, display: 'block', marginTop: 6 }}>
          {cukup ? 'Alasan akan terbaca oleh Wakil Dekan I.' : 'Alasan wajib diisi (minimal 5 karakter).'}
        </span>
        {err && (
          <span style={{ fontSize: 12, fontWeight: 700, color: colors.danger, display: 'block', marginTop: 10 }}>{err}</span>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button
            onClick={onBatal}
            disabled={busy}
            style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 12.5, fontWeight: 700, color: colors.ink, cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            Batal
          </button>
          <button
            onClick={kirim}
            disabled={!cukup || busy}
            style={{ padding: '10px 20px', borderRadius: 9, border: 'none', fontSize: 12.5, fontWeight: 700, color: colors.white, background: cukup && !busy ? colors.green : colors.disabled, cursor: cukup && !busy ? 'pointer' : 'not-allowed' }}
          >
            {busy ? 'Mengirim…' : 'Kirim ke Wakil Dekan I'}
          </button>
        </div>
      </div>
    </div>
  );
}
