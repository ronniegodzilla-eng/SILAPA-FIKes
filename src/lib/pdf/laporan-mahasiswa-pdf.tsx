import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { BlokTtd, type TandaTanganPdf } from './laporan-pdf';

/**
 * Lembar laporan pembimbing akademik PERORANGAN — dokumen milik mahasiswa,
 * bukan potongan laporan dosen. Diunduh sendiri oleh mahasiswa dari halaman
 * isi data mandiri, hanya untuk periode yang sudah disahkan Wakil Dekan I,
 * dan membawa stempel tanda tangan elektronik yang sama dengan laporan
 * dosennya sehingga dapat dipakai sebagai bukti bimbingan.
 */

export interface PdfMahasiswaData {
  npm: string;
  nama: string;
  prodi: string;
  kelas: string;
  angkatan: number;
  semesterKe: number;
  status: string;
  statusLabel: string;

  sksKrs: number | null;
  ipKhs: number | null;
  ipk: number | null;
  mkNilaiDE: string[];
  konsultasi: { jenis: string; keterangan: string; tanggal?: string }[];

  pkkmb: boolean;
  toefl: boolean;
  esq: boolean;
  semkes: { judul: string }[];

  organisasi: string;
  beasiswa: string;
  prestasi: string;
  skripsiTahap: string;
  skripsiKendala: string;

  permasalahan: string;
  rekomendasi: string;

  dosenNama: string;
  wadekNama: string;
  ttdDosen?: TandaTanganPdf | null;
  ttdWadek?: TandaTanganPdf | null;

  periodeLabel: string;
  tanggal: string;
  qrDataUrl: string;
  verifikasiKode: string;
  logoDataUrl: string;
}

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 46, paddingHorizontal: 46, fontSize: 9.5, fontFamily: 'Helvetica', color: '#1B241D' },
  kop: { position: 'relative', justifyContent: 'center', minHeight: 54, borderBottomWidth: 2, borderBottomColor: '#0B6E3C', paddingBottom: 10, marginBottom: 14 },
  kopLogo: { position: 'absolute', left: 0, top: 0, width: 54, height: 54 },
  kopText: { textAlign: 'center' },
  univ: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#073B21' },
  fak: { fontSize: 10.5, marginTop: 1 },
  alamat: { fontSize: 7.5, color: '#5C6B60', marginTop: 2 },

  judul: { fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 2 },
  subJudul: { fontSize: 9, textAlign: 'center', color: '#5C6B60', marginTop: 2, marginBottom: 14 },

  seksi: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#073B21', marginTop: 12, marginBottom: 5 },
  baris: { flexDirection: 'row', marginBottom: 2.5 },
  label: { width: 132, color: '#5C6B60' },
  nilai: { flex: 1 },

  tabel: { borderWidth: 0.7, borderColor: '#C9D6CC', borderRadius: 2 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#DCE6DE' },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', backgroundColor: '#EFF4F0', padding: 4 },
  td: { fontSize: 8.5, padding: 4 },
  kosong: { fontSize: 8.5, padding: 6, color: '#93A398', textAlign: 'center' },

  pengesahan: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  ttdBlock: { width: 190, alignItems: 'center' },
  qrBlock: { alignItems: 'center', width: 120 },
  qr: { width: 62, height: 62 },
  qrCaption: { fontSize: 6.5, color: '#5C6B60', textAlign: 'center', marginTop: 3 },
  footer: { position: 'absolute', bottom: 22, left: 46, right: 46, fontSize: 6.5, color: '#93A398', textAlign: 'center' },
});

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <View style={s.baris}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.nilai}>: {nilai || '—'}</Text>
    </View>
  );
}

const cW = (p: number) => ({ width: `${p}%` } as any);

