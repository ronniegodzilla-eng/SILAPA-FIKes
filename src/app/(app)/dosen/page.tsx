'use client';

import { useState } from 'react';
import { useData } from '@/lib/data-context';
import { useAuth } from '@/lib/auth-context';
import { useViewportWidth } from '@/lib/use-viewport';
import { computeDosenStats, computeDosenRekap } from '@/lib/compute';
import { downloadWithAuth } from '@/lib/download';
import { colors } from '@/lib/theme';
import { Card, Icon } from '@/components/ui';

export default function DosenDashboardPage() {
  const { recordList, submitDosenLaporan, dosenRoster } = useData();
  const { appUser } = useAuth();
  const width = useViewportWidth();
  const isNarrow = width < 880;
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [toast, setToast] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState('');

  const stats = computeDosenStats(recordList);
  const rekap = computeDosenRekap(recordList);
  const canSubmit = stats.allLengkap || confirmEmpty;
  const { periode } = useData();

  // For a dosen, the roster holds only their own submission.
  const ownSubmission = dosenRoster.find((d) => d.dosenUid === appUser?.uid);
  const dikembalikan = ownSubmission?.statusKirim === 'dikembalikan';

  async function submit() {
    if (!canSubmit || !appUser) return;
    await submitDosenLaporan(appUser.nama);
    setToast(true);
  }

  // PRD §3: dosen dapat mengunduh PDF laporannya sendiri.
  async function unduhPdfSaya() {
    if (!appUser || pdfBusy) return;
    setPdfBusy(true);
    setPdfErr('');
    try {
      await downloadWithAuth(
        `/api/export/pdf?dosen=${encodeURIComponent(appUser.nama)}${periode ? `&periodeId=${periode.id}` : ''}`,
        `Laporan_PA_${appUser.nama.replace(/[^a-zA-Z0-9]+/g, '_')}_${periode?.id ?? ''}.pdf`
      );
    } catch (e: any) {
      setPdfErr(e?.message ?? 'Gagal mengunduh PDF.');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {dikembalikan && (
        <div style={{ background: colors.dangerBg, border: `1px solid ${colors.dangerBorder}`, borderRadius: 14, padding: '16px 20px' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.danger, display: 'block', marginBottom: 4 }}>
            ⚠ Laporan Anda dikembalikan oleh Wakil Dekan I — mohon direvisi lalu kirim ulang.
          </span>
          {ownSubmission?.catatanWadek && (
            <span style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.5 }}>
              Catatan: {ownSubmission.catatanWadek}
            </span>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16 }}>
        <KpiCard label="Total Bimbingan" value={stats.total} hint="mahasiswa aktif periode ini" color={colors.ink} />
        <KpiCard label="Lengkap" value={stats.lengkap} hint="siap dikirim" color={colors.green} />
        <KpiCard label="Sebagian" value={stats.sebagian} hint="perlu dilengkapi" color={colors.amber} />
        <KpiCard label="Kosong" value={stats.kosong} hint="belum diisi" color={colors.danger} />
      </div>

      {/* progress bar */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Progres pengisian laporan</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.green }}>{stats.percent}%</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: colors.track, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#0B6E3C,#3E9A64)', width: `${stats.percent}%` }} />
        </div>
      </Card>

      {/* rekap + submit */}
      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '2fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Rekap otomatis pribadi</span>
          <span style={{ display: 'block', fontSize: 12, color: colors.faint, marginBottom: 16 }}>
            Dihitung otomatis dari data yang sudah Anda isi — live
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
            <RekapTile label="IPK rata-rata bimbingan" value={rekap.ipkRataStr} />
            <RekapTile label="Aktif organisasi" value={rekap.organisasi} />
            <RekapTile label="Penerima beasiswa" value={rekap.beasiswa} />
            <RekapTile label="Meraih prestasi" value={rekap.prestasi} />
            <RekapTile label="Cuti / non-aktif" value={rekap.cutiNonaktif} />
            <RekapTile label="Mahasiswa perlu perhatian" value={rekap.perhatian} valueColor={colors.danger} />
          </div>
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Kirim laporan semester</span>
          <span style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.5 }}>
            Tombol aktif jika seluruh mahasiswa berstatus lengkap, atau Anda mengonfirmasi record yang sengaja dikosongkan.
          </span>
          {!stats.allLengkap && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: colors.ink, background: colors.warnBannerBg, border: `1px solid ${colors.warnBannerBorder}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmEmpty} onChange={(e) => setConfirmEmpty(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                Saya konfirmasi {stats.notLengkap} record yang belum lengkap sudah sesuai kondisi mahasiswa (sudah diberi catatan).
              </span>
            </label>
          )}
          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{ padding: 13, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, color: colors.white, background: canSubmit ? colors.green : colors.disabled, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
          >
            {stats.allLengkap ? 'Kirim Laporan' : `Kirim Laporan (${stats.notLengkap} belum lengkap)`}
          </button>
          {toast && (
            <span style={{ fontSize: 12, color: colors.green, fontWeight: 700 }}>
              ✓ Laporan berhasil dikirim ke Wakil Dekan I.
            </span>
          )}
          <button
            onClick={unduhPdfSaya}
            disabled={pdfBusy}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 11, borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            <Icon path="M12 4v12 M7 11l5 5 5-5 M4 20h16" size={15} />
            {pdfBusy ? 'Menyiapkan…' : 'Unduh PDF Laporan Saya'}
          </button>
          {pdfErr && <span style={{ fontSize: 12, color: colors.danger, fontWeight: 600 }}>{pdfErr}</span>}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint, color }: { label: string; value: number; hint: string; color: string }) {
  return (
    <Card padding="20px">
      <span style={{ fontSize: 12, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <div style={{ fontFamily: "'Lora',serif", fontSize: 32, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
      <span style={{ fontSize: 12, color: colors.faint }}>{hint}</span>
    </Card>
  );
}

function RekapTile({ label, value, valueColor = colors.ink }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div style={{ background: colors.subtle, borderRadius: 10, padding: 14 }}>
      <span style={{ fontSize: 11.5, color: colors.muted, fontWeight: 600 }}>{label}</span>
      <div style={{ fontSize: 20, fontWeight: 800, color: valueColor, marginTop: 4 }}>{value}</div>
    </div>
  );
}
