'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/data-context';
import { apiFetch } from '@/lib/download';
import { colors } from '@/lib/theme';
import { Card } from '@/components/ui';
import { fetchAktivasi } from '@/lib/firestore/kuesioner';
import {
  BatangDistribusi,
  HasilPertanyaanList,
  RingkasPengisian,
  type RekapKuesioner,
} from '@/components/KuesionerHasil';
import type { AktivasiKuesioner } from '@/lib/types';

/**
 * Kuesioner dari sisi dosen PA — lingkup bimbingannya sendiri.
 *
 * Dua hal yang dibutuhkan dosen dan sengaja dipisah sumbernya:
 *
 *   KEPATUHAN — siapa yang belum mengisi, supaya bisa dikejar. Datang dari
 *   penanda pada dokumen laporan yang memang sudah boleh ia baca, dan SELALU
 *   terlihat, termasuk untuk instrumen bertingkat ketat yang masih terbuka.
 *
 *   HASIL — apa jawabannya. Untuk instrumen ketat baru terbuka setelah
 *   pengisian ditutup, dan selalu berupa agregat, tidak pernah per orang.
 *
 * Tanpa pemisahan itu dosen tidak bisa mengejar yang belum mengisi — padahal
 * justru dialah yang paling mungkin melakukannya.
 */
export default function KuesionerDosenPage() {
  const router = useRouter();
  const { periode, recordList } = useData();
  const [daftar, setDaftar] = useState<AktivasiKuesioner[]>([]);
  const [pilih, setPilih] = useState('');
  const [rekap, setRekap] = useState<RekapKuesioner | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [memuatRekap, setMemuatRekap] = useState(false);
  const [galat, setGalat] = useState('');

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

  if (memuat) return <span style={{ fontSize: 13, color: colors.faint }}>Memuat…</span>;

  if (daftar.length === 0) {
    return (
      <Card padding="22px 24px">
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>Belum ada kuesioner berjalan</span>
        <span style={{ display: 'block', fontSize: 12.5, color: colors.muted, marginTop: 6, lineHeight: 1.55 }}>
          Tim evaluasi belum mengaktifkan kuesioner apa pun pada periode ini.
        </span>
      </Card>
    );
  }

  // Nama yang belum mengisi — diambil dari penanda pada laporan bimbingan
  // sendiri, bukan dari koleksi jawaban yang memang tertutup bagi dosen.
  const belum = pilih
    ? recordList.filter((m) => !m.mengundurkanDiri && !m.kuesionerTerisi.includes(pilih))
    : [];

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 940 }}>
      <select
        value={pilih}
        onChange={(e) => setPilih(e.target.value)}
        style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13.5, background: colors.surface, color: colors.ink }}
      >
        {daftar.map((a) => (
          <option key={a.id} value={a.id}>
            {a.judul}{a.status === 'ditutup' ? ' (ditutup)' : ''}{a.wajib ? ' · wajib' : ''}
          </option>
        ))}
      </select>

      {galat && <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.danger, lineHeight: 1.5 }}>{galat}</span>}

      {memuatRekap ? (
        <span style={{ fontSize: 13, color: colors.faint }}>Menghitung…</span>
      ) : rekap ? (
        <>
          <RingkasPengisian r={rekap} />

          <Card padding="0">
            <div style={{ padding: '16px 20px 12px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>
                Belum mengisi — {belum.length} mahasiswa
              </span>
              <span style={{ display: 'block', fontSize: 12, color: colors.faint, marginTop: 4, lineHeight: 1.55 }}>
                Klik nama untuk membuka form laporannya. Jawaban mahasiswa tidak dapat Anda lihat
                per orang — yang tampil di sini hanya siapa yang sudah dan belum mengisi.
              </span>
            </div>
            {belum.length === 0 ? (
              <div style={{ padding: '4px 20px 18px' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.green }}>
                  Seluruh bimbingan Anda sudah mengisi.
                </span>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: colors.subtle }}>
                    <th style={{ ...TH, width: 140 }}>NPM</th>
                    <th style={TH}>Nama</th>
                    <th style={{ ...TH, width: 70 }}>Smt</th>
                    <th style={{ ...TH, width: 80 }}>Prodi</th>
                  </tr>
                </thead>
                <tbody>
                  {belum.map((m) => (
                    <tr
                      key={m.npm}
                      onClick={() => router.push(`/dosen/bimbingan/${m.npm}`)}
                      style={{ borderTop: `1px solid ${colors.rowBorder}`, cursor: 'pointer' }}
                    >
                      <td style={{ padding: '10px 20px', fontSize: 12.5, color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>{m.npm}</td>
                      <td style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, color: colors.ink }}>{m.nama}</td>
                      <td style={{ padding: '10px 20px', fontSize: 12.5, color: colors.muted }}>{m.semesterKe}</td>
                      <td style={{ padding: '10px 20px', fontSize: 12.5, color: colors.muted }}>{m.prodi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Hasil bimbingan Anda</span>
            <span style={{ display: 'block', fontSize: 12, color: colors.faint, marginTop: 4, marginBottom: 6, lineHeight: 1.55 }}>
              {rekap.hasilDitahan === 'belum_ditutup'
                ? 'Kuesioner ini menilai perorangan, jadi isi jawabannya baru terbuka setelah tim evaluasi menutup pengisian. Angka kepatuhan di atas tetap dapat Anda pantau sekarang.'
                : 'Selalu berupa angka gabungan — jawaban per mahasiswa tidak pernah ditampilkan.'}
            </span>
            <HasilPertanyaanList
              hasil={rekap.hasil}
              minResponden={rekap.minResponden}
              sebabDitahan={rekap.hasilDitahan}
            />
          </Card>

          <Card>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Sebaran per semester</span>
            <div style={{ marginTop: 12 }}>
              <BatangDistribusi baris={rekap.distribusi.semester} />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '10px 20px', fontSize: 11.5, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3,
};
