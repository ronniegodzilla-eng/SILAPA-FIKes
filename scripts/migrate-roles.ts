/**
 * Migrasi satu kali: users/{uid}.role (string) → roles (array), plus
 * menyegarkan custom claim Auth agar cocok. HANYA menyentuh koleksi `users`
 * — TIDAK seperti `npm run seed`, script ini tidak menghapus/menulis ulang
 * mahasiswa/laporan/submissions/periode (aman dijalankan kapan saja tanpa
 * kehilangan data uji/edit yang sudah ada).
 *
 * Run: npx tsx scripts/migrate-roles.ts
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function loadCredential() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './serviceAccountKey.json';
  try {
    return cert(JSON.parse(readFileSync(keyPath, 'utf8')));
  } catch {
    return applicationDefault();
  }
}

async function main() {
  initializeApp({ credential: loadCredential() });
  const auth = getAuth();
  const db = getFirestore();

  const snap = await db.collection('users').get();
  let migrated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as any;
    if (Array.isArray(data.roles) && data.roles.length > 0) {
      skipped++;
      continue;
    }
    const legacyRole = data.role;
    if (!legacyRole) {
      console.warn(`   ⚠ ${doc.id} (${data.email ?? '?'}) tidak punya field role/roles — dilewati.`);
      skipped++;
      continue;
    }
    const roles = [legacyRole];
    await doc.ref.update({ roles, role: FieldValue.delete() });
    await auth.setCustomUserClaims(doc.id, { roles }).catch((e) =>
      console.warn(`   ⚠ Gagal update custom claim untuk ${doc.id}: ${e?.message ?? e}`)
    );
    console.log(`   • ${data.email ?? doc.id}: role "${legacyRole}" → roles [${legacyRole}]`);
    migrated++;
  }

  console.log(`\n✅ Migrasi selesai. ${migrated} akun dimigrasi, ${skipped} dilewati (sudah punya roles atau tidak valid).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migrasi gagal:', err);
  process.exit(1);
});
