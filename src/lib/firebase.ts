import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * True only when the browser bundle actually received a Firebase config.
 * Lets the UI show a helpful setup notice instead of crashing when
 * `.env.local` has not been filled in yet.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
}

/** Throwing accessors — call only after checking `isFirebaseConfigured`. */
export function getAuthOrThrow(): Auth {
  if (!authInstance) throw new Error('Firebase belum dikonfigurasi. Lihat .env.local.example.');
  return authInstance;
}

export function getDbOrThrow(): Firestore {
  if (!dbInstance) throw new Error('Firebase belum dikonfigurasi. Lihat .env.local.example.');
  return dbInstance;
}

export { app, authInstance as auth, dbInstance as db };
