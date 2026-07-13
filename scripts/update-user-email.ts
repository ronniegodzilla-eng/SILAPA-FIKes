/**
 * Utilitas satu-akun: ubah email login (Firebase Auth + users/{uid}.email)
 * tanpa menyentuh koleksi lain. Berguna untuk mengganti email demo/seed
 * dengan email institusi/pribadi asli agar bisa diuji end-to-end (mis.
 * alur lupa password).
 *
 * Run: npx tsx scripts/update-user-email.ts <email-lama-atau-uid> <email-baru>
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function loadCredential() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './serviceAccountKey.json';
  try {
    return cert(JSON.parse(readFileSync(keyPath, 'utf8')));
  } catch {
    return applicationDefault();
  }
}

async function main() {
  const [identifier, newEmail] = process.argv.slice(2);
  if (!identifier || !newEmail) {
    console.error('Pemakaian: npx tsx scripts/update-user-email.ts <email-lama-atau-uid> <email-baru>');
    process.exit(1);
  }

  initializeApp({ credential: loadCredential() });
  const auth = getAuth();
  const db = getFirestore();

  const isEmail = identifier.includes('@');
  const uid = isEmail ? (await auth.getUserByEmail(identifier)).uid : identifier;

  await auth.updateUser(uid, { email: newEmail });
  await db.doc(`users/${uid}`).update({ email: newEmail });

  console.log(`✅ Email akun ${uid} diperbarui: ${identifier} → ${newEmail}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Gagal:', err);
  process.exit(1);
});
