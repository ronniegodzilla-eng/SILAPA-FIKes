'use client';

import { useEffect, useState } from 'react';
import { useData } from '@/lib/data-context';
import { RiwayatTervalidasi } from '@/components/RiwayatTervalidasi';
import { useAuth } from '@/lib/auth-context';
import { useViewportWidth } from '@/lib/use-viewport';
import { computeDosenStats, computeDosenRekap } from '@/lib/compute';
import { downloadWithAuth, apiFetch } from '@/lib/download';
import { colors } from '@/lib/theme';
import { Card, Icon } from '@/components/ui';
import { FeatureTour, type TourStep } from '@/components/FeatureTour';

const DOSEN_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="dosen-kpi"]',
    title: 'Ringkasan kelengkapan',
    body: 'Empat kartu ini menunjukkan status pengisian laporan mahasiswa bimbingan Anda: Total, Lengkap, Sebagian, dan Kosong.',
  },
  {
    target: '[data-tour="dosen-rekap"]',
    title: 'Rekap otomatis pribadi',
    body: 'Semua angka di sini dihitung otomatis dari data yang sudah Anda isi — IPK rata-rata, organisasi, beasiswa, prestasi, dan mahasiswa yang perlu perhatian.',
  },
  {
    target: 'a[href="/dosen/bimbingan"]',
    title: 'Daftar Bimbingan',
    body: 'Klik menu ini untuk melihat seluruh mahasiswa bimbingan Anda, mengisi laporan satu per satu, atau mengimpor data dari Excel.',
  },
  {
    target: '[data-tour="dosen-kirim"]',
    title: 'Kirim laporan semester',
    body: 'Setelah semua mahasiswa berstatus Lengkap, kirim laporan ke Wakil Dekan I di sini untuk diverifikasi.',
  },
  {
    target: '[data-tour="dosen-pdf"]',
    title: 'Unduh PDF laporan',
    body: 'Unduh laporan resmi (kop surat, tanda tangan, QR verifikasi) kapan saja — bisa dicetak atau diarsipkan.',
  },
];

export default function DosenDashboardPage() {
  const { recordList, submitDosenLaporan, dosenRoster } = useData();
  const { appUser } = useAuth();
  const width = useViewportWidth();
  const isNarrow = width < 880;
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [toast, setToast] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState('');

  // Pengunduran diri yang sudah disahkan Wakil Dekan I mengeluarkan mahasiswa
  // dari bimbingan aktif — sama seperti di Daftar Bimbingan dan di hitungan
  // per-dosen pada data layer. Tanpa saringan ini dashboard menghitung
  // mahasiswa yang sudah bukan bimbingan lagi: satu record "kosong" yang tak
  // bisa dilengkapi karena orangnya tak muncul di daftar, dan tombol Kirim
  // Laporan ikut terkunci karenanya.
  const bimbinganAktif = recordList.filter((m) => !m.mengundurkanDiri);
  const stats = computeDosenStats(bimbinganAktif);
  const rekap = computeDosenRekap(bimbinganAktif);
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
      <div data-tour="dosen-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16 }}>
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
        <div data-tour="dosen-rekap">
          <Card>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Rekap otomatis pribadi</span>
            <span style={{ display: 'block', fontSize: 12, color: colors.faint, marginBottom: 16 }}>
              Dihitung otomatis dari data yang sudah Anda isi — live
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
              {rekap.ipkPerProdi.length > 0 ? (
                // IP semester dan IPK ditampilkan sebagai dua kotak terpisah per
                // prodi, dengan n masing-masing. Satu angka gabungan pernah
                // membuat prodi tampak ber-rata-rata 0,00 padahal IPK-nya baik —
                // IP semesternya yang belum terisi, bukan prestasinya yang nol.
                rekap.ipkPerProdi.flatMap((p) => [
                  <RekapTile
                    key={`${p.prodi}-ip`}
                    label={`IP semester rata-rata ${p.prodi}`}
                    value={<span>{p.rataIp} <span style={{ fontSize: 12, fontWeight: 600, color: colors.faint }}>· n={p.nIp}</span></span>}
                  />,
                  <RekapTile
                    key={`${p.prodi}-ipk`}
                    label={`IPK rata-rata ${p.prodi}`}
                    value={<span>{p.rataIpk} <span style={{ fontSize: 12, fontWeight: 600, color: colors.faint }}>· n={p.nIpk}</span></span>}
                  />,
                ])
              ) : (
                <>
                  <RekapTile label="IP semester rata-rata bimbingan" value={rekap.ipRataStr} />
                  <RekapTile label="IPK rata-rata bimbingan" value={rekap.ipkRataStr} />
                </>
              )}
              <RekapTile label="Aktif organisasi" value={rekap.organisasi} />
              <RekapTile label="Penerima beasiswa" value={rekap.beasiswa} />
              <RekapTile label="Meraih prestasi" value={rekap.prestasi} />
              <RekapTile label="Cuti / non-aktif" value={rekap.cutiNonaktif} />
              <RekapTile label="Mahasiswa perlu perhatian" value={rekap.perhatian} valueColor={colors.danger} />
            </div>
          </Card>
        </div>

        <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div data-tour="dosen-kirim" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          </div>
          <button
            data-tour="dosen-pdf"
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

      <TokenIsiDataCard jumlahBimbingan={recordList.length} />

      <RiwayatTervalidasi dosenUid={appUser?.uid} />

      <FeatureTour steps={DOSEN_TOUR_STEPS} storageKey={`silapa_tour_dosen_${appUser?.uid ?? ''}`} />
    </div>
  );
}

