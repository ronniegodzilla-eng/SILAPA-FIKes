'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';
import { colors } from '@/lib/theme';
import { Card, inputStyle, labelStyle } from '@/components/ui';
import { TautanKuesionerCard } from '@/components/TautanKuesionerCard';
import {
  aktifkanKuesioner,
  fetchAktivasi,
  fetchKuesionerBank,
  hapusAktivasi,
  ubahStatusAktivasi,
} from '@/lib/firestore/kuesioner';
import type { AktivasiKuesioner, Kuesioner, StatusAktivasi } from '@/lib/types';

const STATUS_LABEL: Record<StatusAktivasi, string> = {
  terjadwal: 'Terjadwal',
  terbuka: 'Terbuka',
  ditutup: 'Ditutup',
};

export default function PengaktifanPage() {
  const { appUser } = useAuth();
  const { periode } = useData();
  const [bank, setBank] = useState<Kuesioner[]>([]);
  const [aktivasi, setAktivasi] = useState<AktivasiKuesioner[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [pilih, setPilih] = useState('');
  const [wajib, setWajib] = useState(true);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    if (!periode) return;
    setMemuat(true);
    try {
      const [b, a] = await Promise.all([fetchKuesionerBank(), fetchAktivasi(periode.id)]);
      setBank(b);
      setAktivasi(a);
      setGalat('');
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal memuat data.');
    } finally {
      setMemuat(false);
    }
  }, [periode]);

  useEffect(() => {
    muat();
  }, [muat]);

  const sudahAktif = new Set(aktivasi.map((a) => a.kuesionerId));
  const siap = bank.filter((k) => k.status === 'siap' && !sudahAktif.has(k.id));

  async function aktifkan() {
    const k = bank.find((x) => x.id === pilih);
    if (!k || !periode || !appUser || sibuk) return;
    setSibuk(true);
    setGalat('');
    try {
      await aktifkanKuesioner(k, periode.id, { wajib, tutupAt: null, dibuatOleh: appUser.uid });
      setPilih('');
      await muat();
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal mengaktifkan instrumen.');
    } finally {
      setSibuk(false);
    }
  }

  async function ubah(a: AktivasiKuesioner, status: StatusAktivasi) {
    if (status === 'ditutup' && !window.confirm(`Tutup "${a.judul}"? Mahasiswa tidak bisa mengisi lagi setelah ini.`)) return;
    try {
      await ubahStatusAktivasi(a.id, status);
      await muat();
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal mengubah status.');
    }
  }

  async function hapus(a: AktivasiKuesioner) {
    if (!window.confirm(`Hapus pengaktifan "${a.judul}"?\n\nJawaban yang sudah masuk TIDAK ikut terhapus, tapi kuesionernya hilang dari daftar. Bila hanya ingin menghentikan pengisian, pakai "Tutup".`)) return;
    try {
      await hapusAktivasi(a.id);
      await muat();
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal menghapus pengaktifan.');
    }
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 940 }}>
      {!periode && (
        <Card padding="16px 20px">
          <span style={{ fontSize: 13, color: colors.amber, fontWeight: 600 }}>
            Belum ada periode aktif — kuesioner belum bisa diaktifkan.
          </span>
        </Card>
      )}

      {galat && <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.danger }}>{galat}</span>}

      <Card>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Aktifkan instrumen</span>
        <span style={{ display: 'block', fontSize: 12, color: colors.faint, marginTop: 4, marginBottom: 14, lineHeight: 1.55 }}>
          Hanya instrumen bertanda <strong>Siap</strong> di Bank Kuesioner yang muncul di sini.
          Pertanyaannya disalin saat diaktifkan, sehingga instrumen di bank tetap bebas disunting
          untuk pemakaian berikutnya.
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Instrumen</label>
            <select value={pilih} onChange={(e) => setPilih(e.target.value)} style={inputStyle} disabled={!periode || siap.length === 0}>
              <option value="">{siap.length === 0 ? 'Tidak ada instrumen siap' : 'Pilih instrumen…'}</option>
              {siap.map((k) => <option key={k.id} value={k.id}>{k.judul}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sifat pengisian</label>
            <select value={wajib ? 'wajib' : 'sukarela'} onChange={(e) => setWajib(e.target.value === 'wajib')} style={inputStyle}>
              <option value="wajib">Wajib</option>
              <option value="sukarela">Sukarela</option>
            </select>
          </div>
          <button
            onClick={aktifkan}
            disabled={!pilih || sibuk}
            style={{ padding: '11px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: !pilih || sibuk ? 'not-allowed' : 'pointer', opacity: !pilih ? 0.55 : 1 }}
          >
            {sibuk ? 'Memproses…' : 'Aktifkan'}
          </button>
        </div>
      </Card>

      <Card padding="0">
        <div style={{ padding: '16px 20px 10px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>
            Berjalan pada periode ini{periode ? ` — ${periode.tahunAkademik} ${periode.semester}` : ''}
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.subtle }}>
              <th style={TH}>Instrumen</th>
              <th style={TH}>Topik</th>
              <th style={{ ...TH, textAlign: 'right' }}>Pertanyaan</th>
              <th style={TH}>Sifat</th>
              <th style={TH}>Status</th>
              <th style={TH}></th>
            </tr>
          </thead>
          <tbody>
            {memuat ? (
              <tr><td colSpan={6} style={{ padding: 18, fontSize: 12.5, color: colors.faint }}>Memuat…</td></tr>
            ) : aktivasi.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 18, fontSize: 12.5, color: colors.faint }}>Belum ada kuesioner yang diaktifkan pada periode ini.</td></tr>
            ) : (
              aktivasi.map((a) => (
                <tr key={a.id} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: colors.ink }}>{a.judul}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12.5, color: colors.muted }}>
                    {a.topik}
                    {a.kerahasiaan === 'ketat' && (
                      <span title="Menilai perorangan — hasil tertutup bagi yang dinilai sampai pengisian ditutup" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: colors.danger }}>
                        KETAT
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 12.5, color: colors.muted, textAlign: 'right' }}>{a.pertanyaan.length}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12.5, color: a.wajib ? colors.ink : colors.muted, fontWeight: a.wajib ? 700 : 400 }}>
                    {a.wajib ? 'Wajib' : 'Sukarela'}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 11px', color: a.status === 'terbuka' ? colors.green : colors.muted, background: a.status === 'terbuka' ? '#E5F3EA' : colors.subtle }}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {a.status === 'terbuka' ? (
                      <button onClick={() => ubah(a, 'ditutup')} style={tombol}>Tutup</button>
                    ) : (
                      <button onClick={() => ubah(a, 'terbuka')} style={tombol}>Buka lagi</button>
                    )}{' '}
                    <button onClick={() => hapus(a)} style={{ ...tombol, color: colors.danger }}>Hapus</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <TautanKuesionerCard />
    </div>
  );
}

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '11px 16px', fontSize: 11.5, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3,
};

const tombol: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 7, border: `1px solid ${colors.border}`,
  background: colors.surface, color: colors.ink, fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
