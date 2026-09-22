'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/download';
import { colors } from '@/lib/theme';
import { Card, Icon } from '@/components/ui';

/**
 * Kartu tautan pengisian kuesioner — dipakai tim evaluasi maupun dosen PA.
 *
 * Perannya ditentukan server dari akun pemanggil, bukan dari prop: tim evaluasi
 * mendapat tautan selingkup fakultas, dosen PA mendapat tautan yang hanya
 * berlaku bagi bimbingannya. Komponennya satu supaya perilakunya tidak
 * bercabang — termasuk peringatan saat mengganti tautan.
 */
export function TautanKuesionerCard({ jumlahSasaran }: { jumlahSasaran?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [lingkup, setLingkup] = useState<'fakultas' | 'dosen' | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    apiFetch<{ url: string | null; lingkup: 'fakultas' | 'dosen' }>('/api/kuesioner/token')
      .then((r) => { setUrl(r.url); setLingkup(r.lingkup); })
      .catch(() => setUrl(null))
      .finally(() => setMemuat(false));
  }, []);

  async function buat() {
    if (sibuk) return;
    // Mengganti tautan MEMATIKAN yang sudah beredar. Sama seperti tautan isi
    // data mandiri: sekali ketuk tanpa sadar bisa memutus mahasiswa yang
    // sedang mengisi.
    if (url) {
      const sasaran = jumlahSasaran ? `${jumlahSasaran} mahasiswa` : 'mahasiswa';
      const yakin = window.confirm(
        `Ganti link kuesioner?\n\nLink yang sudah dibagikan ke ${sasaran} akan LANGSUNG MATI, termasuk bagi yang sedang mengisi.\n\nKalau hanya ingin membagikan ulang, tutup pesan ini lalu tekan "Salin Link".`
      );
      if (!yakin) return;
    }
    setSibuk(true);
    setGalat('');
    setTersalin(false);
    try {
      const r = await apiFetch<{ url: string; lingkup: 'fakultas' | 'dosen' }>('/api/kuesioner/token', { method: 'POST' });
      setUrl(r.url);
      setLingkup(r.lingkup);
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal membuat link.');
    } finally {
      setSibuk(false);
    }
  }

  async function salin() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      setGalat('Gagal menyalin — salin manual dari kotak di atas.');
    }
  }

  return (
    <Card>
      <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Link pengisian kuesioner</span>
      <span style={{ display: 'block', fontSize: 12, color: colors.faint, marginTop: 4, marginBottom: 14, lineHeight: 1.55 }}>
        {lingkup === 'dosen'
          ? 'Berlaku untuk mahasiswa bimbingan Anda saja. Mahasiswa masuk dengan NPM, nama, dan prodi — tanpa login.'
          : 'Berlaku untuk seluruh mahasiswa fakultas. Mahasiswa masuk dengan NPM, nama, dan prodi — tanpa login.'}
        {' '}Satu link memuat semua kuesioner yang sedang dibuka.
      </span>

      {memuat ? (
        <span style={{ fontSize: 12.5, color: colors.faint }}>Memuat…</span>
      ) : url ? (
        <>
          <div style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.subtle, fontSize: 11.5, color: colors.ink, wordBreak: 'break-all', marginBottom: 12 }}>
            {url}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={salin} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Icon path="M8 8h11v11H8z M5 16V5h11" size={14} width={2} stroke={colors.white} />
              {tersalin ? 'Tersalin!' : 'Salin Link'}
            </button>
            <button onClick={buat} disabled={sibuk} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.ink, fontSize: 13, fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer' }}>
              {sibuk ? 'Memproses…' : 'Ganti Link'}
            </button>
          </div>
        </>
      ) : (
        <button onClick={buat} disabled={sibuk} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: sibuk ? 'wait' : 'pointer' }}>
          {sibuk ? 'Membuat…' : 'Buat Link'}
        </button>
      )}

      {galat && <span style={{ display: 'block', fontSize: 12, color: colors.danger, fontWeight: 600, marginTop: 10 }}>{galat}</span>}
    </Card>
  );
}
