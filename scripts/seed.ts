/**
 * Seed Firestore dengan DATA RIIL distribusi dosen PA (SIAKAD UIS,
 * periode 2025/2026 Genap) dari data/distribusi-dosen-pa.json — hasil
 * ekstraksi tiga PDF "DAFTAR DISTRIBUSI DOSEN PA" (k3.pdf, KL.pdf,
 * S2 KESMAS.pdf).
 *
 * Menghapus seluruh data dummy lama (mahasiswa, laporan, submissions,
 * periode arsip fiktif, akun dosen dummy) lalu menulis:
 *   - 3 akun demo (Roni = dosen PA riil, admin, wadek1)
 *   - periode/2025-2026-genap (dibuka)
 *   - mahasiswa/{nim} — NIM SELALU string (PRD §4)
 *   - laporan/{periodeId}_{nim} — semesterKe dari kolom Semester SIAKAD
 *   - submissions per dosen (22 dosen; jumlah = total lintas prodi,
 *     homebase = prodi dengan bimbingan terbanyak)
 *
 * Run:  npm run seed
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

import { DEMO_USERS } from '../src/lib/seed-data';

const PERIODE_ID = '2025-2026-genap';
const RONI_NIDN = '1020088201';

interface RawMahasiswa {
  nim: string;
  nama: string;
  noHp: string;
  email: string;
  semester: number;
}
interface RawSection {
  nidn: string;
  nama: string;
  prodi: 'K3' | 'KL' | 'S2KM';
  mahasiswa: RawMahasiswa[];
}

function loadCredential() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './serviceAccountKey.json';
  try {
    return cert(JSON.parse(readFileSync(keyPath, 'utf8')));
  } catch {
    return applicationDefault();
  }
}

function slug(nama: string) {
  return nama.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Angkatan dari semester berjalan pada periode genap 2025/2026. */
function angkatanFromSemester(sem: number): number {
  return 2025 - Math.floor((sem - 1) / 2);
}

async function deleteCollection(db: Firestore, name: string) {
  let total = 0;
  // Loop sampai habis (batch 400).
  for (;;) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
  }
  console.log(`   • ${name}: ${total} dokumen dihapus`);
}

