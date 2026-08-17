import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  StyleSheet,
} from '@react-pdf/renderer';

/**
 * PDF "Laporan Pembimbing Akademik" per dosen (PRD §5.4 W3):
 * kop FIKes UIS, identitas dosen, tabel Akademik + Non-Akademik +
 * Non-Aktif/Cuti (setara FORMAT LAPORAN PA), pengesahan + QR verifikasi.
 */

export interface PdfLaporanRow {
  npm: string;
  nama: string;
  semesterKe: number;
  status: string;
  sksKrs: number | null;
  ipKhs: number | null;
  /** IPK kumulatif (kolom terpisah dari IP semester). */
  ipk?: number | null;
  jumlahKonsultasi: number;
  mkNilaiDE: string[];
  organisasi: string; // "UKM, HIMA" | "—"
  beasiswa: string;
  prestasi: string;
  pkkmb: boolean;
  toefl: boolean;
  esq: boolean;
  semkesCount: number;
  permasalahan: string;
  rekomendasi: string;
  /** Dosen merekomendasikan mahasiswa non-aktif ini untuk DO (drop out). */
  rekomendasiDO?: boolean;
  /** Link bukti (opsional) — kalau ada, sel terkait di tabel B jadi bisa diklik. */
  organisasiBukti?: string;
  beasiswaBukti?: string;
  prestasiBukti?: string;
  pkkmbBukti?: string;
  toeflBukti?: string;
  esqBukti?: string;
}

export interface PdfLaporanData {
  dosenNama: string;
  dosenProdi: string;
  /** Nama Wakil Dekan I yang mengesahkan — diambil dari akun ber-peran
   * wadek1 yang aktif. Kosong bila belum ada, dan sengaja TIDAK diisi nama
   * contoh: dokumen bertanda tangan tidak boleh memuat nama karangan. */
  wadekNama?: string;
  periodeLabel: string;
  rows: PdfLaporanRow[];
  qrDataUrl: string;
  verifikasiKode: string;
  logoDataUrl: string;
  tanggal: string;
}

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 42, fontSize: 8.5, fontFamily: 'Helvetica', color: '#1B241D' },
  // Kop: logo dipaku di kiri secara absolut, teksnya rata tengah terhadap
  // SELURUH lebar konten. Kalau logo ikut alur flex, "tengah" jadi tengahnya
  // sisa ruang di sebelah logo — miring ke kanan, tidak sejajar isi halaman.
  kop: { position: 'relative', justifyContent: 'center', minHeight: 54, borderBottomWidth: 2, borderBottomColor: '#0B6E3C', paddingBottom: 10, marginBottom: 14 },
  kopLogo: { position: 'absolute', left: 0, top: 0, width: 54, height: 54 },
  kopText: { textAlign: 'center' },
  univ: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#073B21' },
  fak: { fontSize: 10.5, marginTop: 1 },
  alamat: { fontSize: 7.5, color: '#5C6B60', marginTop: 2 },
  title: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 2 },
  subtitle: { fontSize: 9, textAlign: 'center', color: '#5C6B60', marginBottom: 12 },
  ident: { marginBottom: 12, gap: 2 },
  identRow: { flexDirection: 'row' },
  identLabel: { width: 110, fontFamily: 'Helvetica-Bold' },
  section: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', backgroundColor: '#E5F3EA', color: '#073B21', padding: 4, marginTop: 10, marginBottom: 4 },
  table: { borderWidth: 0.75, borderColor: '#9AA79E' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#C7D2C1', minHeight: 14, alignItems: 'stretch' },
  th: { fontFamily: 'Helvetica-Bold', backgroundColor: '#F5F7F1', padding: 3 },
  td: { padding: 3 },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },
  buktiLink: { color: '#0B6E3C', textDecoration: 'underline' },
  pengesahan: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  ttdBlock: { width: 180, alignItems: 'center' },
  ttdSpace: { height: 52 },
  qrBlock: { alignItems: 'center', width: 130 },
  qr: { width: 64, height: 64 },
  qrCaption: { fontSize: 6.5, color: '#5C6B60', textAlign: 'center', marginTop: 3 },
  footer: { position: 'absolute', bottom: 24, left: 42, right: 42, fontSize: 7, color: '#93A398', textAlign: 'center' },
});

function cW(w: number) {
  return { width: `${w}%` } as const;
}

function ya(v: boolean) {
  return v ? 'Sudah' : 'Belum';
}

/** Teks biasa, atau link yang bisa diklik ke bukti (Drive) bila tersedia. */
function CellText({ style, bukti, children }: { style: any; bukti?: string; children: string }) {
  if (bukti) {
    return (
      <Link src={bukti} style={[style, s.buktiLink]}>
        {children}
      </Link>
    );
  }
  return <Text style={style}>{children}</Text>;
}

