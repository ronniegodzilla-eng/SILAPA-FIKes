'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { colors } from '@/lib/theme';
import { Card, Icon, inputStyle, labelStyle } from '@/components/ui';
import {
  fetchKuesionerBank,
  hapusKuesioner,
  simpanKuesioner,
} from '@/lib/firestore/kuesioner';
import type {
  JenisPertanyaan,
  Kuesioner,
  PertanyaanKuesioner,
  SasaranKuesioner,
} from '@/lib/types';

const SASARAN_LABEL: Record<SasaranKuesioner, string> = {
  dosen_pa: 'Menilai dosen PA',
  fakultas: 'Menilai layanan fakultas',
  lainnya: 'Lainnya',
};

const JENIS_LABEL: Record<JenisPertanyaan, string> = {
  skala: 'Skala',
  pilihan: 'Pilihan',
  teks: 'Isian bebas',
};

/** Id acak pendek — cukup untuk membedakan pertanyaan dalam satu instrumen. */
const idBaru = () => Math.random().toString(36).slice(2, 10);

function kuesionerKosong(uid: string, nama: string): Kuesioner {
  return {
    id: idBaru(),
    judul: '',
    deskripsi: '',
    sasaran: 'dosen_pa',
    pertanyaan: [],
    status: 'draft',
    dibuatOleh: uid,
    dibuatOlehNama: nama,
  };
}

