import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Di bawah ini, isi jawaban disembunyikan — hanya jumlah responden yang tampil.
 * Tidak di-export: berkas route Next.js hanya boleh meng-export handler.
 * Nilainya ikut dikirim ke klien lewat medan `minResponden` pada respons.
 */
const MIN_RESPONDEN = 5;

/**
 * Rekap hasil satu kuesioner — dihitung DI SERVER, bukan di peramban.
 *
 * Tiga alasan, dan ketiganya menentukan:
 *
 * 1. Penyebutnya butuh koleksi `laporan` (siapa saja yang seharusnya mengisi),
 *    yang sengaja tertutup bagi tim evaluasi — isinya memuat permasalahan dan
 *    rekomendasi tentang mahasiswa, jauh melampaui keperluan rekap ini.
 * 2. Dosen PA boleh melihat lingkup bimbingannya sendiri, tapi tidak boleh
 *    menyentuh jawaban perorangan. Menghitung di server berarti data mentahnya
 *    tidak pernah sampai ke peramban dosen sama sekali.
 * 3. Penyamaran sel kecil (< MIN_RESPONDEN) jadi benar-benar penyamaran. Kalau
 *    disaring di peramban, angkanya tetap terkirim dan tinggal dibuka di
 *    panel jaringan.
 *
 * GET ?aktivasiId=…  → rekap satu kuesioner
 */

type Dim = 'dosen' | 'prodi' | 'semester';

