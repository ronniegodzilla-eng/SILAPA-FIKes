/**
 * Test suite Security Rules terhadap Firestore Emulator (PRD §9: "Security
 * Rules teruji dengan emulator"). Skenario mencakup setiap cabang izin di
 * firestore.rules — termasuk yang HARUS ditolak (bukan cuma yang harus
 * berhasil), dan defence-in-depth IPK 0–4 (bug lama: sel `46268.0`).
 *
 * Urutan skenario disengaja: setiap cek "BUKAN pemilik → deny" dijalankan
 * SEBELUM cek "pemilik → allow" pada dokumen yang sama, dan pengujian tulis
 * periode memakai dokumen terpisah — supaya satu skenario tidak diam-diam
 * mengubah state (mis. mengunci periode) yang dipakai skenario berikutnya.
 * Baca pakai getDocFromServer (bukan getDoc) agar tidak lolos lewat cache lokal.
 *
 * Run: npm run test:rules
 * (firebase emulators:exec menjalankan file ini di dalam Firestore Emulator
 * lokal — tidak menyentuh project Firebase asli.)
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocFromServer, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-silapa-fikes';

let testEnv: RulesTestEnvironment;
let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`      ${e?.message ?? e}`);
  }
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin1'), { uid: 'admin1', nama: 'Admin', email: 'admin@test.id', roles: ['admin'], aktif: true });
    await setDoc(doc(db, 'users/wadek1'), { uid: 'wadek1', nama: 'Wadek', email: 'wadek@test.id', roles: ['wadek1'], aktif: true });
    await setDoc(doc(db, 'users/dosenA'), { uid: 'dosenA', nama: 'Dosen A', email: 'a@test.id', roles: ['dosen_pa'], aktif: true });
    await setDoc(doc(db, 'users/dosenB'), { uid: 'dosenB', nama: 'Dosen B', email: 'b@test.id', roles: ['dosen_pa'], aktif: true });
    // Dipakai HANYA untuk uji "admin ubah roles user lain" — sengaja terpisah
    // dari dosenB, supaya menaikkan perannya jadi admin tidak diam-diam
    // membuat dosenB lolos semua cek "bukan pemilik → deny" di bawah.
    await setDoc(doc(db, 'users/throwaway'), { uid: 'throwaway', nama: 'Throwaway', email: 't@test.id', roles: ['dosen_pa'], aktif: true });

    await setDoc(doc(db, 'periode/2025-genap'), { tahunAkademik: '2025/2026', semester: 'genap', status: 'dibuka' });
    await setDoc(doc(db, 'periode/2024-genap'), { tahunAkademik: '2024/2025', semester: 'genap', status: 'dikunci' });
    // Dokumen terpisah khusus uji izin TULIS periode — supaya periode/2025-genap
    // tetap "dibuka" untuk skenario laporan/submissions di bawah.
    await setDoc(doc(db, 'periode/write-test'), { tahunAkademik: '2099/2100', semester: 'genap', status: 'draft' });

    await setDoc(doc(db, 'mahasiswa/1001'), {
      npm: '1001', nama: 'Mhs A', prodi: 'K3', dosenPaUid: 'dosenA',
      pkkmb: false, toefl: false, esq: false, semkesCount: 0,
    });

    const emptyAkademik = { sksKrs: null, ipKhs: null, konsultasi: [], mkNilaiDE: [] };
    await setDoc(doc(db, 'laporan/2025-genap_1001'), {
      periodeId: '2025-genap', npm: '1001', dosenPaUid: 'dosenA', prodi: 'K3', status: 'aktif', akademik: emptyAkademik,
    });
    await setDoc(doc(db, 'laporan/2024-genap_9001'), {
      periodeId: '2024-genap', npm: '9001', dosenPaUid: 'dosenA', prodi: 'K3', status: 'aktif', akademik: emptyAkademik,
    });

    await setDoc(doc(db, 'submissions/2025-genap_dosenA'), {
      periodeId: '2025-genap', dosenUid: 'dosenA', nama: 'Dosen A', status: 'draft',
    });
  });
}

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      // Bisa ditimpa lewat FIRESTORE_EMULATOR_PORT — di mesin dev sering ada
      // emulator proyek lain yang sudah memegang 8080.
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });

  await seed();

  const admin = testEnv.authenticatedContext('admin1').firestore();
  const wadek = testEnv.authenticatedContext('wadek1').firestore();
  const dosenA = testEnv.authenticatedContext('dosenA').firestore();
  const dosenB = testEnv.authenticatedContext('dosenB').firestore();
  const anon = testEnv.unauthenticatedContext().firestore();

  const emptyAkademik = { sksKrs: null, ipKhs: null, konsultasi: [], mkNilaiDE: [] };

  console.log('\nusers/{uid}');
  await check('dosen baca dokumennya sendiri → allow', () => assertSucceeds(getDocFromServer(doc(dosenA, 'users/dosenA'))));
  await check('dosen baca dokumen dosen lain → deny', () => assertFails(getDocFromServer(doc(dosenA, 'users/dosenB'))));
  await check('admin baca dokumen siapa pun → allow', () => assertSucceeds(getDocFromServer(doc(admin, 'users/dosenA'))));
  await check('wadek baca dokumen siapa pun → allow', () => assertSucceeds(getDocFromServer(doc(wadek, 'users/dosenA'))));
  await check('anon baca users → deny', () => assertFails(getDocFromServer(doc(anon, 'users/dosenA'))));
  await check('dosen ubah dokumennya sendiri → deny', () => assertFails(updateDoc(doc(dosenA, 'users/dosenA'), { nama: 'Diubah' })));
  await check('wadek ubah dokumen user → deny', () => assertFails(updateDoc(doc(wadek, 'users/dosenA'), { nama: 'Diubah' })));
  await check('admin ubah roles user lain → allow', () => assertSucceeds(updateDoc(doc(admin, 'users/throwaway'), { roles: ['dosen_pa', 'admin'] })));

  console.log('\nperiode/{periodeId}');
  await check('dosen baca periode → allow', () => assertSucceeds(getDocFromServer(doc(dosenA, 'periode/2025-genap'))));
  await check('anon baca periode → deny', () => assertFails(getDocFromServer(doc(anon, 'periode/2025-genap'))));
  await check('dosen tulis periode → deny', () => assertFails(updateDoc(doc(dosenA, 'periode/write-test'), { status: 'dibuka' })));
  await check('admin tulis periode → allow', () => assertSucceeds(updateDoc(doc(admin, 'periode/write-test'), { status: 'dibuka' })));
  await check('wadek tulis periode → allow', () => assertSucceeds(updateDoc(doc(wadek, 'periode/write-test'), { status: 'dikunci' })));

  console.log('\nmahasiswa/{npm}');
  // Sejak fitur "Tambah Mahasiswa" di daftar bimbingan, dosen BOLEH membuat
  // mahasiswa baru — tapi hanya yang diplot ke dirinya sendiri dan hanya
  // dengan field identitas yang dikenal.
  await check('dosen create mahasiswa baru utk dirinya sendiri → allow', () =>
    assertSucceeds(setDoc(doc(dosenA, 'mahasiswa/9999'), { npm: '9999', nama: 'Baru', prodi: 'K3', angkatan: 2026, kelas: 'REG A', dosenPaUid: 'dosenA' })));
  await check('dosen create mahasiswa diplot ke dosen LAIN → deny', () =>
    assertFails(setDoc(doc(dosenA, 'mahasiswa/9998'), { npm: '9998', nama: 'Baru', prodi: 'K3', angkatan: 2026, kelas: 'REG A', dosenPaUid: 'dosenB' })));
  await check('dosen create mahasiswa dengan field di luar daftar → deny', () =>
    assertFails(setDoc(doc(dosenA, 'mahasiswa/9997'), { npm: '9997', nama: 'Baru', dosenPaUid: 'dosenA', statusGlobal: 'lulus' })));
  await check('admin create mahasiswa baru → allow', () =>
    assertSucceeds(setDoc(doc(admin, 'mahasiswa/9999'), { npm: '9999', nama: 'Baru', dosenPaUid: 'dosenA' })));
  await check('dosen delete mahasiswa → deny', () => assertFails(deleteDoc(doc(dosenA, 'mahasiswa/1001'))));
  await check('admin delete mahasiswa → allow', () => assertSucceeds(deleteDoc(doc(admin, 'mahasiswa/9999'))));
  await check('dosen BUKAN pemilik ubah field diizinkan → deny', () =>
    assertFails(updateDoc(doc(dosenB, 'mahasiswa/1001'), { toefl: true })));
  await check('dosen pemilik ubah field diizinkan (toefl) → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'mahasiswa/1001'), { toefl: true })));
  await check('dosen pemilik ubah field TIDAK diizinkan (nama) → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'mahasiswa/1001'), { nama: 'Diubah Paksa' })));
  await check('dosen pemilik unggah bukti TOEFL (toeflBukti) → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'mahasiswa/1001'), { toeflBukti: 'https://drive.google.com/file/d/xyz' })));
  await check('dosen BUKAN pemilik unggah bukti TOEFL → deny', () =>
    assertFails(updateDoc(doc(dosenB, 'mahasiswa/1001'), { toeflBukti: 'https://drive.google.com/file/d/xyz' })));
  // Kelas boleh dikoreksi dosen PA (SIAKAD tidak memuatnya), identitas lain tidak.
  await check('dosen pemilik ubah kelas → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'mahasiswa/1001'), { kelas: 'RPL' })));
  await check('dosen BUKAN pemilik ubah kelas → deny', () =>
    assertFails(updateDoc(doc(dosenB, 'mahasiswa/1001'), { kelas: 'RPL' })));
  await check('dosen ubah kelas SEKALIGUS prodi → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'mahasiswa/1001'), { kelas: 'REG A', prodi: 'S2KM' })));

  // statusGlobal: penanda yang membuat kelulusan berlaku LINTAS periode
  // (penyaring pembukaan periode membacanya). Dosen PA boleh menyetelnya untuk
  // bimbingannya sendiri, tapi hanya ke status yang memang ada di formnya —
  // 'keluar' tetap wewenang admin, karena itu mengeluarkan mahasiswa dari
  // sistem, bukan sekadar menandai dia sudah lulus.
  await check('dosen pemilik tandai lulus (statusGlobal) → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'mahasiswa/1001'), { statusGlobal: 'lulus' })));
  await check('dosen pemilik cabut tanda lulus (statusGlobal aktif) → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'mahasiswa/1001'), { statusGlobal: 'aktif' })));
  await check('dosen BUKAN pemilik tandai lulus → deny', () =>
    assertFails(updateDoc(doc(dosenB, 'mahasiswa/1001'), { statusGlobal: 'lulus' })));
  await check("dosen setel statusGlobal 'keluar' → deny", () =>
    assertFails(updateDoc(doc(dosenA, 'mahasiswa/1001'), { statusGlobal: 'keluar' })));
  await check('dosen setel statusGlobal nilai ngawur → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'mahasiswa/1001'), { statusGlobal: 'dihapus_saja' })));
  await check('dosen selundupkan nama lewat statusGlobal → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'mahasiswa/1001'), { statusGlobal: 'lulus', nama: 'Diubah Paksa' })));
  await check("admin setel statusGlobal 'keluar' → allow", () =>
    assertSucceeds(updateDoc(doc(admin, 'mahasiswa/1001'), { statusGlobal: 'keluar' })));
  await check('admin ubah field apa pun di mahasiswa → allow', () =>
    assertSucceeds(updateDoc(doc(admin, 'mahasiswa/1001'), { nama: 'Diubah Admin' })));

  console.log('\nlaporan/{id}');
  await check('dosen BUKAN pemilik baca laporan → deny', () => assertFails(getDocFromServer(doc(dosenB, 'laporan/2025-genap_1001'))));
  await check('dosen pemilik baca laporannya → allow', () => assertSucceeds(getDocFromServer(doc(dosenA, 'laporan/2025-genap_1001'))));
  await check('wadek baca laporan siapa pun → allow', () => assertSucceeds(getDocFromServer(doc(wadek, 'laporan/2025-genap_1001'))));
  // Menyertai create mahasiswa di atas: dosen membuat laporan periode berjalan
  // untuk mahasiswa barunya sendiri, dalam bentuk yang dibatasi.
  await check('dosen create laporan utk bimbingannya sendiri → allow', () =>
    assertSucceeds(setDoc(doc(dosenA, 'laporan/2025-genap_9003'), { periodeId: '2025-genap', npm: '9003', dosenPaUid: 'dosenA', status: 'aktif', akademik: emptyAkademik })));
  await check('dosen create laporan utk dosen LAIN → deny', () =>
    assertFails(setDoc(doc(dosenA, 'laporan/2025-genap_9004'), { periodeId: '2025-genap', npm: '9004', dosenPaUid: 'dosenB', status: 'aktif', akademik: emptyAkademik })));
  await check('admin create laporan → allow', () =>
    assertSucceeds(setDoc(doc(admin, 'laporan/2025-genap_9002'), { periodeId: '2025-genap', npm: '9002', dosenPaUid: 'dosenA', status: 'aktif', akademik: emptyAkademik })));
  await check('dosen BUKAN pemilik update laporan → deny', () =>
    assertFails(updateDoc(doc(dosenB, 'laporan/2025-genap_1001'), { akademik: { ...emptyAkademik, ipKhs: 3.0 } })));
  await check('dosen pemilik update IPK TIDAK valid (46268, bug lama) → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'laporan/2025-genap_1001'), { akademik: { ...emptyAkademik, sksKrs: 20, ipKhs: 46268 } })));
  await check('dosen pemilik update laporan di periode TERKUNCI → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'laporan/2024-genap_9001'), { akademik: { ...emptyAkademik, ipKhs: 3.0 } })));
  await check('admin update laporan di periode TERKUNCI → deny (immutable utk semua)', () =>
    assertFails(updateDoc(doc(admin, 'laporan/2024-genap_9001'), { status: 'lulus' })));
  await check('dosen pemilik update IPK valid (3.5) di periode terbuka → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'laporan/2025-genap_1001'), { akademik: { ...emptyAkademik, sksKrs: 20, ipKhs: 3.5 } })));
  await check('dosen delete laporan → deny', () => assertFails(deleteDoc(doc(dosenA, 'laporan/2025-genap_1001'))));

  // ── Pengunduran diri: klien hanya boleh MENGAJUKAN ────────────────────
  // Kalau penjaga ini jebol, seorang dosen PA bisa meloloskan pengajuannya
  // sendiri dan mengeluarkan mahasiswa dari daftar bimbingannya tanpa
  // sepengetahuan Wakil Dekan I.
  const pengajuan = {
    status: 'diajukan',
    statusSebelum: 'aktif',
    alasan: 'Surat pengunduran diri tertanggal 1 Agustus.',
    diajukanOlehUid: 'dosenA',
    diajukanOlehNama: 'Dosen A',
  };
  await check('dosen pemilik AJUKAN pengunduran diri → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'laporan/2025-genap_1001'), {
      status: 'mengundurkan_diri', pengunduran: pengajuan })));
  await check('dosen SETUJUI pengunduran dirinya sendiri → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'laporan/2025-genap_1001'), {
      status: 'non_aktif', pengunduran: { ...pengajuan, status: 'disetujui' } })));
  await check('admin setujui pengunduran diri → deny (wewenang WD1)', () =>
    assertFails(updateDoc(doc(admin, 'laporan/2025-genap_1001'), {
      pengunduran: { ...pengajuan, status: 'disetujui' } })));
  await check('wadek setujui langsung dari klien → deny (harus lewat API)', () =>
    assertFails(updateDoc(doc(wadek, 'laporan/2025-genap_1001'), {
      pengunduran: { ...pengajuan, status: 'disetujui' } })));
  await check('dosen BATALKAN pengajuannya sendiri → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'laporan/2025-genap_1001'), {
      status: 'aktif', pengunduran: null })));
  await check('dosen sunting field lain saat berkas sudah divalidasi → allow', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'laporan/2025-genap_1001'),
        { pengunduran: { ...pengajuan, status: 'ditolak', catatanWadek: 'Bukti kurang' } },
        { merge: true });
    });
    return assertSucceeds(updateDoc(doc(dosenA, 'laporan/2025-genap_1001'), { permasalahan: 'catatan baru' }));
  });
  await check('dosen ubah keputusan yang sudah ditulis WD1 → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'laporan/2025-genap_1001'), {
      pengunduran: { ...pengajuan, status: 'ditolak', catatanWadek: 'diubah sendiri' } })));
  await check('admin delete laporan → allow', () => assertSucceeds(deleteDoc(doc(admin, 'laporan/2025-genap_9002'))));

  console.log('\nsubmissions/{id}');
  await check('dosen BUKAN pemilik baca submission → deny', () => assertFails(getDocFromServer(doc(dosenB, 'submissions/2025-genap_dosenA'))));
  await check('dosen pemilik baca submission-nya → allow', () => assertSucceeds(getDocFromServer(doc(dosenA, 'submissions/2025-genap_dosenA'))));
  await check('dosen create submission → deny', () =>
    assertFails(setDoc(doc(dosenA, 'submissions/2025-genap_dosenB'), { periodeId: '2025-genap', dosenUid: 'dosenB', status: 'draft' })));
  await check('admin create submission → allow', () =>
    assertSucceeds(setDoc(doc(admin, 'submissions/2025-genap_dosenB'), { periodeId: '2025-genap', dosenUid: 'dosenB', status: 'draft' })));
  await check('dosen BUKAN pemilik update submission → deny', () =>
    assertFails(updateDoc(doc(dosenB, 'submissions/2025-genap_dosenA'), { status: 'dikirim' })));
  // Perpindahan status kini HANYA lewat /api/laporan/status (Admin SDK), sebab
  // di situlah tanda tangan elektronik dibubuhkan dengan jam server.
  await check('dosen pemilik ubah status submission dari klien → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'submissions/2025-genap_dosenA'), { status: 'dikirim' })));
  await check('wadek ubah status submission dari klien → deny', () =>
    assertFails(updateDoc(doc(wadek, 'submissions/2025-genap_dosenA'), { status: 'diverifikasi' })));
  await check('dosen pemilik ubah field non-status submission → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'submissions/2025-genap_dosenA'), { jumlah: 42 })));
  await check('admin ubah status submission (jalan darurat) → allow', () =>
    assertSucceeds(updateDoc(doc(admin, 'submissions/2025-genap_dosenA'), { status: 'draft' })));

  // Tanda tangan tidak boleh dibubuhkan siapa pun dari klien — kalau jebol,
  // seorang dosen bisa memalsukan pengesahan Wakil Dekan I.
  const ttdPalsu = { uid: 'dosenA', nama: 'Dosen A', jabatan: 'Wakil Dekan I', waktu: '2026-01-01T00:00:00.000Z', kode: 'PALSU' };
  await check('dosen bubuhkan ttdDosen dari klien → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'submissions/2025-genap_dosenA'), { ttdDosen: ttdPalsu })));
  await check('dosen bubuhkan ttdWadek dari klien → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'submissions/2025-genap_dosenA'), { ttdWadek: ttdPalsu })));
  await check('wadek bubuhkan ttdWadek dari klien → deny', () =>
    assertFails(updateDoc(doc(wadek, 'submissions/2025-genap_dosenA'), { ttdWadek: ttdPalsu })));
  await check('admin bubuhkan tanda tangan dari klien → deny', () =>
    assertFails(updateDoc(doc(admin, 'submissions/2025-genap_dosenA'), { ttdWadek: ttdPalsu })));

  // Laporan beku setelah ditandatangani & dikirim.
  console.log('\nlaporan terkunci setelah ditandatangani');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'submissions/2025-genap_dosenA'), { status: 'dikirim' }, { merge: true });
  });
  await check('dosen sunting laporan setelah dikirim → deny', () =>
    assertFails(updateDoc(doc(dosenA, 'laporan/2025-genap_1001'), { permasalahan: 'diubah setelah ttd' })));
  await check('admin sunting laporan setelah dikirim → deny', () =>
    assertFails(updateDoc(doc(admin, 'laporan/2025-genap_1001'), { permasalahan: 'diubah admin' })));
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'submissions/2025-genap_dosenA'), { status: 'dikembalikan' }, { merge: true });
  });
  await check('dosen sunting laporan setelah dikembalikan WD1 → allow', () =>
    assertSucceeds(updateDoc(doc(dosenA, 'laporan/2025-genap_1001'), { permasalahan: 'diperbaiki' })));

  console.log('\nrekapCache/{periodeId}');
  await check('dosen baca rekapCache → deny', () => assertFails(getDocFromServer(doc(dosenA, 'rekapCache/2025-genap'))));
  await check('dosen tulis rekapCache → deny', () =>
    assertFails(setDoc(doc(dosenA, 'rekapCache/2025-genap'), { computedAt: Date.now() })));
  await check('admin tulis rekapCache → allow', () =>
    assertSucceeds(setDoc(doc(admin, 'rekapCache/2025-genap'), { computedAt: Date.now(), aggregates: {} })));
  await check('wadek baca rekapCache → allow', () => assertSucceeds(getDocFromServer(doc(wadek, 'rekapCache/2025-genap'))));

  await testEnv.cleanup();

  console.log(`\n${passed} lolos, ${failed} gagal dari ${passed + failed} skenario.`);
  if (failed > 0) {
    console.log('Skenario gagal:', failures.join(', '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Test rules gagal dijalankan:', e);
  process.exit(1);
});