/**
 * Link "Isi Data Mandiri" (§ token per dosen): satu link mewakili SELURUH
 * bimbingan dosen ini, dibagikan sebagai satu link di grup WhatsApp —
 * mahasiswa mengisi datanya sendiri tanpa akun. Membuat link baru langsung
 * mematikan link lama.
 */
function TokenIsiDataCard({ jumlahBimbingan }: { jumlahBimbingan: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch<{ token: string | null; url: string | null }>('/api/dosen/token')
      .then((r) => setUrl(r.url))
      .catch(() => setUrl(null))
      .finally(() => setLoading(false));
  }, []);

  async function buatLink() {
    if (busy) return;
    // Mengganti link akan MEMATIKAN link yang sudah beredar di grup WhatsApp.
    // Sebelumnya ini hanya satu ketukan pada tombol hijau tepat di bawah
    // "Salin Link" — dosen yang cuma ingin membagikan ulang linknya bisa
    // menekannya tanpa sadar, dan mahasiswa yang sedang mengisi langsung
    // terputus di tengah jalan.
    if (url) {
      const yakin = window.confirm(
        `Ganti link isi data mandiri?\n\nLink yang sudah Anda bagikan ke ${jumlahBimbingan} mahasiswa bimbingan akan LANGSUNG MATI, termasuk bagi yang sedang mengisi saat ini. Mereka harus Anda kirimi link baru.\n\nKalau Anda hanya ingin membagikan ulang, tutup pesan ini lalu tekan "Salin Link".`
      );
      if (!yakin) return;
    }
    setBusy(true);
    setErr('');
    setCopied(false);
    try {
      const r = await apiFetch<{ token: string; url: string }>('/api/dosen/token', { method: 'POST' });
      setUrl(r.url);
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal membuat link.');
    } finally {
      setBusy(false);
    }
  }

  async function salin() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Gagal menyalin — salin manual dari kotak di atas.');
    }
  }

  return (
    <Card>
      <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 4 }}>
        Link Isi Data Mandiri Mahasiswa
      </span>
      <span style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.5, display: 'block', marginBottom: 16 }}>
        Satu link ini mewakili SELURUH mahasiswa bimbingan Anda — bagikan ke grup WhatsApp bimbingan Anda.
        Mahasiswa membuka link, memilih namanya sendiri, dan mengisi datanya tanpa perlu akun. Nama, NPM, prodi,
        angkatan, dan kelas tetap terkunci (tidak bisa diubah lewat sini).
      </span>

      {loading ? (
        <span style={{ fontSize: 12.5, color: colors.faint }}>Memuat…</span>
      ) : (
        <>
          {url && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                readOnly
                value={url}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{ flex: 1, minWidth: 220, padding: '10px 12px', borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 12.5, color: colors.ink, background: colors.subtle }}
              />
              <button
                onClick={salin}
                style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 12.5, fontWeight: 700, color: colors.ink, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {copied ? '✓ Tersalin' : 'Salin Link'}
              </button>
            </div>
          )}
          {/* Saat link sudah ada, tombol ini bukan lagi aksi utama melainkan
              aksi berbahaya (mencabut link yang beredar) — jadi tampil sebagai
              tombol sekunder bergaris merah, bukan tombol hijau utama. */}
          <button
            onClick={buatLink}
            disabled={busy}
            style={
              url
                ? { padding: '9px 14px', borderRadius: 9, border: `1px solid ${colors.danger}`, background: colors.surface, color: colors.danger, fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }
                : { padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }
            }
          >
            {busy ? 'Membuat…' : url ? 'Ganti Link (link lama langsung mati)' : 'Buat Link'}
          </button>
          {url && (
            <span style={{ display: 'block', marginTop: 8, fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
              Untuk membagikan ulang, cukup tekan <b>Salin Link</b> — link yang sama tetap berlaku.
              Ganti link hanya bila linknya bocor ke luar grup bimbingan.
            </span>
          )}
          {err && <span style={{ display: 'block', marginTop: 10, fontSize: 12, color: colors.danger, fontWeight: 600 }}>{err}</span>}
        </>
      )}
    </Card>
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