export async function GET(req: NextRequest) {
  const caller = await requireRole(req, ['tim_evaluasi', 'wadek1', 'dosen_pa']);
  if (caller instanceof Response) return caller;

  const aktivasiId = req.nextUrl.searchParams.get('aktivasiId');
  if (!aktivasiId) return new Response('aktivasiId wajib diisi.', { status: 400 });

  const db = getAdminDb();
  const aSnap = await db.doc(`kuesionerAktivasi/${aktivasiId}`).get();
  if (!aSnap.exists) return new Response('Kuesioner tidak ditemukan.', { status: 404 });
  const a = aSnap.data() as any;

  // Dosen PA hanya boleh melihat lingkup bimbingannya, dan hanya setelah
  // kuesioner ditutup: selama masih terbuka, angka yang berjalan bisa dipakai
  // menekan mahasiswa yang belum mengisi.
  const sebagaiDosen = !caller.roles.includes('tim_evaluasi') && !caller.roles.includes('wadek1');
  // `?? ` menampung dokumen yang sempat ditulis dengan medan `sasaran` lama.
  // Bila ragu, jatuh ke 'ketat' — salah menutup lebih ringan akibatnya
  // daripada salah membuka penilaian atas seseorang.
  const kerahasiaan: string = a.kerahasiaan ?? (a.sasaran === 'fakultas' ? 'biasa' : 'ketat');
  if (sebagaiDosen) {
    if (kerahasiaan === 'ketat' && a.status !== 'ditutup') {
      // Pesannya tidak menyebut topik tertentu: instrumen bertingkat ketat
      // boleh tentang apa saja, asal menilai perorangan.
      return new Response(
        'Kuesioner ini bertingkat kerahasiaan ketat — hasilnya baru dapat dilihat setelah pengisian ditutup.',
        { status: 423 }
      );
    }
  }

  const [jawabanSnap, laporanSnap] = await Promise.all([
    db.collection('kuesionerJawaban').where('aktivasiId', '==', aktivasiId).get(),
    db.collection('laporan').where('periodeId', '==', a.periodeId).get(),
  ]);

  let jawaban = jawabanSnap.docs.map((d) => d.data() as any);
  let populasi = laporanSnap.docs.map((d) => d.data() as any);
  if (sebagaiDosen) {
    jawaban = jawaban.filter((j) => j.dosenPaUid === caller.uid);
    populasi = populasi.filter((l) => l.dosenPaUid === caller.uid);
  }

  // Nama dosen: dari cap pada jawaban, dilengkapi roster untuk dosen yang
  // belum ada satu pun respondennya (kalau tidak, ia hilang dari rekap
  // justru ketika kepatuhannya nol — persis yang perlu terlihat).
  const namaDosen = new Map<string, string>();
  jawaban.forEach((j) => { if (j.dosenPaUid) namaDosen.set(j.dosenPaUid, j.dosenNama || ''); });
  const subsSnap = await db.collection('submissions').where('periodeId', '==', a.periodeId).get();
  subsSnap.docs.forEach((d) => {
    const s = d.data() as any;
    if (!namaDosen.get(s.dosenUid)) namaDosen.set(s.dosenUid, s.nama ?? '');
  });

  const kunci = (row: any, dim: Dim) =>
    dim === 'dosen' ? String(row.dosenPaUid ?? '') : dim === 'prodi' ? String(row.prodi ?? '') : String(row.semesterKe ?? '');

  function distribusi(dim: Dim) {
    const target = new Map<string, number>();
    populasi.forEach((l) => target.set(kunci(l, dim), (target.get(kunci(l, dim)) ?? 0) + 1));
    const terisi = new Map<string, number>();
    jawaban.forEach((j) => terisi.set(kunci(j, dim), (terisi.get(kunci(j, dim)) ?? 0) + 1));
    return Array.from(target.entries())
      .map(([k, n]) => ({
        kunci: k,
        label: dim === 'dosen' ? (namaDosen.get(k) || '(tanpa dosen PA)') : dim === 'semester' ? `Semester ${k}` : k,
        target: n,
        terisi: terisi.get(k) ?? 0,
        persen: n ? Math.round(((terisi.get(k) ?? 0) / n) * 100) : 0,
      }))
      .sort((x, y) =>
        dim === 'semester' ? Number(x.kunci) - Number(y.kunci) : y.terisi - x.terisi || x.label.localeCompare(y.label, 'id')
      );
  }

  // Ringkasan tiap pertanyaan. Sel di bawah ambang hanya melaporkan jumlah
  // respondennya — isinya ditahan di server, tidak ikut terkirim.
  const pertanyaan = Array.isArray(a.pertanyaan) ? a.pertanyaan : [];
  const cukup = jawaban.length >= MIN_RESPONDEN;
  const hasil = pertanyaan.map((p: any) => {
    const nilai = jawaban.map((j) => j.jawaban?.[p.id]).filter((v) => v !== undefined && v !== null && v !== '');
    if (!cukup) return { id: p.id, teks: p.teks, jenis: p.jenis, n: nilai.length, ditahan: true };
    if (p.jenis === 'skala') {
      const angka = nilai.map(Number).filter((v) => Number.isFinite(v));
      const sebaran: Record<string, number> = {};
      angka.forEach((v) => { sebaran[String(v)] = (sebaran[String(v)] ?? 0) + 1; });
      return {
        id: p.id, teks: p.teks, jenis: p.jenis, n: angka.length, ditahan: false,
        skalaMaks: p.skalaMaks ?? 5,
        rata: angka.length ? Number((angka.reduce((s, v) => s + v, 0) / angka.length).toFixed(2)) : null,
        sebaran,
      };
    }
    if (p.jenis === 'pilihan') {
      const sebaran: Record<string, number> = {};
      nilai.forEach((v) => { sebaran[String(v)] = (sebaran[String(v)] ?? 0) + 1; });
      return { id: p.id, teks: p.teks, jenis: p.jenis, n: nilai.length, ditahan: false, sebaran };
    }
    // Isian bebas: teksnya dikembalikan tanpa identitas apa pun.
    return { id: p.id, teks: p.teks, jenis: p.jenis, n: nilai.length, ditahan: false, teksJawaban: nilai.map(String) };
  });

  return Response.json({
    aktivasi: { id: aktivasiId, judul: a.judul, topik: a.topik ?? '', kerahasiaan, status: a.status, wajib: !!a.wajib, periodeId: a.periodeId },
    lingkup: sebagaiDosen ? 'bimbingan' : 'fakultas',
    minResponden: MIN_RESPONDEN,
    ringkas: {
      target: populasi.length,
      terisi: jawaban.length,
      persen: populasi.length ? Math.round((jawaban.length / populasi.length) * 100) : 0,
    },
    distribusi: { dosen: distribusi('dosen'), prodi: distribusi('prodi'), semester: distribusi('semester') },
    hasil,
  });
}
