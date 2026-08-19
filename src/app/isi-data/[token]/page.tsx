'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { colors } from '@/lib/theme';
import { Card, Icon, inputStyle, labelStyle } from '@/components/ui';
import { BuktiUploadField } from '@/components/BuktiUpload';
import { uploadBuktiFilePublic } from '@/lib/upload-bukti-public';
import { konsultasiJenisLabel } from '@/lib/compute';
import { KELAS_PILIHAN, KONSULTASI_JENIS_PRESET, UKM_JENIS_PRESET, type KonsultasiEntry, type KonsultasiJenis, type SemkesEntry } from '@/lib/types';
import { SemkesSection } from '@/components/SemkesSection';

type Phase = 'loading' | 'error' | 'pick' | 'formLoading' | 'form' | 'saved';

interface RosterItem { npm: string; nama: string; }

interface FormState {
  status: string;
  kelas: string;
  pkkmb: boolean; pkkmbBukti: string;
  toefl: boolean; toeflBukti: string;
  esq: boolean; esqBukti: string;
  semkes: SemkesEntry[];
  akademik: {
    sksKrs: number | null; krsBukti: string;
    ipKhs: number | null; khsBukti: string;
    ipk: number | null;
    konsultasi: KonsultasiEntry[];
    mkNilaiDE: string[];
  };
  nonAkademik: {
    ukm: boolean; ukmJenis: string | null; organisasiBukti: string;
    hima: boolean; bem: boolean;
    beasiswa: { ada: boolean; jenis: string | null; keterangan: string; bukti: string };
    prestasi: { ada: boolean; jenis: string | null; tingkat: string | null; bukti: string };
  };
  skripsi: { tahap: string; kendala: string };
  permasalahan: string;
  rekomendasi: string;
}

const STATUS_ENUM = [
  ['aktif', 'Aktif'], ['cuti', 'Cuti'], ['non_aktif', 'Non-aktif'], ['lulus', 'Lulus'],
] as const;
const BEASISWA_ENUM = ['KIP', 'UKT Kemendiktisaintek', 'Yayasan', 'Prestasi', 'lainnya'];
const TINGKAT_ENUM = ['prodi', 'fakultas', 'universitas', 'kota', 'provinsi', 'nasional', 'internasional'];
const TAHAP_ENUM: [string, string][] = [
  ['belum', 'Belum mulai'], ['pengajuan_judul', 'Pengajuan judul'], ['acc_judul', 'ACC judul'],
  ['bimbingan_proposal', 'Bimbingan proposal'], ['sempro', 'Seminar proposal'], ['penelitian', 'Penelitian'],
  ['bimbingan_skripsi', 'Bimbingan skripsi'], ['sidang', 'Sidang'], ['lulus', 'Lulus'],
];

/**
 * Draft lokal isian mahasiswa.
 *
 * Halaman ini tidak punya autosave seperti form dosen — satu-satunya penulisan
 * ke server terjadi saat tombol Simpan ditekan. Kalau jaringan putus di detik
 * itu (kejadian nyata: mahasiswa mengisi dari HP dengan sinyal buruk), seluruh
 * isian hilang begitu halaman ditutup atau tab dibuang sistem. Draft disimpan
 * di perangkat mahasiswa sendiri, dipulihkan saat ia kembali, dan dibuang
 * begitu server mengonfirmasi penyimpanan.
 */
const DRAFT_PREFIX = 'silapa_isidata_draft_';
const draftKey = (npm: string) => `${DRAFT_PREFIX}${npm}`;

function bacaDraft(npm: string): { form: FormState; waktu: string } | null {
  try {
    const raw = window.localStorage.getItem(draftKey(npm));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.form) return null;
    return { form: parsed.form as FormState, waktu: String(parsed.waktu ?? '') };
  } catch {
    return null; // localStorage diblokir / isi rusak — jalan tanpa draft.
  }
}

function tulisDraft(npm: string, form: FormState) {
  try {
    window.localStorage.setItem(
      draftKey(npm),
      JSON.stringify({ form, waktu: new Date().toISOString() })
    );
  } catch {
    // Kuota penuh atau mode privat — abaikan, form tetap bisa dipakai.
  }
}

function hapusDraft(npm: string) {
  try {
    window.localStorage.removeItem(draftKey(npm));
  } catch {
    // tidak apa-apa
  }
}

