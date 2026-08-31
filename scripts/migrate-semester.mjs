/**
 * Sesuaikan `semesterKe` pada laporan periode berjalan ke rumus baru.
 *
 * Rumus lama menulis semester yang SEDANG berjalan; yang baru menulis semester
 * berikutnya, sesuai kenyataan bahwa laporan disusun di awal semester
 * berikutnya dan memuat KRS semester depan. Akibat rumus lama, mahasiswa baru
 * bahkan tidak punya nomor semester (0), dan sebagian tertulis 2 karena dulu
 * dipatok begitu saat ditambahkan.
 *
 * TIDAK menyentuh:
 *  - laporan yang semesterKe-nya disetel manual dosen PA (semesterKeManual),
 *  - laporan dosen yang sudah dikirim/disahkan — dokumen bertanda tangan tidak
 *    boleh berubah isinya; Wakil Dekan I harus mengembalikannya lebih dulu,
 *  - field apa pun selain semesterKe — SKS, IP, konsultasi, rekomendasi, dan
 *    seluruh isian dosen tetap sebagaimana adanya.
 *
 * Jalankan uji-coba dulu (tanpa menulis):
 *   node scripts/migrate-semester.mjs
 * Lalu betulan:
 *   node scripts/migrate-semester.mjs --tulis
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const akarProyek = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kunci = JSON.parse(readFileSync(resolve(akarProyek, 'serviceAccountKey.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(kunci) });
const db = admin.firestore();

const TULIS = process.argv.includes('--tulis');

/** Harus sama persis dengan computeSemesterKe di src/lib/compute.ts. */
const hitung = (angkatan, tahunAwal, semester) =>
  (tahunAwal - angkatan) * 2 + (semester === 'genap' ? 3 : 2);

const main = async () => {
  const periodeSnap = await db.collection('periode').get();
  const periodes = periodeSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.id.localeCompare(a.id));
  const aktif = periodes.find((p) => p.status !== 'dikunci') ?? periodes[0];
  if (!aktif) throw new Error('Tidak ada periode.');
  const tahunAwal = Number(String(aktif.tahunAkademik).split('/')[0]);

  console.log(`Periode: ${aktif.id} (${aktif.tahunAkademik} ${aktif.semester}) — ${TULIS ? 'MENULIS' : 'UJI-COBA, tidak menulis'}\n`);

  const [lapSnap, mhsSnap, subSnap] = await Promise.all([
    db.collection('laporan').where('periodeId', '==', aktif.id).get(),
    db.collection('mahasiswa').get(),
    db.collection('submissions').where('periodeId', '==', aktif.id).get(),
  ]);
  const angkatanOf = new Map(mhsSnap.docs.map((d) => [d.data().npm, d.data().angkatan]));
  // Laporan yang sudah ditandatangani dosen (dikirim) atau disahkan Wakil
  // Dekan I dibekukan — mengubahnya membuat tanda tangan tidak lagi cocok
  // dengan isi dokumen.
  const dosenBeku = new Set(
    subSnap.docs
      .map((d) => d.data())
      .filter((s) => ['dikirim', 'diverifikasi'].includes(s.status))
      .map((s) => s.dosenUid)
  );

  let manual = 0, sudahBenar = 0, tanpaAngkatan = 0, beku = 0;
  const perubahan = [];

  for (const doc of lapSnap.docs) {
    const l = doc.data();
    if (l.semesterKeManual === true) { manual++; continue; }
    if (dosenBeku.has(l.dosenPaUid)) { beku++; continue; }
    const angkatan = angkatanOf.get(l.npm);
    if (!Number.isInteger(angkatan)) { tanpaAngkatan++; continue; }
    const baru = hitung(angkatan, tahunAwal, aktif.semester);
    if (l.semesterKe === baru) { sudahBenar++; continue; }
    perubahan.push({ ref: doc.ref, npm: l.npm, angkatan, dari: l.semesterKe ?? null, ke: baru });
  }

  const ringkas = {};
  perubahan.forEach((p) => {
    const k = `angkatan ${p.angkatan}: ${p.dari} → ${p.ke}`;
    ringkas[k] = (ringkas[k] ?? 0) + 1;
  });
  Object.entries(ringkas).sort().forEach(([k, n]) => console.log(`  ${k.padEnd(34)} ${n} laporan`));

  console.log(`\n  akan diubah        : ${perubahan.length}`);
  console.log(`  sudah sesuai       : ${sudahBenar}`);
  console.log(`  disetel manual dosen (dilewati) : ${manual}`);
  if (beku) console.log(`  laporan sudah dikirim/disahkan (dilewati) : ${beku}`);
  if (tanpaAngkatan) console.log(`  tanpa data angkatan (dilewati)  : ${tanpaAngkatan}`);

  if (!TULIS) {
    console.log('\nUji-coba selesai. Jalankan dengan --tulis untuk menerapkan.');
    return;
  }

  // Batch Firestore maksimal 500 operasi.
  for (let i = 0; i < perubahan.length; i += 400) {
    const batch = db.batch();
    perubahan.slice(i, i + 400).forEach((p) => batch.update(p.ref, { semesterKe: p.ke }));
    await batch.commit();
    console.log(`  tersimpan ${Math.min(i + 400, perubahan.length)}/${perubahan.length}`);
  }
  console.log('\nSelesai.');
};

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