async function main() {
  initializeApp({ credential: loadCredential() });
  const auth = getAuth();
  const db = getFirestore();

  // ── 1. Muat & agregasi data riil ──
  const dataPath = resolve(process.cwd(), 'data/distribusi-dosen-pa.json');
  const sections: RawSection[] = JSON.parse(readFileSync(dataPath, 'utf8'));

  // Gabungkan seksi per NIDN (dosen membimbing lintas prodi).
  const byNidn = new Map<string, { nidn: string; nama: string; perProdi: Map<string, number>; mahasiswa: (RawMahasiswa & { prodi: string })[] }>();
  for (const s of sections) {
    let d = byNidn.get(s.nidn);
    if (!d) {
      d = { nidn: s.nidn, nama: s.nama, perProdi: new Map(), mahasiswa: [] };
      byNidn.set(s.nidn, d);
    }
    d.perProdi.set(s.prodi, (d.perProdi.get(s.prodi) ?? 0) + s.mahasiswa.length);
    s.mahasiswa.forEach((m) => d!.mahasiswa.push({ ...m, prodi: s.prodi }));
  }
  const dosenList = Array.from(byNidn.values());
  const totalMhs = dosenList.reduce((sum, d) => sum + d.mahasiswa.length, 0);
  console.log(`▶ Data riil: ${dosenList.length} dosen PA, ${totalMhs} mahasiswa.`);

  // ── 2. Akun demo (Roni = dosen riil) ──
  console.log('▶ Menyiapkan akun demo…');
  const uidByEmail: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(u.email);
      uid = existing.uid;
      await auth.updateUser(uid, { password: u.password, displayName: u.nama });
    } catch {
      const created = await auth.createUser({ email: u.email, password: u.password, displayName: u.nama });
      uid = created.uid;
    }
    uidByEmail[u.email] = uid;
    // Custom claim `roles` (array — satu akun bisa lebih dari satu peran)
    // untuk middleware.ts (Edge, tanpa firebase-admin).
    const roles = [u.role];
    await auth.setCustomUserClaims(uid, { roles });
    await db.doc(`users/${uid}`).set({
      uid,
      nama: u.nama,
      email: u.email,
      roles,
      prodiHomebase: u.prodiHomebase ?? null,
      aktif: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`   • ${u.email} (${u.role})`);
  }
  const roniUid = uidByEmail['roni@uis.ac.id'];

  // ── 3. Hapus data dummy ──
  console.log('▶ Menghapus data dummy…');
  await deleteCollection(db, 'laporan');
  await deleteCollection(db, 'mahasiswa');
  await deleteCollection(db, 'submissions');
  await deleteCollection(db, 'periode');
  // Akun dosen dummy (users berperan dosen_pa selain Roni) + Auth user-nya.
  const dosenUsers = await db.collection('users').where('roles', 'array-contains', 'dosen_pa').get();
  for (const d of dosenUsers.docs) {
    if (d.id === roniUid) continue;
    await db.doc(`users/${d.id}`).delete();
    await auth.deleteUser(d.id).catch(() => {});
    console.log(`   • akun dosen dummy dihapus: ${d.id}`);
  }

  // ── 4. Periode aktif ──
  console.log('▶ Menulis periode…');
  await db.doc(`periode/${PERIODE_ID}`).set({
    tahunAkademik: '2025/2026',
    semester: 'genap',
    status: 'dibuka',
    tanggalBuka: FieldValue.serverTimestamp(),
  });

  // ── 5. Mahasiswa + laporan (batch 400) ──
  console.log('▶ Menulis mahasiswa + laporan…');
  const dosenUidOf = (d: { nidn: string; nama: string }) =>
    d.nidn === RONI_NIDN ? roniUid : slug(d.nama);

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const d of dosenList) {
    const dosenUid = dosenUidOf(d);
    for (const m of d.mahasiswa) {
      const nim = String(m.nim); // NIM SELALU string (PRD §4)
      batch.set(db.doc(`mahasiswa/${nim}`), {
        npm: nim,
        nama: m.nama,
        prodi: m.prodi,
        angkatan: angkatanFromSemester(m.semester),
        kelas: '-', // tidak tersedia di laporan SIAKAD — bisa dilengkapi admin
        dosenPaUid: dosenUid,
        statusGlobal: 'aktif',
        noHp: m.noHp || null,
        email: m.email || null,
        pkkmb: false,
        toefl: false,
        esq: false,
        semkesCount: 0,
        ipHistory: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(db.doc(`laporan/${PERIODE_ID}_${nim}`), {
        periodeId: PERIODE_ID,
        npm: nim,
        dosenPaUid: dosenUid,
        prodi: m.prodi,
        semesterKe: m.semester,
        kelas: '-',
        status: 'aktif',
        akademik: { sksKrs: null, ipKhs: null, konsultasi: [], mkNilaiDE: [] },
        nonAkademik: {
          ukm: false, hima: false, bem: false,
          beasiswa: { ada: false, jenis: null, keterangan: '' },
          prestasi: { ada: false, jenis: null, tingkat: null },
        },
        skripsi: { tahap: 'belum', kendala: '' },
        permasalahan: '', rekomendasi: '',
        statusPengisian: 'kosong',
        submittedAt: null,
      });
      ops += 2;
      if (ops >= 400) await flush();
    }
  }
  await flush();
  console.log(`   • ${totalMhs} mahasiswa + ${totalMhs} laporan ditulis`);

  // ── 6. Submissions per dosen ──
  console.log('▶ Menulis submissions (22 dosen)…');
  for (const d of dosenList) {
    const dosenUid = dosenUidOf(d);
    // Homebase = prodi dengan bimbingan terbanyak.
    const homebase = Array.from(d.perProdi.entries()).sort((a, b) => b[1] - a[1])[0][0];
    await db.doc(`submissions/${PERIODE_ID}_${dosenUid}`).set({
      periodeId: PERIODE_ID,
      dosenUid,
      nidn: d.nidn,
      nama: d.nama,
      prodi: homebase,
      jumlah: d.mahasiswa.length,
      status: 'draft',
      catatanWadek: '',
    });
  }

  console.log('\n✅ Seed data riil selesai.');
  console.log(`   ${dosenList.length} dosen PA · ${totalMhs} mahasiswa · periode ${PERIODE_ID} (dibuka)`);
  console.log('   Login demo (password silapa123):');
  DEMO_USERS.forEach((u) => console.log(`     - ${u.email}  [${u.role}]`));
  console.log('   Akun dosen PA lain dibuat admin via halaman Kelola Pengguna.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed gagal:', err);
  process.exit(1);
});
