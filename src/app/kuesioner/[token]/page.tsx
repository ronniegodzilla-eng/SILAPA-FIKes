'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { colors } from '@/lib/theme';
import { Card, Icon, inputStyle, labelStyle } from '@/components/ui';
import { PRODI_PILIHAN } from '@/lib/types';
import type { PertanyaanKuesioner } from '@/lib/types';

interface KuesionerTampil {
  id: string;
  judul: string;
  deskripsi: string;
  wajib: boolean;
  pertanyaan: PertanyaanKuesioner[];
  sudahDiisi: boolean;
}

interface Mahasiswa {
  npm: string;
  nama: string;
  prodi: string;
  semesterKe: number;
}

/**
 * Pengisian kuesioner oleh mahasiswa — tanpa login.
 *
 * Alurnya tiga langkah supaya tidak membingungkan di layar ponsel: kenali diri,
 * pilih kuesioner, isi. Seluruh pemeriksaan tetap di server; layar ini hanya
 * mendahulukan pesannya supaya mahasiswa tidak mengisi panjang-panjang baru
 * ditolak di akhir.
 */
export default function IsiKuesionerPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [pembuka, setPembuka] = useState<{ periodeLabel: string; lingkup: string; jumlahKuesioner: number } | null>(null);
  const [galatAwal, setGalatAwal] = useState('');
  const [form, setForm] = useState({ npm: '', nama: '', prodi: '' });
  const [memeriksa, setMemeriksa] = useState(false);
  const [galat, setGalat] = useState('');

  const [mahasiswa, setMahasiswa] = useState<Mahasiswa | null>(null);
  const [daftar, setDaftar] = useState<KuesionerTampil[]>([]);
  const [dibuka, setDibuka] = useState<KuesionerTampil | null>(null);
  const [isian, setIsian] = useState<Record<string, string | number>>({});
  const [mengirim, setMengirim] = useState(false);
  const [selesai, setSelesai] = useState('');

  useEffect(() => {
    fetch(`/api/public/kuesioner?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(setPembuka)
      .catch((e) => setGalatAwal(e?.message ?? 'Gagal memuat halaman.'));
  }, [token]);

  const muatIdentitas = useCallback(async () => {
    setMemeriksa(true);
    setGalat('');
    try {
      const q = new URLSearchParams({
        token,
        npm: form.npm.trim(),
        nama: form.nama.trim(),
        prodi: form.prodi,
      });
      const r = await fetch(`/api/public/kuesioner?${q}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setMahasiswa(d.mahasiswa);
      setDaftar(d.kuesioner ?? []);
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal memeriksa identitas.');
    } finally {
      setMemeriksa(false);
    }
  }, [token, form]);

  async function kirim() {
    if (!dibuka || !mahasiswa || mengirim) return;
    const belum = dibuka.pertanyaan.filter(
      (p) => p.wajib && (isian[p.id] === undefined || String(isian[p.id]).trim() === '')
    );
    if (belum.length) {
      setGalat(`Masih ada ${belum.length} pertanyaan wajib yang belum dijawab.`);
      return;
    }
    setMengirim(true);
    setGalat('');
    try {
      const r = await fetch('/api/public/kuesioner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          npm: mahasiswa.npm,
          nama: mahasiswa.nama,
          prodi: mahasiswa.prodi,
          aktivasiId: dibuka.id,
          jawaban: isian,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setSelesai(dibuka.judul);
      setDibuka(null);
      setIsian({});
      await muatIdentitas();
    } catch (e: any) {
      setGalat(e?.message ?? 'Gagal mengirim jawaban.');
    } finally {
      setMengirim(false);
    }
  }

  const bungkus = (isi: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: colors.subtleAlt ?? '#F1F6F2', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 20, fontWeight: 700, color: colors.green }}>SILAPA-FIKes</div>
          <div style={{ fontSize: 12.5, color: colors.muted }}>Kuesioner Evaluasi Mahasiswa</div>
        </div>
        {isi}
      </div>
    </div>
  );

  if (galatAwal) {
    return bungkus(
      <Card padding="22px 24px">
        <span style={{ fontSize: 13.5, color: colors.danger, fontWeight: 600, lineHeight: 1.6 }}>{galatAwal}</span>
      </Card>
    );
  }

  if (!pembuka) return bungkus(<Card padding="22px 24px"><span style={{ fontSize: 13, color: colors.faint }}>Memuat…</span></Card>);

  // ── Langkah 1: kenali diri ───────────────────────────────────────────────
  if (!mahasiswa) {
    return bungkus(
      <Card padding="22px 24px">
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>Isi identitas Anda</div>
        <span style={{ display: 'block', fontSize: 12.5, color: colors.muted, marginTop: 4, marginBottom: 16, lineHeight: 1.55 }}>
          Periode {pembuka.periodeLabel}. Tulis persis seperti data kampus — ketiganya harus cocok.
        </span>

        {pembuka.jumlahKuesioner === 0 && (
          <span style={{ display: 'block', fontSize: 12.5, color: colors.amber, fontWeight: 600, marginBottom: 14 }}>
            Belum ada kuesioner yang dibuka pada periode ini.
          </span>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>NPM</label>
            <input value={form.npm} onChange={(e) => setForm({ ...form, npm: e.target.value })} style={inputStyle} inputMode="numeric" />
          </div>
          <div>
            <label style={labelStyle}>Nama lengkap</label>
            <input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Program studi</label>
            <select value={form.prodi} onChange={(e) => setForm({ ...form, prodi: e.target.value })} style={inputStyle}>
              <option value="">Pilih prodi…</option>
              {PRODI_PILIHAN.map((kode) => <option key={kode} value={kode}>{kode}</option>)}
            </select>
          </div>
        </div>

        {galat && <span style={{ display: 'block', fontSize: 12.5, color: colors.danger, fontWeight: 600, marginTop: 12, lineHeight: 1.5 }}>{galat}</span>}

        <button
          onClick={muatIdentitas}
          disabled={memeriksa || !form.npm.trim() || !form.nama.trim() || !form.prodi}
          style={{ width: '100%', marginTop: 16, padding: '12px 16px', borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 13.5, fontWeight: 700, cursor: memeriksa ? 'wait' : 'pointer', opacity: !form.npm.trim() || !form.nama.trim() || !form.prodi ? 0.55 : 1 }}
        >
          {memeriksa ? 'Memeriksa…' : 'Lanjut'}
        </button>
      </Card>
    );
  }

  // ── Langkah 3: mengisi satu kuesioner ────────────────────────────────────
  if (dibuka) {
    return bungkus(
      <Card padding="22px 24px">
        <div onClick={() => { setDibuka(null); setIsian({}); setGalat(''); }} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: colors.green, cursor: 'pointer', marginBottom: 14 }}>
          <Icon path="M15 6l-6 6 6 6" size={14} width={2} />
          Kembali ke daftar kuesioner
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>{dibuka.judul}</div>
        {dibuka.deskripsi && (
          <span style={{ display: 'block', fontSize: 12.5, color: colors.muted, marginTop: 4, lineHeight: 1.55 }}>{dibuka.deskripsi}</span>
        )}
        <span style={{ display: 'block', fontSize: 11.5, color: colors.faint, marginTop: 8, lineHeight: 1.5 }}>
          Jawaban tidak dapat diubah setelah dikirim, dan dosen PA Anda tidak dapat melihat jawaban perorangan.
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 20 }}>
          {dibuka.pertanyaan.map((p, i) => (
            <div key={p.id}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, lineHeight: 1.5, marginBottom: 8 }}>
                {i + 1}. {p.teks}
                {p.wajib && <span style={{ color: colors.danger }}> *</span>}
              </div>

              {p.jenis === 'skala' && (
                <div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Array.from({ length: p.skalaMaks ?? 5 }, (_, n) => n + 1).map((n) => {
                      const dipilih = isian[p.id] === n;
                      return (
                        <button
                          key={n}
                          onClick={() => setIsian({ ...isian, [p.id]: n })}
                          style={{
                            minWidth: 44, padding: '10px 0', borderRadius: 9, fontSize: 13.5, fontWeight: 700,
                            border: `1px solid ${dipilih ? colors.green : colors.border}`,
                            background: dipilih ? colors.green : colors.surface,
                            color: dipilih ? colors.white : colors.ink, cursor: 'pointer', flex: '1 0 44px',
                          }}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  {(p.labelMin || p.labelMaks) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.faint, marginTop: 5 }}>
                      <span>{p.labelMin}</span><span>{p.labelMaks}</span>
                    </div>
                  )}
                </div>
              )}

              {p.jenis === 'pilihan' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(p.opsi ?? []).filter(Boolean).map((o) => (
                    <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: colors.ink, padding: '9px 12px', borderRadius: 9, border: `1px solid ${isian[p.id] === o ? colors.green : colors.border}`, background: colors.surface, cursor: 'pointer' }}>
                      <input type="radio" name={p.id} checked={isian[p.id] === o} onChange={() => setIsian({ ...isian, [p.id]: o })} />
                      {o}
                    </label>
                  ))}
                </div>
              )}

              {p.jenis === 'teks' && (
                <textarea
                  value={String(isian[p.id] ?? '')}
                  onChange={(e) => setIsian({ ...isian, [p.id]: e.target.value })}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              )}
            </div>
          ))}
        </div>

        {galat && <span style={{ display: 'block', fontSize: 12.5, color: colors.danger, fontWeight: 600, marginTop: 16, lineHeight: 1.5 }}>{galat}</span>}

        <button
          onClick={kirim}
          disabled={mengirim}
          style={{ width: '100%', marginTop: 20, padding: '12px 16px', borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 13.5, fontWeight: 700, cursor: mengirim ? 'wait' : 'pointer' }}
        >
          {mengirim ? 'Mengirim…' : 'Kirim Jawaban'}
        </button>
      </Card>
    );
  }

  // ── Langkah 2: daftar kuesioner ──────────────────────────────────────────
  const belum = daftar.filter((k) => !k.sudahDiisi);
  return bungkus(
    <>
      <Card padding="18px 22px">
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>{mahasiswa.nama}</div>
        <span style={{ fontSize: 12.5, color: colors.muted }}>
          NPM {mahasiswa.npm} · {mahasiswa.prodi} · Semester {mahasiswa.semesterKe}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: colors.faint, marginTop: 8 }}>
          Bukan Anda? <span onClick={() => { setMahasiswa(null); setDaftar([]); setGalat(''); }} style={{ color: colors.green, fontWeight: 700, cursor: 'pointer' }}>Ganti identitas</span>
        </span>
      </Card>

      {selesai && (
        <Card padding="16px 20px" style={{ background: '#E5F3EA', border: `1px solid ${colors.green}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.green }}>
            Terima kasih — jawaban untuk &ldquo;{selesai}&rdquo; sudah tersimpan.
          </span>
        </Card>
      )}

      {daftar.length === 0 ? (
        <Card padding="20px 22px"><span style={{ fontSize: 13, color: colors.muted }}>Belum ada kuesioner yang dibuka untuk Anda saat ini.</span></Card>
      ) : (
        <>
          {belum.length > 0 && (
            <span style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.5 }}>
              {belum.length} kuesioner menunggu diisi.
            </span>
          )}
          {daftar.map((k) => (
            <Card key={k.id} padding="16px 20px">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>{k.judul}</div>
                  <span style={{ fontSize: 11.5, color: colors.faint }}>
                    {k.pertanyaan.length} pertanyaan{k.wajib ? ' · wajib diisi' : ''}
                  </span>
                </div>
                {k.sudahDiisi ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: colors.green, background: '#E5F3EA', borderRadius: 999, padding: '6px 13px' }}>Sudah diisi</span>
                ) : (
                  <button
                    onClick={() => { setDibuka(k); setIsian({}); setGalat(''); setSelesai(''); }}
                    style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Isi sekarang
                  </button>
                )}
              </div>
            </Card>
          ))}
        </>
      )}
    </>
  );
}