export function LaporanPdf({ data }: { data: PdfLaporanData }) {
  const aktif = data.rows.filter((r) => r.status === 'aktif' || r.status === 'lulus');
  const nonAktif = data.rows.filter((r) => r.status === 'cuti' || r.status === 'non_aktif');

  return (
    <Document title={`Laporan PA — ${data.dosenNama}`} author="SILAPA-FIKes">
      <Page size="A4" orientation="landscape" style={s.page}>
        {/* Kop */}
        <View style={s.kop} fixed>
          <Image src={data.logoDataUrl} style={s.kopLogo} />
          <View style={s.kopText}>
            <Text style={s.univ}>UNIVERSITAS IBNU SINA</Text>
            <Text style={s.fak}>Fakultas Ilmu Kesehatan (FIKes)</Text>
            <Text style={s.alamat}>Jl. Teuku Umar, Lubuk Baja, Kota Batam, Kepulauan Riau · fikes.uis.ac.id</Text>
          </View>
        </View>

        <Text style={s.title}>LAPORAN PEMBIMBING AKADEMIK</Text>
        <Text style={s.subtitle}>Periode {data.periodeLabel}</Text>

        {/* Identitas */}
        <View style={s.ident}>
          <View style={s.identRow}><Text style={s.identLabel}>Dosen PA</Text><Text>: {data.dosenNama}</Text></View>
          <View style={s.identRow}><Text style={s.identLabel}>Prodi Homebase</Text><Text>: {data.dosenProdi}</Text></View>
          <View style={s.identRow}><Text style={s.identLabel}>Jumlah Bimbingan</Text><Text>: {data.rows.length} mahasiswa</Text></View>
        </View>

        {/* A. Akademik */}
        <Text style={s.section}>A. AKADEMIK</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, cW(4), s.center]}>No</Text>
            <Text style={[s.th, cW(14)]}>NPM</Text>
            <Text style={[s.th, cW(24)]}>Nama</Text>
            <Text style={[s.th, cW(6), s.center]}>Smt</Text>
            <Text style={[s.th, cW(7), s.center]}>SKS</Text>
            <Text style={[s.th, cW(7), s.center]}>IP</Text>
            <Text style={[s.th, cW(7), s.center]}>IPK</Text>
            <Text style={[s.th, cW(8), s.center]}>Konsul</Text>
            <Text style={[s.th, cW(23)]}>MK Nilai D/E</Text>
          </View>
          {aktif.map((r, i) => (
            <View style={s.tr} key={r.npm} wrap={false}>
              <Text style={[s.td, cW(4), s.center]}>{i + 1}</Text>
              <Text style={[s.td, cW(14)]}>{r.npm}</Text>
              <Text style={[s.td, cW(24)]}>{r.nama}</Text>
              <Text style={[s.td, cW(6), s.center]}>{r.semesterKe}</Text>
              <Text style={[s.td, cW(7), s.center]}>{r.sksKrs ?? '—'}</Text>
              <Text style={[s.td, cW(7), s.center]}>{r.ipKhs != null ? r.ipKhs.toFixed(2) : '—'}</Text>
              <Text style={[s.td, cW(7), s.center]}>{r.ipk != null ? r.ipk.toFixed(2) : '—'}</Text>
              <Text style={[s.td, cW(8), s.center]}>{r.jumlahKonsultasi}</Text>
              <Text style={[s.td, cW(23)]}>{r.mkNilaiDE.length ? r.mkNilaiDE.join(', ') : '—'}</Text>
            </View>
          ))}
        </View>

        {/* B. Non-Akademik */}
        <Text style={s.section}>
          B. NON-AKADEMIK{'   '}
          <Text style={{ fontFamily: 'Helvetica', fontSize: 7, color: '#5C6B60' }}>
            (teks bergaris bawah hijau = ada bukti terlampir, klik untuk membuka)
          </Text>
        </Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, cW(4), s.center]}>No</Text>
            <Text style={[s.th, cW(14)]}>NPM</Text>
            <Text style={[s.th, cW(20)]}>Nama</Text>
            <Text style={[s.th, cW(13)]}>Organisasi</Text>
            <Text style={[s.th, cW(13)]}>Beasiswa</Text>
            <Text style={[s.th, cW(16)]}>Prestasi</Text>
            <Text style={[s.th, cW(6), s.center]}>PKKMB</Text>
            <Text style={[s.th, cW(6), s.center]}>TOEFL</Text>
            <Text style={[s.th, cW(4), s.center]}>ESQ</Text>
            <Text style={[s.th, cW(4), s.center]}>Smk</Text>
          </View>
          {aktif.map((r, i) => (
            <View style={s.tr} key={r.npm} wrap={false}>
              <Text style={[s.td, cW(4), s.center]}>{i + 1}</Text>
              <Text style={[s.td, cW(14)]}>{r.npm}</Text>
              <Text style={[s.td, cW(20)]}>{r.nama}</Text>
              <CellText style={[s.td, cW(13)]} bukti={r.organisasiBukti}>{r.organisasi}</CellText>
              <CellText style={[s.td, cW(13)]} bukti={r.beasiswaBukti}>{r.beasiswa}</CellText>
              <CellText style={[s.td, cW(16)]} bukti={r.prestasiBukti}>{r.prestasi}</CellText>
              <CellText style={[s.td, cW(6), s.center]} bukti={r.pkkmbBukti}>{ya(r.pkkmb)}</CellText>
              <CellText style={[s.td, cW(6), s.center]} bukti={r.toeflBukti}>{ya(r.toefl)}</CellText>
              <CellText style={[s.td, cW(4), s.center]} bukti={r.esqBukti}>{ya(r.esq)}</CellText>
              <Text style={[s.td, cW(4), s.center]}>{r.semkesCount}</Text>
            </View>
          ))}
        </View>

        {/* C. Non-Aktif / Cuti */}
        <Text style={s.section}>
          C. NON-AKTIF / CUTI{'   '}
          <Text style={{ fontFamily: 'Helvetica', fontSize: 7, color: '#5C6B60' }}>
            (Rek. DO = direkomendasikan dosen PA untuk drop out; hanya berlaku bagi mahasiswa non-aktif)
          </Text>
        </Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, cW(4), s.center]}>No</Text>
            <Text style={[s.th, cW(13)]}>NPM</Text>
            <Text style={[s.th, cW(18)]}>Nama</Text>
            <Text style={[s.th, cW(9), s.center]}>Status</Text>
            <Text style={[s.th, cW(8), s.center]}>Rek. DO</Text>
            <Text style={[s.th, cW(24)]}>Permasalahan</Text>
            <Text style={[s.th, cW(24)]}>Rekomendasi</Text>
          </View>
          {nonAktif.length === 0 ? (
            <View style={s.tr}>
              <Text style={[s.td, cW(100), s.center, { color: '#93A398' }]}>Tidak ada mahasiswa non-aktif/cuti pada periode ini.</Text>
            </View>
          ) : (
            nonAktif.map((r, i) => (
              <View style={s.tr} key={r.npm} wrap={false}>
                <Text style={[s.td, cW(4), s.center]}>{i + 1}</Text>
                <Text style={[s.td, cW(13)]}>{r.npm}</Text>
                <Text style={[s.td, cW(18)]}>{r.nama}</Text>
                <Text style={[s.td, cW(9), s.center]}>{r.status === 'cuti' ? 'Cuti' : 'Non-aktif'}</Text>
                <Text style={[s.td, cW(8), s.center, r.rekomendasiDO ? { color: '#B0453A', fontFamily: 'Helvetica-Bold' } : {}]}>
                  {r.rekomendasiDO ? 'YA' : '—'}
                </Text>
                <Text style={[s.td, cW(24)]}>{r.permasalahan || '—'}</Text>
                <Text style={[s.td, cW(24)]}>{r.rekomendasi || '—'}</Text>
              </View>
            ))
          )}
        </View>

        {/* Pengesahan + QR */}
        <View style={s.pengesahan} wrap={false}>
          <View style={s.qrBlock}>
            <Image src={data.qrDataUrl} style={s.qr} />
            <Text style={s.qrCaption}>Verifikasi dokumen{'\n'}{data.verifikasiKode}</Text>
          </View>
          <View style={s.ttdBlock}>
            <Text>Batam, {data.tanggal}</Text>
            <Text style={{ marginTop: 2 }}>Dosen Pembimbing Akademik,</Text>
            <View style={s.ttdSpace} />
            <Text style={{ fontFamily: 'Helvetica-Bold', textDecoration: 'underline' }}>{data.dosenNama}</Text>
          </View>
          <View style={s.ttdBlock}>
            <Text> </Text>
            <Text style={{ marginTop: 2 }}>Mengesahkan, Wakil Dekan I</Text>
            <View style={s.ttdSpace} />
            <Text style={{ fontFamily: 'Helvetica-Bold', textDecoration: 'underline' }}>
              {data.wadekNama || '(  .....................................  )'}
            </Text>
          </View>
        </View>

        <Text style={s.footer} fixed>
          Dokumen ini di-generate otomatis oleh SILAPA-FIKes sebagai bukti mutu (AMI/LAM-PTKes). Rekap dihitung dari data laporan — tidak diinput manual.
        </Text>
      </Page>
    </Document>
  );
}