export default function IsiDataMandiriPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [dosenNama, setDosenNama] = useState('');
  const [periodeLabel, setPeriodeLabel] = useState('');
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [search, setSearch] = useState('');

  const [selectedNpm, setSelectedNpm] = useState('');
  const [identitas, setIdentitas] = useState<{ npm: string; nama: string; prodi: string; angkatan: number; kelas: string } | null>(null);
  const [semesterKe, setSemesterKe] = useState(0);
  const [form, setForm] = useState<FormState | null>(null);
  // Nilai SKS/IP TERSIMPAN saat form dimuat — dipakai untuk deteksi "berubah"
  // di sisi klien (server tetap jadi sumber kebenaran, validasi ini cuma UX).
  const [terkunci, setTerkunci] = useState(false);
  const [savedSks, setSavedSks] = useState<number | null>(null);
  const [savedIp, setSavedIp] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  /** Waktu draft lokal yang sedang dipulihkan — '' bila isian berasal dari server. */
  const [draftDipulihkan, setDraftDipulihkan] = useState('');
  /** Salinan isian apa adanya dari server, sebagai pembanding "ada perubahan
   * yang belum tersimpan atau tidak". Tanpa ini, draft ikut ditulis meski
   * mahasiswa tidak mengubah apa pun — dan kunjungan berikutnya menampilkan
   * pemberitahuan pemulihan yang membingungkan. */
  const baselineServer = useRef<string>('');

  useEffect(() => {
    fetch(`/api/public/isi-data?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        setDosenNama(data.dosenNama);
        setPeriodeLabel(data.periodeLabel);
        setRoster(data.mahasiswa);
        setPhase('pick');
      })
      .catch((e) => {
        setErrorMsg(e?.message || 'Link tidak valid.');
        setPhase('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function pilihMahasiswa(npm: string) {
    setSelectedNpm(npm);
    setPhase('formLoading');
    setSaveErr('');
    try {
      const res = await fetch(`/api/public/isi-data?token=${encodeURIComponent(token)}&npm=${encodeURIComponent(npm)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setIdentitas(data.identitas);
      setTerkunci(!!data.dikunciMandiri);
      setSemesterKe(data.semesterKe);
      setSavedSks(data.akademik.sksKrs);
      setSavedIp(data.akademik.ipKhs);
      const dariServer: FormState = {
        status: data.status,
        kelas: data.identitas?.kelas ?? '-',
        pkkmb: data.pkkmb, pkkmbBukti: data.pkkmbBukti,
        toefl: data.toefl, toeflBukti: data.toeflBukti,
        esq: data.esq, esqBukti: data.esqBukti,
        semkes: data.semkes ?? [],
        akademik: data.akademik,
        nonAkademik: data.nonAkademik,
        skripsi: data.skripsi,
        permasalahan: data.permasalahan,
        rekomendasi: data.rekomendasi,
      };
      // Draft hanya dipulihkan bila record belum dikunci — kalau sudah
      // dikunci, isian di layar harus apa adanya seperti di server.
      baselineServer.current = JSON.stringify(dariServer);
      const draft = data.dikunciMandiri ? null : bacaDraft(npm);
      setForm(draft?.form ?? dariServer);
      setDraftDipulihkan(draft ? draft.waktu : '');
      setPhase('form');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Gagal memuat data mahasiswa.');
      setPhase('error');
    }
  }

  // Setiap perubahan langsung diendapkan ke perangkat mahasiswa, bukan
  // menunggu tombol Simpan — justru saat Simpan-lah jaringan bisa gagal.
  useEffect(() => {
    if (phase !== 'form' || !form || !selectedNpm || terkunci) return;
    // Hanya simpan bila memang BERBEDA dari data server; kalau sama persis,
    // draft justru dibuang supaya tidak ada "pemulihan" palsu nanti.
    if (JSON.stringify(form) === baselineServer.current) hapusDraft(selectedNpm);
    else tulisDraft(selectedNpm, form);
  }, [form, phase, selectedNpm, terkunci]);

  function buangDraft() {
    if (!selectedNpm) return;
    hapusDraft(selectedNpm);
    setDraftDipulihkan('');
    pilihMahasiswa(selectedNpm);
  }

  function kembaliKePilih() {
    setSelectedNpm('');
    setIdentitas(null);
    setForm(null);
    setPhase('pick');
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }
  function setAk<K extends keyof FormState['akademik']>(key: K, value: FormState['akademik'][K]) {
    setForm((f) => (f ? { ...f, akademik: { ...f.akademik, [key]: value } } : f));
  }
  function setNa<K extends keyof FormState['nonAkademik']>(key: K, value: FormState['nonAkademik'][K]) {
    setForm((f) => (f ? { ...f, nonAkademik: { ...f.nonAkademik, [key]: value } } : f));
  }

  async function simpan() {
    if (!form || saving) return;
    setSaveErr('');

    const sksChanged = form.akademik.sksKrs !== savedSks;
    if (sksChanged && !form.akademik.krsBukti) {
      setSaveErr('Upload bukti KRS wajib dilampirkan karena SKS berubah.');
      return;
    }
    const ipChanged = form.akademik.ipKhs !== savedIp;
    if (ipChanged && !form.akademik.khsBukti) {
      setSaveErr('Upload bukti KHS wajib dilampirkan karena IP berubah.');
      return;
    }
    if (form.pkkmb && !form.pkkmbBukti) {
      setSaveErr('Upload bukti PKKMB wajib dilampirkan karena PKKMB dicentang.');
      return;
    }
    if (form.toefl && !form.toeflBukti) {
      setSaveErr('Upload bukti TOEFL wajib dilampirkan karena TOEFL dicentang.');
      return;
    }
    if (form.esq && !form.esqBukti) {
      setSaveErr('Upload bukti ESQ wajib dilampirkan karena ESQ dicentang.');
      return;
    }
    const semkesTanpaBukti = form.semkes.find((e) => !e.bukti);
    if (semkesTanpaBukti) {
      setSaveErr(`Upload bukti sertifikat untuk semkes "${semkesTanpaBukti.judul}".`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/public/isi-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, npm: selectedNpm, patch: form }),
      });
      if (!res.ok) throw new Error(await res.text());
      hapusDraft(selectedNpm);
      setDraftDipulihkan('');
      setPhase('saved');
    } catch (e: any) {
      setSaveErr(
        `${e?.message || 'Gagal menyimpan data — periksa koneksi Anda.'} ` +
          'Isian Anda tersimpan sementara di perangkat ini, jadi tidak hilang. ' +
          'Coba tekan Simpan lagi setelah sinyal membaik.'
      );
    } finally {
      setSaving(false);
    }
  }

  const filteredRoster = roster.filter((r) => r.nama.toLowerCase().includes(search.trim().toLowerCase()));
  const showSkripsi = form && form.status !== 'cuti' && form.status !== 'non_aktif' && semesterKe >= 7;
  const showAkademik = form && form.status !== 'cuti' && form.status !== 'non_aktif';

  return (
    <div style={{ minHeight: '100vh', background: colors.subtleAlt ?? '#F1F6F2', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Image src="/logo-uis.png" alt="Logo Universitas Ibnu Sina" width={40} height={40} style={{ objectFit: 'contain' }} />
          <div>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 18, fontWeight: 700, color: colors.ink }}>
              SILAPA<span style={{ color: colors.yellow }}>-FIKes</span>
            </div>
            <div style={{ fontSize: 11.5, color: colors.muted }}>Isi Data Mandiri Mahasiswa</div>
          </div>
        </div>

        {phase === 'loading' && <Card><span style={{ fontSize: 13, color: colors.muted }}>Memuat…</span></Card>}

        {phase === 'error' && (
          <Card>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.danger, display: 'block', marginBottom: 6 }}>
              Tidak dapat membuka halaman ini
            </span>
            <span style={{ fontSize: 13, color: colors.ink, lineHeight: 1.6 }}>{errorMsg}</span>
          </Card>
        )}

        {(phase === 'pick' || phase === 'formLoading') && (
          <Card>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 4 }}>
              Dosen PA: {dosenNama}
            </span>
            <span style={{ fontSize: 12.5, color: colors.muted, display: 'block', marginBottom: 16 }}>
              Periode {periodeLabel} — pilih nama Anda untuk mengisi data.
            </span>
            <input
              placeholder="Cari nama Anda..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
              {filteredRoster.map((r) => (
                <div
                  key={r.npm}
                  onClick={() => pilihMahasiswa(r.npm)}
                  style={{ padding: '11px 14px', borderRadius: 9, border: `1px solid ${colors.border}`, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: colors.ink, background: colors.surface }}
                >
                  {r.nama} <span style={{ color: colors.faint, fontWeight: 500 }}>({r.npm})</span>
                </div>
              ))}
              {filteredRoster.length === 0 && (
                <span style={{ fontSize: 12.5, color: colors.faint }}>Tidak ada nama yang cocok.</span>
              )}
            </div>
            {phase === 'formLoading' && <span style={{ display: 'block', marginTop: 12, fontSize: 12.5, color: colors.faint }}>Memuat data Anda…</span>}
          </Card>
        )}

        {phase === 'form' && terkunci && identitas && (
          <Card>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 6 }}>
              Data {identitas.nama} sudah terkunci
            </span>
            <span style={{ fontSize: 13, color: colors.muted, lineHeight: 1.6, display: 'block', marginBottom: 16 }}>
              Data untuk NPM {identitas.npm} sudah pernah disimpan, jadi dikunci agar tidak dapat diubah
              orang lain. Bila masih ada yang perlu diperbaiki, hubungi dosen PA Anda untuk membuka kuncinya.
            </span>
            <button
              onClick={kembaliKePilih}
              style={{ padding: '12px 18px', borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13.5, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}
            >
              Kembali ke daftar nama
            </button>
          </Card>
        )}

        {phase === 'form' && !terkunci && form && identitas && (
          <>
            {draftDipulihkan && (
              <Card style={{ background: colors.amberBg, border: `1px solid ${colors.amberText}` }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 4 }}>
                  Isian Anda yang belum sempat tersimpan sudah dipulihkan
                </span>
                <span style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.6, display: 'block' }}>
                  Tersimpan sementara di HP Anda pada{' '}
                  {new Date(draftDipulihkan).toLocaleString('id-ID')} — belum masuk ke sistem.
                  Periksa kembali isinya, lalu tekan <b>Simpan</b> di bawah agar benar-benar terkirim.
                </span>
                <button
                  onClick={buangDraft}
                  style={{ marginTop: 10, padding: '8px 14px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 12, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}
                >
                  Buang, muat ulang dari sistem
                </button>
              </Card>
            )}

            <Card style={{ background: colors.subtle }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Data ini tidak dapat diubah dari sini
              </span>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 17, fontWeight: 700, color: colors.ink }}>{identitas.nama}</div>
              <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 3 }}>
                NPM {identitas.npm} · {identitas.prodi} · Angkatan {identitas.angkatan} · Semester {semesterKe}
              </div>
              <span style={{ fontSize: 11.5, color: colors.faint, display: 'block', marginTop: 8 }}>
                Bukan Anda, atau data di atas salah? Jangan lanjutkan — hubungi dosen PA atau admin fakultas.
              </span>
            </Card>

            <Card>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Status &amp; data sekali-seumur-kuliah</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14, alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>Status mahasiswa</label>
                  <select value={form.status} onChange={(e) => set('status', e.target.value)} style={inputStyle}>
                    {STATUS_ENUM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Kelas</label>
                  <select value={form.kelas} onChange={(e) => set('kelas', e.target.value)} style={inputStyle}>
                    <option value="-">— belum tercatat</option>
                    {KELAS_PILIHAN.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
                    <input type="checkbox" checked={form.pkkmb} onChange={(e) => set('pkkmb', e.target.checked)} /> PKKMB
                  </label>
                  <BuktiUploadField npm={selectedNpm} label="PKKMB" value={form.pkkmbBukti} onChange={(url) => set('pkkmbBukti', url)} uploadFn={(f) => uploadBuktiFilePublic(token, selectedNpm, 'PKKMB', f)} required={form.pkkmb} />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
                    <input type="checkbox" checked={form.toefl} onChange={(e) => set('toefl', e.target.checked)} /> TOEFL
                  </label>
                  <BuktiUploadField npm={selectedNpm} label="TOEFL" value={form.toeflBukti} onChange={(url) => set('toeflBukti', url)} uploadFn={(f) => uploadBuktiFilePublic(token, selectedNpm, 'TOEFL', f)} required={form.toefl} />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
                    <input type="checkbox" checked={form.esq} onChange={(e) => set('esq', e.target.checked)} /> ESQ
                  </label>
                  <BuktiUploadField npm={selectedNpm} label="ESQ" value={form.esqBukti} onChange={(url) => set('esqBukti', url)} uploadFn={(f) => uploadBuktiFilePublic(token, selectedNpm, 'ESQ', f)} required={form.esq} />
                </div>

              </div>
              <div style={{ marginTop: 16 }}>
                <SemkesSection
                  npm={selectedNpm}
                  entries={form.semkes}
                  onChange={(next) => set('semkes', next)}
                  uploadFn={(f) => uploadBuktiFilePublic(token, selectedNpm, 'Semkes', f)}
                />
              </div>
            </Card>

            {showAkademik && (
              <Card>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Akademik</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 18 }}>
                  <div>
                    <label style={labelStyle}>SKS (KRS)</label>
                    <input type="number" value={form.akademik.sksKrs ?? ''} onChange={(e) => setAk('sksKrs', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
                    <BuktiUploadField
                      npm={selectedNpm} label="KRS" value={form.akademik.krsBukti}
                      onChange={(url) => setAk('krsBukti', url)}
                      uploadFn={(f) => uploadBuktiFilePublic(token, selectedNpm, 'KRS', f)}
                      required={form.akademik.sksKrs !== savedSks}
                    />
                    <span style={{ fontSize: 10.5, color: colors.faint, display: 'block', marginTop: 4 }}>Wajib upload KRS resmi SIAKAD bila angka SKS diubah.</span>
                  </div>
                  <div>
                    <label style={labelStyle}>IP (KHS)</label>
                    <input type="number" step="0.01" min={0} max={4} value={form.akademik.ipKhs ?? ''} onChange={(e) => setAk('ipKhs', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
                    <BuktiUploadField
                      npm={selectedNpm} label="KHS" value={form.akademik.khsBukti}
                      onChange={(url) => setAk('khsBukti', url)}
                      uploadFn={(f) => uploadBuktiFilePublic(token, selectedNpm, 'KHS', f)}
                      required={form.akademik.ipKhs !== savedIp}
                    />
                    <span style={{ fontSize: 10.5, color: colors.faint, display: 'block', marginTop: 4 }}>Wajib upload KHS resmi SIAKAD bila angka IP diubah.</span>
                  </div>
                  <div>
                    <label style={labelStyle}>IPK</label>
                    <input type="number" step="0.01" min={0} max={4} value={form.akademik.ipk ?? ''} onChange={(e) => setAk('ipk', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
                    <span style={{ fontSize: 10.5, color: colors.faint, display: 'block', marginTop: 4 }}>IPK kumulatif sampai semester ini.</span>
                  </div>
                </div>

                <KonsultasiSection entries={form.akademik.konsultasi} onChange={(next) => setAk('konsultasi', next)} />

                <label style={{ ...labelStyle, marginTop: 18 }}>Mata kuliah bernilai D/E (pisahkan dengan koma)</label>
                <input
                  value={form.akademik.mkNilaiDE.join(', ')}
                  onChange={(e) => setAk('mkNilaiDE', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
                  placeholder="Contoh: Biokimia, Farmakologi Dasar"
                  style={inputStyle}
                />
              </Card>
            )}

            <Card>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Non-Akademik</span>
              <div style={{ display: 'flex', gap: 20, marginBottom: 4, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
                  <input type="checkbox" checked={form.nonAkademik.ukm} onChange={(e) => { setNa('ukm', e.target.checked); if (!e.target.checked) setNa('ukmJenis', ''); }} /> UKM
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
                  <input type="checkbox" checked={form.nonAkademik.hima} onChange={(e) => setNa('hima', e.target.checked)} /> HIMA
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
                  <input type="checkbox" checked={form.nonAkademik.bem} onChange={(e) => setNa('bem', e.target.checked)} /> BEM
                </label>
              </div>
              {form.nonAkademik.ukm && (
                <div style={{ marginTop: 10, maxWidth: 320 }}>
                  <label style={labelStyle}>Jenis UKM</label>
                  <UkmJenisSelect value={form.nonAkademik.ukmJenis ?? ''} onChange={(v) => setNa('ukmJenis', v)} />
                </div>
              )}
              {(form.nonAkademik.ukm || form.nonAkademik.hima || form.nonAkademik.bem) && (
                <BuktiUploadField npm={selectedNpm} label="Organisasi" value={form.nonAkademik.organisasiBukti} onChange={(url) => setNa('organisasiBukti', url)} uploadFn={(f) => uploadBuktiFilePublic(token, selectedNpm, 'Organisasi', f)} />
              )}
              <div style={{ marginBottom: 12 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 20 }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>
                    <input type="checkbox" checked={form.nonAkademik.beasiswa.ada} onChange={(e) => setNa('beasiswa', { ...form.nonAkademik.beasiswa, ada: e.target.checked })} /> Penerima beasiswa
                  </label>
                  {form.nonAkademik.beasiswa.ada && (
                    <>
                      <select value={form.nonAkademik.beasiswa.jenis ?? 'KIP'} onChange={(e) => setNa('beasiswa', { ...form.nonAkademik.beasiswa, jenis: e.target.value })} style={{ ...inputStyle, fontSize: 12.5, padding: '9px 10px' }}>
                        {BEASISWA_ENUM.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <BuktiUploadField npm={selectedNpm} label="Beasiswa" value={form.nonAkademik.beasiswa.bukti} onChange={(url) => setNa('beasiswa', { ...form.nonAkademik.beasiswa, bukti: url })} uploadFn={(f) => uploadBuktiFilePublic(token, selectedNpm, 'Beasiswa', f)} />
                    </>
                  )}
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>
                    <input type="checkbox" checked={form.nonAkademik.prestasi.ada} onChange={(e) => setNa('prestasi', { ...form.nonAkademik.prestasi, ada: e.target.checked })} /> Meraih prestasi
                  </label>
                  {form.nonAkademik.prestasi.ada && (
                    <>
                      <input value={form.nonAkademik.prestasi.jenis ?? ''} onChange={(e) => setNa('prestasi', { ...form.nonAkademik.prestasi, jenis: e.target.value })} placeholder="Nama prestasi" style={{ ...inputStyle, fontSize: 12.5, padding: '9px 10px', marginBottom: 8 }} />
                      <select value={form.nonAkademik.prestasi.tingkat ?? 'prodi'} onChange={(e) => setNa('prestasi', { ...form.nonAkademik.prestasi, tingkat: e.target.value })} style={{ ...inputStyle, fontSize: 12.5, padding: '9px 10px' }}>
                        {TINGKAT_ENUM.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <BuktiUploadField npm={selectedNpm} label="Prestasi" value={form.nonAkademik.prestasi.bukti} onChange={(url) => setNa('prestasi', { ...form.nonAkademik.prestasi, bukti: url })} uploadFn={(f) => uploadBuktiFilePublic(token, selectedNpm, 'Prestasi', f)} />
                    </>
                  )}
                </div>
              </div>
            </Card>

            {showSkripsi && (
              <Card>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Skripsi</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Tahap</label>
                    <select value={form.skripsi.tahap} onChange={(e) => set('skripsi', { ...form.skripsi, tahap: e.target.value })} style={inputStyle}>
                      {TAHAP_ENUM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Kendala (opsional)</label>
                    <input value={form.skripsi.kendala} onChange={(e) => set('skripsi', { ...form.skripsi, kendala: e.target.value })} style={inputStyle} />
                  </div>
                </div>
              </Card>
            )}

            <Card>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Permasalahan &amp; Rekomendasi</span>
              <label style={labelStyle}>Permasalahan</label>
              <textarea value={form.permasalahan} onChange={(e) => set('permasalahan', e.target.value)} rows={3} style={{ ...inputStyle, padding: '10px 12px', marginBottom: 14, resize: 'vertical', fontFamily: 'inherit' }} />
              <label style={labelStyle}>Rekomendasi</label>
              <textarea value={form.rekomendasi} onChange={(e) => set('rekomendasi', e.target.value)} rows={3} style={{ ...inputStyle, padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit' }} />
            </Card>

            {saveErr && (
              <div style={{ background: colors.dangerBg, border: `1px solid ${colors.dangerBorder}`, borderRadius: 12, padding: '11px 16px', fontSize: 12.5, fontWeight: 600, color: colors.danger }}>
                {saveErr}
                {/* Halaman kedaluwarsa (bundel lama masih terbuka di HP saat
                    aplikasi ter-deploy ulang) — beri jalan keluar yang jelas,
                    jangan biarkan mahasiswa buntu dengan pesan teknis. */}
                {/muat ulang|versi lama/i.test(saveErr) && (
                  <button
                    onClick={() => window.location.reload()}
                    style={{ display: 'block', marginTop: 10, padding: '9px 16px', borderRadius: 9, border: 'none', background: colors.danger, color: colors.white, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Muat Ulang Halaman
                  </button>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={kembaliKePilih} style={{ padding: '12px 18px', borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13.5, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button
                onClick={simpan}
                disabled={saving}
                style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, color: colors.white, background: colors.green, cursor: saving ? 'wait' : 'pointer' }}
              >
                {saving ? 'Menyimpan…' : 'Simpan Data'}
              </button>
            </div>
          </>
        )}

        {phase === 'saved' && (
          <div style={{ background: colors.greenSoftBg, border: `1px solid ${colors.greenSoftBorder}`, borderRadius: 14, padding: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Icon path="M5 13l4 4L19 7" size={26} stroke={colors.green} width={2.4} />
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.green, display: 'block' }}>Data berhasil disimpan.</span>
              <span onClick={kembaliKePilih} style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, cursor: 'pointer', textDecoration: 'underline' }}>
                Isi untuk mahasiswa lain
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UkmJenisSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = !!value && (UKM_JENIS_PRESET as readonly string[]).includes(value);
  const [lainnyaMode, setLainnyaMode] = useState(!!value && !isPreset);
  const selectValue = lainnyaMode ? 'lainnya' : isPreset ? value : '';
  return (
    <>
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === 'lainnya') { setLainnyaMode(true); onChange(''); }
          else { setLainnyaMode(false); onChange(e.target.value); }
        }}
        style={{ ...inputStyle, fontSize: 12.5, padding: '9px 10px' }}
      >
        <option value="">Pilih jenis UKM…</option>
        {UKM_JENIS_PRESET.map((j) => <option key={j} value={j}>{j}</option>)}
        <option value="lainnya">Lainnya (ketik)</option>
      </select>
      {lainnyaMode && (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ketik nama UKM" style={{ ...inputStyle, fontSize: 12.5, padding: '9px 10px', marginTop: 8 }} />
      )}
    </>
  );
}

function KonsultasiSection({ entries, onChange }: { entries: KonsultasiEntry[]; onChange: (next: KonsultasiEntry[]) => void }) {
  const [jenis, setJenis] = useState<KonsultasiJenis>('KRS');
  const [jenisLainnya, setJenisLainnya] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const canAdd = keterangan.trim() !== '' && (jenis !== 'lainnya' || jenisLainnya.trim() !== '');

  function tambah() {
    if (!canAdd) return;
    const entry: KonsultasiEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      jenis,
      ...(jenis === 'lainnya' ? { jenisLainnya: jenisLainnya.trim() } : {}),
      keterangan: keterangan.trim(),
    };
    onChange([...entries, entry]);
    setKeterangan('');
    setJenisLainnya('');
  }
  function hapus(id: string) {
    onChange(entries.filter((e) => e.id !== id));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>Riwayat konsultasi</label>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Jumlah konsultasi: {entries.length}</span>
      </div>
      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {entries.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.subtle }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.green, background: colors.greenSoftBg, padding: '3px 8px', borderRadius: 999, flexShrink: 0 }}>
                {konsultasiJenisLabel(e)}
              </span>
              <span style={{ fontSize: 12.5, color: colors.ink, flex: 1 }}>{e.keterangan}</span>
              <span onClick={() => hapus(e.id)} style={{ fontSize: 12, fontWeight: 700, color: colors.danger, cursor: 'pointer', flexShrink: 0 }}>Hapus</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <select value={jenis} onChange={(e) => setJenis(e.target.value as KonsultasiJenis)} style={{ ...inputStyle, width: 130 }}>
          {KONSULTASI_JENIS_PRESET.map((j) => <option key={j} value={j}>{j}</option>)}
          <option value="lainnya">Lainnya…</option>
        </select>
        {jenis === 'lainnya' && (
          <input value={jenisLainnya} onChange={(e) => setJenisLainnya(e.target.value)} placeholder="Jenis konsultasi" style={{ ...inputStyle, width: 150 }} />
        )}
        <input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Keterangan, mis. tanda tangan KRS" style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        <button
          onClick={tambah}
          disabled={!canAdd}
          style={{ padding: '10px 16px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, color: colors.white, background: canAdd ? colors.green : colors.disabled, cursor: canAdd ? 'pointer' : 'not-allowed', flexShrink: 0 }}
        >
          Tambah
        </button>
      </div>
    </div>
  );
}
