'use client';

import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useData } from '@/lib/data-context';
import { fetchPengunduranPending, type PengunduranPendingRow } from '@/lib/firestore/data';
import { colors, STATUS_LABEL } from '@/lib/theme';
import { Card, Icon } from '@/components/ui';

/**
 * W-Pengunduran: antrean validasi pengunduran diri mahasiswa (§ pengunduran
 * diri). Dosen PA / admin mengajukan; hanya Wakil Dekan I yang memutuskan.
 *
 * Keputusan dikirim ke /api/pengunduran/validasi — bukan ditulis langsung dari
 * sini — karena Security Rules memang tidak memberi peran wadek1 akses tulis ke
 * `laporan` maupun `mahasiswa`, dan satu keputusan harus mengubah tiga hal
 * sekaligus (status laporan, penanda di master, beban bimbingan dosen).
 */
export default function PengunduranPage() {
  const { periode, dosenRoster } = useData();
  const [rows, setRows] = useState<PengunduranPendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyNpm, setBusyNpm] = useState('');
  const [catatan, setCatatan] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  const namaDosen = new Map(dosenRoster.map((d) => [d.dosenUid, d.nama]));

  const muat = useCallback(async () => {
    if (!periode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchPengunduranPending(periode.id));
      setErr('');
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memuat antrean pengunduran diri.');
    } finally {
      setLoading(false);
    }
  }, [periode]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function putuskan(row: PengunduranPendingRow, keputusan: 'setuju' | 'tolak') {
    if (!periode || busyNpm) return;
    const alasanWadek = (catatan[row.npm] ?? '').trim();
    if (keputusan === 'tolak' && alasanWadek.length < 5) {
      setErr(`Isi dulu alasan penolakan untuk ${row.nama} (minimal 5 karakter).`);
      return;
    }
    setBusyNpm(row.npm);
    setErr('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/pengunduran/validasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          npm: row.npm,
          periodeId: periode.id,
          keputusan,
          catatan: alasanWadek,
        }),
      });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      setToast(
        keputusan === 'setuju'
          ? `${row.nama} disetujui mengundurkan diri — keluar dari daftar bimbingan ${namaDosen.get(row.dosenPaUid) ?? 'dosen PA'} dan statusnya kini non-aktif.`
          : `Pengajuan ${row.nama} ditolak — statusnya dikembalikan ke ${STATUS_LABEL[row.pengunduran.statusSebelum] ?? row.pengunduran.statusSebelum}.`
      );
      setRows((prev) => prev.filter((r) => r.npm !== row.npm));
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal mengirim keputusan.');
    } finally {
      setBusyNpm('');
    }
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 900 }}>
      <Card padding="18px 22px">
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 6 }}>
          Validasi pengunduran diri mahasiswa
        </span>
        <span style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.6, display: 'block' }}>
          Pengajuan datang dari dosen PA atau admin fakultas. <b>Setuju</b> mengeluarkan
          mahasiswa dari daftar bimbingan dosennya dan menjadikan datanya non-aktif —
          ia tidak akan dibuatkan laporan lagi pada periode berikutnya.{' '}
          <b>Tolak</b> mengembalikan statusnya persis seperti sebelum diajukan.
        </span>
      </Card>

      {toast && (
        <Card padding="13px 18px" style={{ background: colors.greenSoftBg, border: `1px solid ${colors.greenSoftBorder}` }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.green }}>✓ {toast}</span>
        </Card>
      )}
      {err && (
        <Card padding="13px 18px" style={{ background: '#FBEAE8', border: `1px solid ${colors.danger}` }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.danger }}>{err}</span>
        </Card>
      )}

      {loading && <span style={{ fontSize: 13, color: colors.muted }}>Memuat antrean…</span>}

      {!loading && rows.length === 0 && (
        <Card padding="28px 22px" style={{ textAlign: 'center' }}>
          <Icon path="M5 13l4 4L19 7" size={26} stroke={colors.green} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginTop: 10 }}>
            Tidak ada pengajuan yang menunggu validasi.
          </span>
          <span style={{ fontSize: 12, color: colors.muted, display: 'block', marginTop: 4 }}>
            Pengajuan baru dari dosen PA atau admin akan muncul di sini.
          </span>
        </Card>
      )}

      {rows.map((row) => (
        <Card key={row.npm} padding="20px 24px">
          <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 220 }}>
              <span style={{ fontFamily: "'Lora',serif", fontSize: 17, fontWeight: 700, color: colors.ink, display: 'block' }}>
                {row.nama}
              </span>
              <span style={{ fontSize: 12.5, color: colors.muted, display: 'block', marginTop: 3 }}>
                NPM {row.npm} · {row.prodi} · Angkatan {row.angkatan} · Semester {row.semesterKe}
              </span>
              <span style={{ fontSize: 12.5, color: colors.muted, display: 'block', marginTop: 3 }}>
                Dosen PA: {namaDosen.get(row.dosenPaUid) ?? '—'}
              </span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.amberText, background: colors.amberBg, padding: '4px 10px', borderRadius: 999 }}>
              Status sebelumnya: {STATUS_LABEL[row.pengunduran.statusSebelum] ?? row.pengunduran.statusSebelum}
            </span>
          </div>

          <div style={{ marginTop: 14, padding: '12px 14px', background: colors.subtle, borderRadius: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              Alasan dari {row.pengunduran.diajukanOlehNama}
            </span>
            <span style={{ fontSize: 13, color: colors.ink, lineHeight: 1.6 }}>{row.pengunduran.alasan}</span>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.muted, display: 'block', marginBottom: 6 }}>
              Catatan Wakil Dekan I <span style={{ fontWeight: 500 }}>(wajib bila menolak)</span>
            </label>
            <textarea
              value={catatan[row.npm] ?? ''}
              onChange={(e) => setCatatan((prev) => ({ ...prev, [row.npm]: e.target.value }))}
              rows={2}
              placeholder="mis. Surat pengunduran diri belum dilampirkan — minta dosen PA melengkapi dulu."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button
              onClick={() => putuskan(row, 'tolak')}
              disabled={busyNpm === row.npm}
              style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.danger}`, background: colors.surface, fontSize: 12.5, fontWeight: 700, color: colors.danger, cursor: busyNpm === row.npm ? 'not-allowed' : 'pointer' }}
            >
              Tolak
            </button>
            <button
              onClick={() => putuskan(row, 'setuju')}
              disabled={busyNpm === row.npm}
              style={{ padding: '10px 20px', borderRadius: 9, border: 'none', fontSize: 12.5, fontWeight: 700, color: colors.white, background: busyNpm === row.npm ? colors.disabled : colors.green, cursor: busyNpm === row.npm ? 'not-allowed' : 'pointer' }}
            >
              {busyNpm === row.npm ? 'Memproses…' : 'Setujui'}
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
