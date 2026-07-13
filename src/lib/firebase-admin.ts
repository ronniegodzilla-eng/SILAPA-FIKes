import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Server-side Firestore (route handlers only). Kredensial dicari berurutan:
 * 1) FIREBASE_SERVICE_ACCOUNT_KEY — isi JSON service account sebagai string
 *    env var (dipakai di Vercel/serverless, tidak ada filesystem persisten
 *    untuk serviceAccountKey.json di sana).
 * 2) GOOGLE_APPLICATION_CREDENTIALS atau ./serviceAccountKey.json — file
 *    lokal (dev), tidak ikut deploy (gitignored).
 * 3) applicationDefault() — hanya berfungsi di lingkungan Google Cloud asli.
 */
let app: App | null = null;

function initApp(): App {
  if (getApps().length) return getApps()[0];

  const inlineKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (inlineKey) {
    return initializeApp({ credential: cert(JSON.parse(inlineKey)) });
  }

  const keyPath = resolve(
    process.cwd(),
    process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json'
  );
  if (existsSync(keyPath)) {
    return initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
  }
  return initializeApp({ credential: applicationDefault() });
}

export function getAdminDb(): Firestore {
  if (!app) app = initApp();
  return getFirestore(app);
}
