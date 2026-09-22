'use client';

import { colors } from '@/lib/theme';
import { Card } from '@/components/ui';

export interface BarisDistribusi {
  kunci: string;
  label: string;
  target: number;
  terisi: number;
  persen: number;
}

export interface HasilPertanyaan {
  id: string;
  teks: string;
  jenis: 'skala' | 'pilihan' | 'teks';
  n: number;
  ditahan: boolean;
  skalaMaks?: number;
  rata?: number | null;
  sebaran?: Record<string, number>;
  teksJawaban?: string[];
}

export interface RekapKuesioner {
  aktivasi: { id: string; judul: string; topik: string; kerahasiaan: string; status: string; wajib: boolean };
  lingkup: 'fakultas' | 'bimbingan';
  minResponden: number;
  hasilDitahan: 'belum_ditutup' | null;
  ringkas: { target: number; terisi: number; persen: number };
  distribusi: { dosen: BarisDistribusi[]; prodi: BarisDistribusi[]; semester: BarisDistribusi[] };
  hasil: HasilPertanyaan[];
}

/**
 * Visual hasil kuesioner — digambar dengan SVG/CSS sederhana, tanpa pustaka
 * grafik. Bukan karena hemat: dashboard ini dibuka di proyektor saat rapat
 * evaluasi, dan bentuk yang dipakai (batang, batang bertumpuk) tidak menuntut
 * mesin gambar penuh. Aplikasi ini pun sudah menggambar grafik IP-nya sendiri.
 */

/** Batang mendatar untuk tingkat pengisian. */
export function BatangDistribusi({ baris, warna = colors.green }: { baris: BarisDistribusi[]; warna?: string }) {
  if (baris.length === 0) {
    return <span style={{ fontSize: 12.5, color: colors.faint }}>Belum ada data.</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {baris.map((b) => (
        <div key={b.kunci}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: colors.ink, fontWeight: 600 }}>{b.label}</span>
            <span style={{ color: colors.muted, whiteSpace: 'nowrap' }}>
              {b.terisi} / {b.target} · <strong style={{ color: colors.ink }}>{b.persen}%</strong>
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: colors.subtle, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, b.persen)}%`, background: warna, borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Batang bertumpuk untuk sebaran jawaban skala 1..maks. */
function SebaranSkala({ sebaran, maks, n }: { sebaran: Record<string, number>; maks: number; n: number }) {
  const nilai = Array.from({ length: maks }, (_, i) => i + 1);
  // Gradasi merah→hijau: nilai rendah perlu langsung terlihat, itu yang dicari
  // saat rapat evaluasi.
  const warna = (v: number) => {
    const t = maks > 1 ? (v - 1) / (maks - 1) : 1;
    return t < 0.34 ? '#B0453A' : t < 0.67 ? '#D9A441' : colors.green;
  };
  return (
    <div>
      <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', border: `1px solid ${colors.border}` }}>
        {nilai.map((v) => {
          const c = sebaran[String(v)] ?? 0;
          if (!c) return null;
          return (
            <div
              key={v}
              title={`Nilai ${v}: ${c} responden`}
              style={{ width: `${(c / n) * 100}%`, background: warna(v), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, color: colors.white }}
            >
              {(c / n) * 100 >= 9 ? c : ''}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
        {nilai.map((v) => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: colors.muted }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: warna(v), display: 'inline-block' }} />
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Batang sederhana untuk sebaran pilihan. */
function SebaranPilihan({ sebaran, n }: { sebaran: Record<string, number>; n: number }) {
  const baris = Object.entries(sebaran).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {baris.map(([label, c]) => (
        <div key={label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: colors.ink }}>{label}</span>
            <span style={{ color: colors.muted }}>{c} · {Math.round((c / n) * 100)}%</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: colors.subtle, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(c / n) * 100}%`, background: colors.green, borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HasilPertanyaanList({
  hasil, minResponden, sebabDitahan,
}: {
  hasil: HasilPertanyaan[];
  minResponden: number;
  sebabDitahan?: 'belum_ditutup' | null;
}) {
  // Pertanyaan skala diurut dari rata-rata TERENDAH: yang paling perlu
  // ditindaklanjuti muncul lebih dulu, bukan terkubur di bawah.
  const urut = [...hasil].sort((a, b) => {
    if (a.jenis === 'skala' && b.jenis === 'skala') return (a.rata ?? 99) - (b.rata ?? 99);
    if (a.jenis === 'skala') return -1;
    if (b.jenis === 'skala') return 1;
    return 0;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {urut.map((h) => (
        <div key={h.id} style={{ borderTop: `1px solid ${colors.rowBorder}`, paddingTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 9 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink, lineHeight: 1.5, flex: 1, minWidth: 200 }}>{h.teks}</span>
            {h.jenis === 'skala' && !h.ditahan && h.rata != null && (
              <span style={{ fontFamily: "'Lora',serif", fontSize: 20, fontWeight: 700, color: colors.green, whiteSpace: 'nowrap' }}>
                {h.rata.toFixed(2)}
                <span style={{ fontSize: 11, fontWeight: 600, color: colors.faint }}> / {h.skalaMaks}</span>
              </span>
            )}
          </div>

          {h.ditahan ? (
            <span style={{ fontSize: 12, color: colors.amber, lineHeight: 1.5 }}>
              {sebabDitahan === 'belum_ditutup'
                ? `${h.n} jawaban sudah masuk — isinya baru terbuka setelah pengisian ditutup.`
                : `Baru ${h.n} responden — isi jawaban ditahan sampai minimal ${minResponden}, agar jawaban perorangan tidak bisa ditelusuri.`}
            </span>
          ) : h.jenis === 'skala' && h.sebaran ? (
            <SebaranSkala sebaran={h.sebaran} maks={h.skalaMaks ?? 5} n={h.n} />
          ) : h.jenis === 'pilihan' && h.sebaran ? (
            <SebaranPilihan sebaran={h.sebaran} n={h.n} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 260, overflowY: 'auto' }}>
              {(h.teksJawaban ?? []).length === 0 ? (
                <span style={{ fontSize: 12, color: colors.faint }}>Belum ada jawaban.</span>
              ) : (
                (h.teksJawaban ?? []).map((t, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: colors.ink, background: colors.subtle, borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 }}>
                    “{t}”
                  </div>
                ))
              )}
            </div>
          )}

          {!h.ditahan && <span style={{ display: 'block', fontSize: 11, color: colors.faint, marginTop: 6 }}>{h.n} responden</span>}
        </div>
      ))}
    </div>
  );
}

export function RingkasPengisian({ r }: { r: RekapKuesioner }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Lora',serif", fontSize: 30, fontWeight: 700, color: colors.green }}>{r.ringkas.persen}%</span>
        <span style={{ fontSize: 13, color: colors.muted }}>
          {r.ringkas.terisi} dari {r.ringkas.target} mahasiswa
          {r.lingkup === 'bimbingan' ? ' bimbingan Anda' : ' se-fakultas'} sudah mengisi
        </span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: colors.subtle, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ height: '100%', width: `${Math.min(100, r.ringkas.persen)}%`, background: colors.green, borderRadius: 999 }} />
      </div>
    </Card>
  );
}
