'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/lib/data-context';
import { useSetHeader } from '@/components/AppShell';
import { konsultasiJenisLabel, computeSemesterKe } from '@/lib/compute';
import { colors, kelengkapanPill, KELENGKAPAN_LABEL } from '@/lib/theme';
import { Icon, Pill, Card, inputStyle, labelStyle } from '@/components/ui';
import { BuktiUploadField } from '@/components/BuktiUpload';
import { KONSULTASI_JENIS_PRESET, type KonsultasiEntry, type KonsultasiJenis } from '@/lib/types';

export default function FormLaporanPage() {
  const params = useParams<{ npm: string }>();
  const npm = params.npm;
  const router = useRouter();
  const { records, updateField, saveStatus, periode } = useData();
  const rec = records[npm];

  useSetHeader('Form Laporan Mahasiswa', rec ? `${rec.nama} — NPM ${rec.npm}` : '');

  if (!rec) {
    return <div style={{ fontSize: 13, color: colors.muted }}>Data mahasiswa tidak ditemukan.</div>;
  }

  const showAkademik = rec.status !== 'cuti' && rec.status !== 'non_aktif';
  const showSkripsi = showAkademik && rec.semesterKe >= 7;
  const kp = kelengkapanPill(rec.statusPengisian);
  const set = (path: string, value: unknown) => updateField(npm, path, value);

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div onClick={() => router.push('/dosen/bimbingan')} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: colors.green, cursor: 'pointer' }}>
          <Icon path="M15 6l-6 6 6 6" size={15} width={2} />
          Kembali ke Daftar Bimbingan
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background:
                saveStatus === 'error' ? colors.danger
                : saveStatus === 'saving' ? colors.amber
                : colors.green,
            }}
          />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: saveStatus === 'error' ? colors.danger : colors.muted }}>
            {saveStatus === 'error'
              ? 'Gagal menyimpan — periksa koneksi, lalu ubah field untuk mencoba lagi'
              : saveStatus === 'saving' ? 'Menyimpan…' : 'Tersimpan'}
          </span>
        </div>
      </div>

      {/* identity + riwayat */}
      <Card padding="20px 24px" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 19, fontWeight: 700, color: colors.ink }}>{rec.nama}</div>
          <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>NPM {rec.npm} · {rec.prodi} · Kelas {rec.kelas} · Semester</span>
            <input
              type="number"
              min={1}
              max={20}
              value={rec.semesterKe}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                set('semesterKe', v);
                set('semesterKeManual', true);
              }}
              title="Koreksi manual semester bila hitungan otomatis tidak sesuai (mis. cuti belum tercatat, atau skema S2KM)"
              style={{ width: 44, padding: '2px 6px', borderRadius: 6, border: `1px solid ${colors.border}`, fontSize: 12.5, textAlign: 'center' }}
            />
            {rec.semesterKeManual && (
              <>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.amberText, background: colors.amberBg, padding: '2px 8px', borderRadius: 999 }}>
                  disesuaikan manual
                </span>
                <span
                  onClick={() => {
                    if (!periode) return;
                    const auto = computeSemesterKe(rec.angkatan, Number(periode.tahunAkademik.split('/')[0]), periode.semester);
                    set('semesterKe', auto);
                    set('semesterKeManual', false);
                  }}
                  style={{ fontSize: 11, fontWeight: 700, color: colors.green, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Kembalikan otomatis
                </span>
              </>
            )}
          </div>
        </div>
        <div onClick={() => router.push(`/dosen/mahasiswa/${npm}/riwayat`)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 9, border: `1px solid ${colors.border}`, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: colors.ink }}>
          <Icon path="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l4 2" size={15} />
          Lihat Riwayat
        </div>
      </Card>

      {/* status & once-per-degree */}
      <Card padding="20px 24px">
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>
          Status &amp; data sekali-seumur-kuliah
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14, alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Status mahasiswa</label>
            <select value={rec.status} onChange={(e) => set('status', e.target.value)} style={inputStyle}>
              <option value="aktif">Aktif</option>
              <option value="cuti">Cuti</option>
              <option value="non_aktif">Non-aktif</option>
              <option value="lulus">Lulus</option>
            </select>
          </div>
          <div>
            <CheckField label="PKKMB" checked={rec.pkkmb} onChange={(v) => set('pkkmb', v)} />
            <BuktiUploadField npm={npm} label="PKKMB" value={rec.pkkmbBukti} onChange={(url) => set('pkkmbBukti', url)} />
          </div>
          <div>
            <CheckField label="TOEFL" checked={rec.toefl} onChange={(v) => set('toefl', v)} />
            <BuktiUploadField npm={npm} label="TOEFL" value={rec.toeflBukti} onChange={(url) => set('toeflBukti', url)} />
          </div>
          <div>
            <CheckField label="ESQ" checked={rec.esq} onChange={(v) => set('esq', v)} />
            <BuktiUploadField npm={npm} label="ESQ" value={rec.esqBukti} onChange={(url) => set('esqBukti', url)} />
          </div>
          <div>
            <label style={labelStyle}>Semkes diikuti (target 8)</label>
            <input type="number" value={rec.semkesCount} onChange={(e) => set('semkesCount', Number(e.target.value))} style={inputStyle} />
          </div>
        </div>
      </Card>

      {showAkademik && (
        <>
          <Card padding="20px 24px">
            <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Akademik</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>SKS (KRS)</label>
                <input type="number" value={rec.akademik.sksKrs ?? ''} onChange={(e) => set('akademik.sksKrs', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>IP (KHS)</label>
                <input type="number" step="0.01" min={0} max={4} value={rec.akademik.ipKhs ?? ''} onChange={(e) => set('akademik.ipKhs', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
              </div>
            </div>

            <KonsultasiSection entries={rec.akademik.konsultasi} onChange={(next) => set('akademik.konsultasi', next)} />

            <label style={{ ...labelStyle, marginTop: 18 }}>Mata kuliah bernilai D/E (pisahkan dengan koma)</label>
            <input
              value={rec.akademik.mkNilaiDE.join(', ')}
              onChange={(e) => set('akademik.mkNilaiDE', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
              placeholder="Contoh: Biokimia, Farmakologi Dasar"
              style={inputStyle}
            />
          </Card>

          <Card padding="20px 24px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>Non-Akademik</span>
              <span
                title="Definisi 'aktif organisasi' (UKM/HIMA/BEM) menurut kebijakan FIKes: tercatat sebagai anggota atau pengurus organisasi tersebut pada periode berjalan (PRD §7.2 — definisi resmi ditetapkan bersama Wakil Dekan I sebelum periode pertama)."
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', background: colors.subtle, color: colors.muted, fontSize: 10, fontWeight: 700, cursor: 'help' }}
              >
                ?
              </span>
            </div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 4, flexWrap: 'wrap' }}>
              <CheckInline label="UKM" checked={rec.nonAkademik.ukm} onChange={(v) => set('nonAkademik.ukm', v)} />
              <CheckInline label="HIMA" checked={rec.nonAkademik.hima} onChange={(v) => set('nonAkademik.hima', v)} />
              <CheckInline label="BEM" checked={rec.nonAkademik.bem} onChange={(v) => set('nonAkademik.bem', v)} />
            </div>
            {(rec.nonAkademik.ukm || rec.nonAkademik.hima || rec.nonAkademik.bem) && (
              <BuktiUploadField npm={npm} label="Organisasi" value={rec.nonAkademik.organisasiBukti} onChange={(url) => set('nonAkademik.organisasiBukti', url)} />
            )}
            <div style={{ marginBottom: 12 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>
                  <input type="checkbox" checked={rec.nonAkademik.beasiswa.ada} onChange={(e) => set('nonAkademik.beasiswa.ada', e.target.checked)} /> Penerima beasiswa
                </label>
                {rec.nonAkademik.beasiswa.ada && (
                  <>
                    <select value={rec.nonAkademik.beasiswa.jenis ?? 'KIP'} onChange={(e) => set('nonAkademik.beasiswa.jenis', e.target.value)} style={{ ...inputStyle, fontSize: 12.5, padding: '9px 10px' }}>
                      <option value="KIP">KIP</option>
                      <option value="UKT Kemendiktisaintek">UKT Kemendiktisaintek</option>
                      <option value="Yayasan">Yayasan</option>
                      <option value="Prestasi">Prestasi</option>
                      <option value="lainnya">Lainnya</option>
                    </select>
                    <BuktiUploadField npm={npm} label="Beasiswa" value={rec.nonAkademik.beasiswa.bukti} onChange={(url) => set('nonAkademik.beasiswa.bukti', url)} />
                  </>
                )}
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>
                  <input type="checkbox" checked={rec.nonAkademik.prestasi.ada} onChange={(e) => set('nonAkademik.prestasi.ada', e.target.checked)} /> Meraih prestasi
                </label>
                {rec.nonAkademik.prestasi.ada && (
                  <>
                    <input value={rec.nonAkademik.prestasi.jenis ?? ''} onChange={(e) => set('nonAkademik.prestasi.jenis', e.target.value)} placeholder="Nama prestasi" style={{ ...inputStyle, fontSize: 12.5, padding: '9px 10px', marginBottom: 8 }} />
                    <select value={rec.nonAkademik.prestasi.tingkat ?? 'prodi'} onChange={(e) => set('nonAkademik.prestasi.tingkat', e.target.value)} style={{ ...inputStyle, fontSize: 12.5, padding: '9px 10px' }}>
                      <option value="prodi">Prodi</option>
                      <option value="fakultas">Fakultas</option>
                      <option value="universitas">Universitas</option>
                      <option value="kota">Kota</option>
                      <option value="provinsi">Provinsi</option>
                      <option value="nasional">Nasional</option>
                      <option value="internasional">Internasional</option>
                    </select>
                    <BuktiUploadField npm={npm} label="Prestasi" value={rec.nonAkademik.prestasi.bukti} onChange={(url) => set('nonAkademik.prestasi.bukti', url)} />
                  </>
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      {showSkripsi && (
        <Card padding="20px 24px">
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Skripsi</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Tahap</label>
              <select value={rec.skripsi.tahap} onChange={(e) => set('skripsi.tahap', e.target.value)} style={inputStyle}>
                <option value="belum">Belum mulai</option>
                <option value="pengajuan_judul">Pengajuan judul</option>
                <option value="acc_judul">ACC judul</option>
                <option value="bimbingan_proposal">Bimbingan proposal</option>
                <option value="sempro">Seminar proposal</option>
                <option value="penelitian">Penelitian</option>
                <option value="bimbingan_skripsi">Bimbingan skripsi</option>
                <option value="sidang">Sidang</option>
                <option value="lulus">Lulus</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Kendala (opsional)</label>
              <input value={rec.skripsi.kendala} onChange={(e) => set('skripsi.kendala', e.target.value)} style={inputStyle} />
            </div>
          </div>
        </Card>
      )}

      <Card padding="20px 24px">
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Permasalahan &amp; Rekomendasi</span>
        <label style={labelStyle}>Permasalahan</label>
        <textarea value={rec.permasalahan} onChange={(e) => set('permasalahan', e.target.value)} rows={3} style={{ ...inputStyle, padding: '10px 12px', marginBottom: 14, resize: 'vertical', fontFamily: 'inherit' }} />
        <label style={labelStyle}>Rekomendasi</label>
        <textarea value={rec.rekomendasi} onChange={(e) => set('rekomendasi', e.target.value)} rows={3} style={{ ...inputStyle, padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <Pill label={KELENGKAPAN_LABEL[rec.statusPengisian]} color={kp.color} bg={kp.bg} />
        </div>
      </Card>
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

function CheckInline({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

/**
 * Riwayat konsultasi — dosen menambah entri (jenis + keterangan) satu per
 * satu; "jumlah konsultasi" adalah panjang daftar ini, tidak pernah diketik
 * langsung (PRD P1).
 */
function KonsultasiSection({
  entries,
  onChange,
}: {
  entries: KonsultasiEntry[];
  onChange: (next: KonsultasiEntry[]) => void;
}) {
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
        <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>
          Jumlah konsultasi: {entries.length}
        </span>
      </div>

      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {entries.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.subtle,
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.green, background: colors.greenSoftBg, padding: '3px 8px', borderRadius: 999, flexShrink: 0 }}>
                {konsultasiJenisLabel(e)}
              </span>
              <span style={{ fontSize: 12.5, color: colors.ink, flex: 1 }}>{e.keterangan}</span>
              <span onClick={() => hapus(e.id)} title="Hapus entri" style={{ fontSize: 12, fontWeight: 700, color: colors.danger, cursor: 'pointer', flexShrink: 0 }}>
                Hapus
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <select
          value={jenis}
          onChange={(e) => setJenis(e.target.value as KonsultasiJenis)}
          style={{ ...inputStyle, width: 130 }}
        >
          {KONSULTASI_JENIS_PRESET.map((j) => (
            <option key={j} value={j}>{j}</option>
          ))}
          <option value="lainnya">Lainnya…</option>
        </select>
        {jenis === 'lainnya' && (
          <input
            value={jenisLainnya}
            onChange={(e) => setJenisLainnya(e.target.value)}
            placeholder="Jenis konsultasi"
            style={{ ...inputStyle, width: 150 }}
          />
        )}
        <input
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder="Keterangan, mis. tanda tangan KRS"
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <button
          onClick={tambah}
          disabled={!canAdd}
          style={{
            padding: '10px 16px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700,
            color: colors.white, background: canAdd ? colors.green : colors.disabled,
            cursor: canAdd ? 'pointer' : 'not-allowed', flexShrink: 0,
          }}
        >
          Tambah
        </button>
      </div>
    </div>
  );
}
