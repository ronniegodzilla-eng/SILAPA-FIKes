'use client';

import { useCallback, useEffect, useState } from 'react';
import { useData } from '@/lib/data-context';
import { apiFetch, downloadWithAuth } from '@/lib/download';
import { colors } from '@/lib/theme';
import { Card, Icon } from '@/components/ui';
import { fetchAktivasi } from '@/lib/firestore/kuesioner';
import {
  BatangDistribusi,
  HasilPertanyaanList,
  RingkasPengisian,
  type RekapKuesioner,
} from '@/components/KuesionerHasil';
import type { AktivasiKuesioner } from '@/lib/types';

type Dim = 'dosen' | 'prodi' | 'semester';
const DIM_LABEL: Record<Dim, string> = {
  dosen: 'Dosen PA',
  prodi: 'Program studi',
  semester: 'Semester',
};

export default function DashboardEvaluasiPage() {
  const { periode } = useData();
  const [daftar, setDaftar] = useState<AktivasiKuesioner[]>([]);
  const [pilih, setPilih] = useState('');
  const [rekap, setRekap] = useState<RekapKuesioner | null>(null);
  const [dim, setDim] = useState<Dim>('prodi');
  const [memuat, setMemuat] = useState(true);
  const [memuatRekap, setMemuatRekap] = useState(false);
  const [galat, setGalat] = useState('');
  const [unduh, setUnduh] = useState(false);

  useEffect(() => {
    if (!periode) return;
    fetchAktivasi(periode.id)
      .then((a) => {
        setDaftar(a);
        if (a.length > 0) setPilih((p) => p || a[0].id);
      })
      .catch((e) => setGalat(e?.message ?? 'Gagal memuat daftar kuesioner.'))
      .finally(() => setMemuat(false));
  }, [periode]);

  const muatRekap = useCallback(async (id: string) => {
    setMemuatRekap(true);
    setGalat('');
    try {
      setRekap(await apiFetch<RekapKuesioner>(`/api/evaluasi/rekap?aktivasiId=${encodeURIComponent(id)}`));
    } catch (e: any) {
      setRekap(null);
      setGalat(e?.message ?? 'Gagal memuat rekap.');
    } finally {
      setMemuatRekap(false);
    }
  }, []);

  useEffect(() => {
    if (pilih) muatRekap(pilih);
  }, [pilih, muatRekap]);

  async function ekspor() {
    if (!pilih || unduh) return;
    setUnduh(true);
    try {
      await downloadWithAuth(
        `/api/evaluasi/ekspor?aktivasiId=${encodeURIComponent(pilih)}`,
        `Hasil Kuesioner — ${rekap?.aktivasi.judul ?? pilih}.xlsx`
      );
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal mengunduh hasil.');
    } finally {
      setUnduh(false);
    }
  }

  if (memuat) {
    return <span style={{ fontSize: 13, color: colors.faint }}>Memuat…</span>;
  }

  if (daftar.length === 0) {
    return (
      <Card padding="22px 24px">
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>Belum ada kuesioner berjalan</span>
        <span style={{ display: 'block', fontSize: 12.5, color: colors.muted, marginTop: 6, lineHeight: 1.55 }}>
          Susun instrumen di <strong>Bank Kuesioner</strong>, tandai siap, lalu aktifkan lewat menu
          <strong> Pengaktifan</strong>. Hasilnya akan muncul di halaman ini begitu jawaban masuk.
        </span>
      </Card>
    );
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 940 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={pilih}
          onChange={(e) => setPilih(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: '10px 12px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13.5, background: colors.surface, color: colors.ink }}
        >
          {daftar.map((a) => (
            <option key={a.id} value={a.id}>
              {a.judul} {a.status === 'ditutup' ? '(ditutup)' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={ekspor}
          disabled={unduh || !rekap}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.ink, fontSize: 13, fontWeight: 700, cursor: unduh ? 'wait' : 'pointer' }}
        >
          <Icon path="M12 3v12 M7 10l5 5 5-5 M4 21h16" size={15} width={2} />
          {unduh ? 'Menyiapkan…' : 'Ekspor Excel'}
        </button>
      </div>

      {galat && <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.danger, lineHeight: 1.5 }}>{galat}</span>}

      {memuatRekap ? (
        <span style={{ fontSize: 13, color: colors.faint }}>Menghitung rekap…</span>
      ) : rekap ? (
        <>
          <RingkasPengisian r={rekap} />

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Distribusi responden</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(Object.keys(DIM_LABEL) as Dim[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDim(d)}
                    style={{
                      padding: '7px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${dim === d ? colors.green : colors.border}`,
                      background: dim === d ? colors.green : colors.surface,
                      color: dim === d ? colors.white : colors.ink,
                    }}
                  >
                    {DIM_LABEL[d]}
                  </button>
                ))}
              </div>
            </div>
            <BatangDistribusi baris={rekap.distribusi[dim]} />
          </Card>

          <Card>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Hasil per pertanyaan</span>
            <span style={{ display: 'block', fontSize: 12, color: colors.faint, marginTop: 4, marginBottom: 6, lineHeight: 1.55 }}>
              Pertanyaan berskala diurut dari rata-rata terendah — yang paling perlu ditindaklanjuti
              berada di atas.
            </span>
            <HasilPertanyaanList hasil={rekap.hasil} minResponden={rekap.minResponden} sebabDitahan={rekap.hasilDitahan} />
          </Card>
        </>
      ) : null}
    </div>
  );
}