export function LaporanMahasiswaPdf({ data }: { data: PdfMahasiswaData }) {
  const ya = (v: boolean) => (v ? 'Sudah' : 'Belum');
  // Cuti/non-aktif tidak punya data akademik yang bermakna — bagian itu
  // diganti catatan, bukan ditampilkan sebagai deretan tanda strip.
  const adaAkademik = data.status !== 'cuti' && data.status !== 'non_aktif';

  return (
    <Document title={`Laporan PA — ${data.nama} (${data.npm})`} author="SILAPA-FIKes">
      <Page size="A4" style={s.page}>
        <View style={s.kop} fixed>
          <Image src={data.logoDataUrl} style={s.kopLogo} />
          <View style={s.kopText}>
            <Text style={s.univ}>UNIVERSITAS IBNU SINA</Text>
            <Text style={s.fak}>Fakultas Ilmu Kesehatan (FIKes)</Text>
            <Text style={s.alamat}>Jl. Teuku Umar, Lubuk Baja, Kota Batam, Kepulauan Riau · fikes.uis.ac.id</Text>
          </View>
        </View>

        <Text style={s.judul}>LAPORAN PEMBIMBING AKADEMIK</Text>
        <Text style={s.subJudul}>Periode {data.periodeLabel}</Text>

        <Text style={s.seksi}>A. IDENTITAS MAHASISWA</Text>
        <Baris label="Nama" nilai={data.nama} />
        <Baris label="NPM" nilai={data.npm} />
        <Baris label="Program Studi" nilai={data.prodi} />
        <Baris label="Kelas / Angkatan" nilai={`${data.kelas} / ${data.angkatan}`} />
        <Baris label="Semester" nilai={String(data.semesterKe)} />
        <Baris label="Status" nilai={data.statusLabel} />
        <Baris label="Dosen Pembimbing Akademik" nilai={data.dosenNama} />

        <Text style={s.seksi}>B. AKADEMIK</Text>
        {adaAkademik ? (
          <>
            <Baris label="SKS (KRS)" nilai={data.sksKrs != null ? String(data.sksKrs) : ''} />
            <Baris label="IP Semester (KHS)" nilai={data.ipKhs != null ? data.ipKhs.toFixed(2) : ''} />
            <Baris label="IPK" nilai={data.ipk != null ? data.ipk.toFixed(2) : ''} />
            <Baris label="Mata kuliah nilai D/E" nilai={data.mkNilaiDE.join(', ')} />
          </>
        ) : (
          <Text style={{ fontSize: 8.5, color: '#5C6B60' }}>
            Tidak ada data akademik pada periode ini karena mahasiswa berstatus {data.statusLabel.toLowerCase()}.
          </Text>
        )}

        <Text style={s.seksi}>C. RIWAYAT KONSULTASI ({data.konsultasi.length} kali)</Text>
        <View style={s.tabel}>
          <View style={s.tr}>
            <Text style={[s.th, cW(8)]}>No</Text>
            <Text style={[s.th, cW(26)]}>Jenis</Text>
            <Text style={[s.th, cW(66)]}>Keterangan</Text>
          </View>
          {data.konsultasi.length === 0 ? (
            <Text style={s.kosong}>Belum ada konsultasi yang tercatat pada periode ini.</Text>
          ) : (
            data.konsultasi.map((k, i) => (
              <View style={s.tr} key={`${k.jenis}-${i}`} wrap={false}>
                <Text style={[s.td, cW(8)]}>{i + 1}</Text>
                <Text style={[s.td, cW(26)]}>{k.jenis}</Text>
                <Text style={[s.td, cW(66)]}>{k.keterangan || '—'}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={s.seksi}>D. NON-AKADEMIK &amp; KEGIATAN WAJIB</Text>
        <Baris label="PKKMB" nilai={ya(data.pkkmb)} />
        <Baris label="TOEFL" nilai={ya(data.toefl)} />
        <Baris label="ESQ" nilai={ya(data.esq)} />
        <Baris
          label="Seminar kesehatan"
          nilai={
            data.semkes.length
              ? `${data.semkes.length} kegiatan — ${data.semkes.map((x) => x.judul).filter(Boolean).join('; ') || 'judul belum dilengkapi'}`
              : 'Belum ada'
          }
        />
        <Baris label="Organisasi" nilai={data.organisasi} />
        <Baris label="Beasiswa" nilai={data.beasiswa} />
        <Baris label="Prestasi" nilai={data.prestasi} />

        <Text style={s.seksi}>E. SKRIPSI</Text>
        <Baris label="Tahap" nilai={data.skripsiTahap} />
        <Baris label="Kendala" nilai={data.skripsiKendala} />

        <Text style={s.seksi}>F. CATATAN DOSEN PEMBIMBING AKADEMIK</Text>
        <Baris label="Permasalahan" nilai={data.permasalahan} />
        <Baris label="Rekomendasi" nilai={data.rekomendasi} />

        <View style={s.pengesahan} wrap={false}>
          <View style={s.qrBlock}>
            <Image src={data.qrDataUrl} style={s.qr} />
            <Text style={s.qrCaption}>Verifikasi dokumen{'\n'}{data.verifikasiKode}</Text>
          </View>
          <View style={s.ttdBlock}>
            <Text>Batam, {data.tanggal}</Text>
            <Text style={{ marginTop: 2 }}>Dosen Pembimbing Akademik,</Text>
            <BlokTtd ttd={data.ttdDosen} namaCadangan={data.dosenNama} />
          </View>
          <View style={s.ttdBlock}>
            <Text> </Text>
            <Text style={{ marginTop: 2 }}>Mengesahkan, Wakil Dekan I</Text>
            <BlokTtd ttd={data.ttdWadek} namaCadangan={data.wadekNama || '(  .....................................  )'} />
          </View>
        </View>

        <Text style={s.footer} fixed>
          Dokumen ini di-generate otomatis oleh SILAPA-FIKes. Keaslian pengesahan dapat dicocokkan melalui kode verifikasi di atas.
        </Text>
      </Page>
    </Document>
  );
}
