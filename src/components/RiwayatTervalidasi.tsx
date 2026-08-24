'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadWithAuth } from '@/lib/download';
import { fetchRiwayatTervalidasi } from '@/lib/firestore/data';
import { colors } from '@/lib/theme';
import { Card } from '@/components/ui';
import { PaginationBar, TableSearch, usePagination } from '@/components/table-tools';
import type { RiwayatLaporanPeriode } from '@/lib/types';

/**
 * Riwayat laporan periode yang sudah disahkan Wakil Dekan I — dipakai di
 * dashboard dosen PA (miliknya sendiri) dan dashboard Wakil Dekan I (semua
 * dosen). Berbeda dari "Arsip periode terkunci" di halaman Ekspor, yang
 * menyaring periode ber-status 'dikunci': pengesahan per dosen bisa terjadi
 * jauh sebelum periodenya ditutup, dan itulah yang ingin dilihat di sini.
 *
 * `dosenUid` WAJIB diisi untuk peran dosen — Security Rules hanya mengizinkan
 * dosen membaca submission miliknya sendiri.
 */
export function RiwayatTervalidasi({ dosenUid }: { dosenUid?: string }) {
  const [rows, setRows] = useState<RiwayatLaporanPeriode[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchRiwayatTervalidasi(dosenUid ? { dosenUid } : undefined));
      setErr('');
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memuat riwayat laporan.');
    } finally {
      setLoading(false);
    }
  }, [dosenUid]);

  useEffect(() => {
    muat();
  }, [muat]);

  const needle = q.trim().toLowerCase();
  const tersaring = rows.filter(
    (r) => !needle || r.periodeLabel.toLowerCase().includes(needle) || r.dosenNama.toLowerCase().includes(needle)
  );
  const p = usePagination(tersaring, 10);

  async function unduh(r: RiwayatLaporanPeriode) {
    const key = `${r.periodeId}_${r.dosenUid}`;
    if (busy) return;
    setBusy(key);
    setErr('');
    try {
      await downloadWithAuth(
        `/api/export/pdf?dosen=${encodeURIComponent(r.dosenNama)}&periodeId=${encodeURIComponent(r.periodeId)}`,
        `Laporan_PA_${r.dosenNama.replace(/[^a-zA-Z0-9]+/g, '_')}_${r.periodeId}.pdf`
      );
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal mengunduh.');
    } finally {
      setBusy('');
    }
  }

  const tglSingkat = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, flex: 1 }}>
          Riwayat Laporan Tervalidasi
        </span>
        {rows.length > 5 && (
          <TableSearch value={q} onChange={setQ} placeholder={dosenUid ? 'Cari periode…' : 'Cari dosen / periode…'} />
        )}
      </div>
      <span style={{ fontSize: 12, color: colors.muted, lineHeight: 1.6, display: 'block', marginBottom: 12 }}>
        Laporan periode yang sudah disahkan Wakil Dekan I. Berkas PDF-nya memuat tanda tangan
        elektronik dosen PA dan Wakil Dekan I, dan dapat diunduh ulang kapan pun sebagai bukti mutu.
      </span>

      {err && (
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.danger, display: 'block', marginBottom: 10 }}>{err}</span>
      )}
      {loading && <span style={{ fontSize: 12.5, color: colors.faint }}>Memuat riwayat…</span>}
      {!loading && rows.length === 0 && (
        <span style={{ fontSize: 12.5, color: colors.faint }}>
          Belum ada laporan periode yang divalidasi Wakil Dekan I.
        </span>
      )}

      {!loading &&
        p.pageRows.map((r) => (
          <div
            key={`${r.periodeId}_${r.dosenUid}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: `1px solid ${colors.rowBorder}`, flexWrap: 'wrap' }}
          >
            <div style={{ minWidth: 190, flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink, display: 'block' }}>
                {r.periodeLabel}
              </span>
              <span style={{ fontSize: 11.5, color: colors.faint }}>
                {dosenUid ? `${r.jumlah} mahasiswa` : `${r.dosenNama} · ${r.jumlah} mahasiswa`}
                {' · disahkan '}
                {tglSingkat(r.ttdWadek?.waktu)}
              </span>
            </div>
            <button
              onClick={() => unduh(r)}
              disabled={!!busy}
              style={{ fontSize: 12.5, fontWeight: 700, color: colors.green, background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', padding: 0 }}
            >
              {busy === `${r.periodeId}_${r.dosenUid}` ? 'Menyiapkan…' : 'Unduh PDF ↓'}
            </button>
          </div>
        ))}

      {!loading && tersaring.length > 10 && <PaginationBar p={p} itemLabel="laporan" />}
    </Card>
  );
}