export default function BankKuesionerPage() {
  const { appUser } = useAuth();
  const [daftar, setDaftar] = useState<Kuesioner[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [draf, setDraf] = useState<Kuesioner | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      setDaftar(await fetchKuesionerBank());
      setGalat('');
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal memuat bank kuesioner.');
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  async function simpan() {
    if (!draf || menyimpan) return;
    if (!draf.judul.trim()) {
      setGalat('Judul instrumen wajib diisi.');
      return;
    }
    if (draf.status === 'siap' && draf.pertanyaan.length === 0) {
      setGalat('Instrumen tanpa pertanyaan tidak bisa ditandai siap.');
      return;
    }
    setMenyimpan(true);
    try {
      await simpanKuesioner(draf);
      setDraf(null);
      await muat();
      setGalat('');
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal menyimpan instrumen.');
    } finally {
      setMenyimpan(false);
    }
  }

  async function hapus(k: Kuesioner) {
    if (!window.confirm(`Hapus instrumen "${k.judul}" dari bank? Aktivasi yang sudah berjalan tidak ikut terhapus.`)) return;
    try {
      await hapusKuesioner(k.id);
      await muat();
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal menghapus instrumen.');
    }
  }

  const ubah = (patch: Partial<Kuesioner>) => setDraf((d) => (d ? { ...d, ...patch } : d));
  const ubahPertanyaan = (id: string, patch: Partial<PertanyaanKuesioner>) =>
    setDraf((d) =>
      d ? { ...d, pertanyaan: d.pertanyaan.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : d
    );

  function tambahPertanyaan(jenis: JenisPertanyaan) {
    setDraf((d) =>
      d
        ? {
            ...d,
            pertanyaan: [
              ...d.pertanyaan,
              {
                id: idBaru(),
                teks: '',
                jenis,
                wajib: true,
                ...(jenis === 'skala' ? { skalaMaks: 5, labelMin: 'Sangat kurang', labelMaks: 'Sangat baik' } : {}),
                ...(jenis === 'pilihan' ? { opsi: ['', ''] } : {}),
              },
            ],
          }
        : d
    );
  }

  function pindah(id: string, arah: -1 | 1) {
    setDraf((d) => {
      if (!d) return d;
      const i = d.pertanyaan.findIndex((p) => p.id === id);
      const j = i + arah;
      if (i < 0 || j < 0 || j >= d.pertanyaan.length) return d;
      const next = [...d.pertanyaan];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, pertanyaan: next };
    });
  }

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 940 }}>
      <Card padding="16px 20px">
        <span style={{ fontSize: 13, color: colors.muted, lineHeight: 1.55 }}>
          Instrumen disusun sekali di sini lalu diaktifkan kapan pun dibutuhkan lewat menu
          Pengaktifan. Menyunting instrumen di bank <strong>tidak mengubah</strong> kuesioner yang
          sudah berjalan — pertanyaannya disalin saat diaktifkan, sehingga jawaban yang sudah
          terkumpul tetap cocok dengan pertanyaan yang dulu dilihat mahasiswa.
        </span>
      </Card>

      {galat && (
        <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.danger }}>{galat}</span>
      )}

      {!draf && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setDraf(kuesionerKosong(appUser?.uid ?? '', appUser?.nama ?? ''))}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            <Icon path="M12 5v14 M5 12h14" size={15} width={2} />
            Instrumen Baru
          </button>
        </div>
      )}

      {draf && (
        <Card>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>
            {daftar.some((k) => k.id === draf.id) ? 'Sunting Instrumen' : 'Instrumen Baru'}
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginTop: 14 }}>
            <div>
              <label style={labelStyle}>Judul instrumen</label>
              <input value={draf.judul} onChange={(e) => ubah({ judul: e.target.value })} style={inputStyle} placeholder="mis. Evaluasi Pembimbingan Akademik" />
            </div>
            <div>
              <label style={labelStyle}>Yang dinilai</label>
              <select value={draf.sasaran} onChange={(e) => ubah({ sasaran: e.target.value as SasaranKuesioner })} style={inputStyle}>
                {(Object.keys(SASARAN_LABEL) as SasaranKuesioner[]).map((s) => (
                  <option key={s} value={s}>{SASARAN_LABEL[s]}</option>
                ))}
              </select>
              <span style={{ display: 'block', fontSize: 11, color: colors.faint, marginTop: 4, lineHeight: 1.45 }}>
                {draf.sasaran === 'dosen_pa'
                  ? 'Jawaban tidak akan pernah bisa dibaca dosen PA; ia hanya melihat angka agregat bimbingannya setelah kuesioner ditutup.'
                  : 'Hasilnya boleh dilihat lebih terbuka karena tidak menilai perorangan.'}
              </span>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Pengantar untuk mahasiswa (opsional)</label>
            <textarea value={draf.deskripsi} onChange={(e) => ubah({ deskripsi: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>
              Pertanyaan ({draf.pertanyaan.length})
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.keys(JENIS_LABEL) as JenisPertanyaan[]).map((j) => (
                <button key={j} onClick={() => tambahPertanyaan(j)} style={{ padding: '8px 13px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 12.5, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>
                  + {JENIS_LABEL[j]}
                </button>
              ))}
            </div>
          </div>

          {draf.pertanyaan.length === 0 ? (
            <span style={{ display: 'block', fontSize: 12.5, color: colors.faint, marginTop: 12 }}>
              Belum ada pertanyaan. Tambahkan lewat tombol di atas.
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {draf.pertanyaan.map((p, i) => (
                <div key={p.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 11, padding: 14, background: colors.subtle }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: colors.muted }}>{i + 1}.</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.green, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '3px 10px' }}>
                      {JENIS_LABEL[p.jenis]}
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.muted }}>
                      <input type="checkbox" checked={p.wajib} onChange={(e) => ubahPertanyaan(p.id, { wajib: e.target.checked })} />
                      Wajib dijawab
                    </label>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button onClick={() => pindah(p.id, -1)} disabled={i === 0} title="Naikkan" style={tombolKecil(i === 0)}>↑</button>
                      <button onClick={() => pindah(p.id, 1)} disabled={i === draf.pertanyaan.length - 1} title="Turunkan" style={tombolKecil(i === draf.pertanyaan.length - 1)}>↓</button>
                      <button
                        onClick={() => setDraf((d) => (d ? { ...d, pertanyaan: d.pertanyaan.filter((x) => x.id !== p.id) } : d))}
                        title="Hapus pertanyaan"
                        style={{ ...tombolKecil(false), color: colors.danger }}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <input value={p.teks} onChange={(e) => ubahPertanyaan(p.id, { teks: e.target.value })} placeholder="Tulis pertanyaannya…" style={{ ...inputStyle, background: colors.surface }} />

                  {p.jenis === 'skala' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 10 }}>
                      <div>
                        <label style={labelStyle}>Skala tertinggi</label>
                        <select value={p.skalaMaks ?? 5} onChange={(e) => ubahPertanyaan(p.id, { skalaMaks: Number(e.target.value) })} style={{ ...inputStyle, background: colors.surface }}>
                          {[4, 5, 6, 10].map((n) => <option key={n} value={n}>1 – {n}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Label nilai terendah</label>
                        <input value={p.labelMin ?? ''} onChange={(e) => ubahPertanyaan(p.id, { labelMin: e.target.value })} style={{ ...inputStyle, background: colors.surface }} />
                      </div>
                      <div>
                        <label style={labelStyle}>Label nilai tertinggi</label>
                        <input value={p.labelMaks ?? ''} onChange={(e) => ubahPertanyaan(p.id, { labelMaks: e.target.value })} style={{ ...inputStyle, background: colors.surface }} />
                      </div>
                    </div>
                  )}

                  {p.jenis === 'pilihan' && (
                    <div style={{ marginTop: 10 }}>
                      <label style={labelStyle}>Pilihan jawaban</label>
                      {(p.opsi ?? []).map((o, oi) => (
                        <div key={oi} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                          <input
                            value={o}
                            onChange={(e) => {
                              const opsi = [...(p.opsi ?? [])];
                              opsi[oi] = e.target.value;
                              ubahPertanyaan(p.id, { opsi });
                            }}
                            placeholder={`Pilihan ${oi + 1}`}
                            style={{ ...inputStyle, background: colors.surface }}
                          />
                          <button
                            onClick={() => ubahPertanyaan(p.id, { opsi: (p.opsi ?? []).filter((_, x) => x !== oi) })}
                            style={{ ...tombolKecil(false), color: colors.danger }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button onClick={() => ubahPertanyaan(p.id, { opsi: [...(p.opsi ?? []), ''] })} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 12, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>
                        + Pilihan
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: colors.ink }}>
              <input type="checkbox" checked={draf.status === 'siap'} onChange={(e) => ubah({ status: e.target.checked ? 'siap' : 'draft' })} />
              Tandai siap diaktifkan
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button onClick={() => { setDraf(null); setGalat(''); }} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button onClick={simpan} disabled={menyimpan} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: menyimpan ? 'wait' : 'pointer' }}>
                {menyimpan ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card padding="0">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.subtle }}>
              <th style={TH}>Judul</th>
              <th style={TH}>Yang dinilai</th>
              <th style={{ ...TH, textAlign: 'right' }}>Pertanyaan</th>
              <th style={TH}>Status</th>
              <th style={TH}></th>
            </tr>
          </thead>
          <tbody>
            {memuat ? (
              <tr><td colSpan={5} style={{ padding: 18, fontSize: 12.5, color: colors.faint }}>Memuat…</td></tr>
            ) : daftar.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 18, fontSize: 12.5, color: colors.faint }}>Bank kuesioner masih kosong.</td></tr>
            ) : (
              daftar.map((k) => (
                <tr key={k.id} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: colors.ink }}>{k.judul || '(tanpa judul)'}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12.5, color: colors.muted }}>{SASARAN_LABEL[k.sasaran]}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12.5, color: colors.muted, textAlign: 'right' }}>{k.pertanyaan.length}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 11px', color: k.status === 'siap' ? colors.green : colors.muted, background: k.status === 'siap' ? '#E5F3EA' : colors.subtle }}>
                      {k.status === 'siap' ? 'Siap' : 'Draft'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => { setDraf(k); setGalat(''); }} style={{ ...tombolKecil(false), padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>Sunting</button>{' '}
                    <button onClick={() => hapus(k)} style={{ ...tombolKecil(false), padding: '6px 12px', fontSize: 12, fontWeight: 700, color: colors.danger }}>Hapus</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '11px 16px', fontSize: 11.5, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3,
};

const tombolKecil = (mati: boolean): React.CSSProperties => ({
  padding: '5px 9px', borderRadius: 7, border: `1px solid ${colors.border}`,
  background: colors.surface, color: mati ? colors.faint : colors.ink,
  fontSize: 13, cursor: mati ? 'not-allowed' : 'pointer', lineHeight: 1,
});
