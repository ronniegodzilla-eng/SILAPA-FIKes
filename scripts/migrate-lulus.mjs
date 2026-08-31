/**
 * Susulkan tanda `statusGlobal: 'lulus'` ke dokumen induk mahasiswa yang sudah
 * dinyatakan lulus pada laporan periode.
 *
 * Status "lulus" dulu hanya tertulis di dokumen laporan, sementara penyaring
 * pembukaan periode (bukaPeriodeGenerate) membaca `statusGlobal` di dokumen
 * induk. Akibatnya mahasiswa yang sudah diwisuda akan dibuatkan laporan lagi
 * pada periode berikutnya — muncul kembali di daftar bimbingan sebagai
 * mahasiswa AKTIF berstatus kosong, dengan nomor semester yang terus naik.
 *
 * Kode aplikasi kini menulis tanda itu setiap kali dosen menyetel status,
 * tetapi record yang sudah terlanjur lulus sebelum perbaikan harus disusulkan
 * lewat skrip ini.
 *
 * JALANKAN SEBELUM PERIODE BERIKUTNYA DIBUKA. Setelah "Buka Periode"
 * dijalankan, mereka sudah terlanjur masuk ke daftar dan harus dibersihkan
 * satu per satu.
 *
 * TIDAK menyentuh:
 *  - dokumen laporan mana pun — hanya field statusGlobal di dokumen induk,
 *  - mahasiswa yang statusGlobal-nya sudah 'lulus' atau 'keluar',
 *  - mahasiswa yang pengunduran dirinya sudah disahkan (sudah tersaring).
 *
 * Uji-coba dulu (tanpa menulis):
 *   node scripts/migrate-lulus.mjs
 * Lalu betulan:
 *   node scripts/migrate-lulus.mjs --tulis
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

const main = async () => {
  console.log(TULIS ? 'MENULIS\n' : 'UJI-COBA, tidak menulis\n');

  const [lapSnap, mhsSnap] = await Promise.all([
    db.collection('laporan').get(),
    db.collection('mahasiswa').get(),
  ]);
  const master = new Map(mhsSnap.docs.map((d) => [d.data().npm, { ref: d.ref, data: d.data() }]));

  // Satu mahasiswa bisa punya laporan di beberapa periode; yang menentukan
  // adalah periode TERBARU yang menyatakan dia lulus.
  const lulusDi = new Map();
  for (const d of lapSnap.docs) {
    const l = d.data();
    if (l.status !== 'lulus') continue;
    const sebelumnya = lulusDi.get(l.npm);
    if (!sebelumnya || String(l.periodeId) > sebelumnya) lulusDi.set(l.npm, String(l.periodeId));
  }

  const perubahan = [];
  let sudahDitandai = 0, tanpaMaster = 0;

  for (const [npm, periodeId] of lulusDi) {
    const m = master.get(npm);
    if (!m) { tanpaMaster++; continue; }
    const sg = m.data.statusGlobal ?? 'aktif';
    if (sg === 'lulus' || sg === 'keluar') { sudahDitandai++; continue; }
    perubahan.push({ ref: m.ref, npm, nama: m.data.nama ?? '(tanpa nama)', dari: sg, periodeId });
  }

  perubahan.forEach((p) =>
    console.log(`  ${p.npm}  ${String(p.nama).slice(0, 34).padEnd(34)} statusGlobal ${p.dari} → lulus   (${p.periodeId})`)
  );

  console.log(`\n  dinyatakan lulus di laporan : ${lulusDi.size}`);
  console.log(`  akan ditandai di induk      : ${perubahan.length}`);
  console.log(`  sudah bertanda lulus/keluar : ${sudahDitandai}`);
  if (tanpaMaster) console.log(`  tanpa dokumen induk (dilewati) : ${tanpaMaster}`);

  if (!TULIS) {
    console.log('\nUji-coba selesai. Jalankan dengan --tulis untuk menerapkan.');
    return;
  }

  // Batch Firestore maksimal 500 operasi.
  for (let i = 0; i < perubahan.length; i += 400) {
    const batch = db.batch();
    perubahan.slice(i, i + 400).forEach((p) =>
      batch.set(
        p.ref,
        { statusGlobal: 'lulus', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      )
    );
    await batch.commit();
    console.log(`  tersimpan ${Math.min(i + 400, perubahan.length)}/${perubahan.length}`);
  }
  console.log('\nSelesai.');
};

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
