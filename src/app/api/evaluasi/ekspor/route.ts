import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ekspor hasil satu kuesioner.
 *
 * Hanya tim evaluasi dan Wakil Dekan I — dosen PA TIDAK diberi akses ekspor
 * meski boleh melihat dashboard lingkup bimbingannya. Berkas Excel gampang
 * beredar, dan sekali beredar tidak bisa ditarik; sementara nilai kuesioner ini
 * bergantung pada mahasiswa percaya jawabannya tidak akan sampai ke dosennya.
 *
 * Empat sheet:
 *   RINGKASAN        — tingkat pengisian keseluruhan
 *   DISTRIBUSI       — terisi/target/persen per dosen PA, prodi, dan semester
 *   HASIL PER SOAL   — rata-rata dan sebaran jawaban
 *   JAWABAN          — satu baris per responden, TANPA nama dan NPM
 */
export async function GET(req: NextRequest) {
  const caller = await requireRole(req, ['tim_evaluasi', 'wadek1']);
  if (caller instanceof Response) return caller;

  const aktivasiId = req.nextUrl.searchParams.get('aktivasiId');
  if (!aktivasiId) return new Response('aktivasiId wajib diisi.', { status: 400 });

  try {
    const db = getAdminDb();
    const aSnap = await db.doc(`kuesionerAktivasi/${aktivasiId}`).get();
    if (!aSnap.exists) return new Response('Kuesioner tidak ditemukan.', { status: 404 });
    const a = aSnap.data() as any;

    const [jawabanSnap, laporanSnap, subsSnap] = await Promise.all([
      db.collection('kuesionerJawaban').where('aktivasiId', '==', aktivasiId).get(),
      db.collection('laporan').where('periodeId', '==', a.periodeId).get(),
      db.collection('submissions').where('periodeId', '==', a.periodeId).get(),
    ]);
    const jawaban = jawabanSnap.docs.map((d) => d.data() as any);
    const populasi = laporanSnap.docs.map((d) => d.data() as any);
    const namaDosen = new Map<string, string>(subsSnap.docs.map((d) => [(d.data() as any).dosenUid, (d.data() as any).nama]));

    const pertanyaan: any[] = Array.isArray(a.pertanyaan) ? a.pertanyaan : [];

    const dist = (ambil: (r: any) => string, label: (k: string) => string) => {
      const target = new Map<string, number>();
      populasi.forEach((l) => target.set(ambil(l), (target.get(ambil(l)) ?? 0) + 1));
      const terisi = new Map<string, number>();
      jawaban.forEach((j) => terisi.set(ambil(j), (terisi.get(ambil(j)) ?? 0) + 1));
      return Array.from(target.entries())
        .map(([k, n]) => [label(k), terisi.get(k) ?? 0, n, n ? Math.round(((terisi.get(k) ?? 0) / n) * 100) : 0])
        .sort((x, y) => String(x[0]).localeCompare(String(y[0]), 'id'));
    };

    const judulSheet = (t: string, head: string[], rows: any[][]) =>
      XLSX.utils.aoa_to_sheet([
        [t],
        [`${a.judul} · diekspor ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`],
        [],
        head,
        ...rows,
      ]);

    const s1 = judulSheet('RINGKASAN PENGISIAN', ['Keterangan', 'Nilai'], [
      ['Instrumen', a.judul],
      ['Topik yang dinilai', a.topik ?? ''],
      ['Tingkat kerahasiaan', (a.kerahasiaan ?? 'ketat') === 'ketat' ? 'Ketat (menilai perorangan)' : 'Biasa (menilai unit/layanan)'],
      ['Sifat', a.wajib ? 'Wajib' : 'Sukarela'],
      ['Status', a.status],
      ['Sasaran mahasiswa (target)', populasi.length],
      ['Sudah mengisi', jawaban.length],
      ['Persentase', populasi.length ? Math.round((jawaban.length / populasi.length) * 100) : 0],
    ]);

    const s2 = judulSheet('DISTRIBUSI RESPONDEN', ['Dimensi', 'Kelompok', 'Terisi', 'Target', 'Persen'], [
      ...dist((r) => String(r.dosenPaUid ?? ''), (k) => namaDosen.get(k) || '(tanpa dosen PA)').map((r) => ['Dosen PA', ...r]),
      ...dist((r) => String(r.prodi ?? ''), (k) => k || '(tanpa prodi)').map((r) => ['Prodi', ...r]),
      ...dist((r) => String(r.semesterKe ?? ''), (k) => `Semester ${k}`).map((r) => ['Semester', ...r]),
    ]);

    const barisSoal: any[][] = [];
    pertanyaan.forEach((p, i) => {
      const nilai = jawaban.map((j) => j.jawaban?.[p.id]).filter((v) => v !== undefined && v !== null && v !== '');
      if (p.jenis === 'skala') {
        const angka = nilai.map(Number).filter((v) => Number.isFinite(v));
        const rata = angka.length ? Number((angka.reduce((s, v) => s + v, 0) / angka.length).toFixed(2)) : '';
        barisSoal.push([i + 1, p.teks, 'Skala', nilai.length, rata, '']);
        for (let v = 1; v <= (p.skalaMaks ?? 5); v++) {
          barisSoal.push(['', '', '', angka.filter((x) => x === v).length, '', `nilai ${v}`]);
        }
      } else if (p.jenis === 'pilihan') {
        barisSoal.push([i + 1, p.teks, 'Pilihan', nilai.length, '', '']);
        (p.opsi ?? []).filter(Boolean).forEach((o: string) => {
          barisSoal.push(['', '', '', nilai.filter((x) => String(x) === o).length, '', o]);
        });
      } else {
        barisSoal.push([i + 1, p.teks, 'Isian bebas', nilai.length, '', 'lihat sheet JAWABAN']);
      }
    });
    const s3 = judulSheet('HASIL PER PERTANYAAN', ['No', 'Pertanyaan', 'Jenis', 'Jumlah', 'Rata-rata', 'Rincian'], barisSoal);

    // Sheet jawaban sengaja TANPA nama dan NPM: dimensi rekap tetap ada
    // (prodi, semester, dosen PA) sehingga bisa dipilah, tapi tidak ada jalan
    // kembali ke orangnya.
    const headJawab = ['Waktu', 'Prodi', 'Semester', 'Dosen PA', 'Sumber link', ...pertanyaan.map((p, i) => `S${i + 1}`)];
    const barisJawab = jawaban
      .sort((x, y) => (x.submittedAt?.toMillis?.() ?? 0) - (y.submittedAt?.toMillis?.() ?? 0))
      .map((j) => [
        j.submittedAt?.toDate ? j.submittedAt.toDate().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '',
        j.prodi ?? '',
        typeof j.semesterKe === 'number' ? j.semesterKe : '',
        j.dosenNama || namaDosen.get(j.dosenPaUid) || '',
        j.sumberTautan === 'dosen' ? 'Dosen PA' : 'Tim evaluasi',
        ...pertanyaan.map((p) => {
          const v = j.jawaban?.[p.id];
          return v === undefined || v === null ? '' : typeof v === 'number' ? v : String(v);
        }),
      ]);
    const s4 = judulSheet('JAWABAN (TANPA IDENTITAS)', headJawab, barisJawab);

    const lebar = (head: string[]) => head.map((h) => (/pertanyaan|rincian|dosen|keterangan|waktu/i.test(h) ? { wch: 38 } : { wch: 14 }));
    s1['!cols'] = lebar(['Keterangan', 'Nilai']);
    s2['!cols'] = lebar(['Dimensi', 'Kelompok', 'Terisi', 'Target', 'Persen']);
    s3['!cols'] = lebar(['No', 'Pertanyaan', 'Jenis', 'Jumlah', 'Rata-rata', 'Rincian']);
    s4['!cols'] = lebar(headJawab);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, s1, 'RINGKASAN');
    XLSX.utils.book_append_sheet(wb, s2, 'DISTRIBUSI');
    XLSX.utils.book_append_sheet(wb, s3, 'HASIL PER SOAL');
    XLSX.utils.book_append_sheet(wb, s4, 'JAWABAN');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const namaBerkas = `Hasil Kuesioner — ${String(a.judul).replace(/[\\/:*?"<>|]/g, '-')}.xlsx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(namaBerkas)}`,
      },
    });
  } catch (e: any) {
    console.error('Ekspor hasil kuesioner gagal:', e?.message ?? e);
    return new Response('Gagal menyusun berkas ekspor.', { status: 500 });
  }
}
