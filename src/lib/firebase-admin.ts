import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Server-side Firestore (route handlers only). Reads the service-account key
 * from GOOGLE_APPLICATION_CREDENTIALS or ./serviceAccountKey.json.
 */
let app: App | null = null;

function initApp(): App {
  if (getApps().length) return getApps()[0];
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
