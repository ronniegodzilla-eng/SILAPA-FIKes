import 'server-only';
import type { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { getAdminDb } from './firebase-admin';
import type { Role } from './types';

export interface AuthedUser {
  uid: string;
  roles: Role[];
  nama: string;
  email: string;
}

/**
 * Verify the Firebase ID token from the Authorization header and load the
 * caller's roles from users/{uid}. PRD §7.5: no public endpoints — every
 * export/admin route must pass through this. A caller passes if ANY of
 * their roles is in `allowed` (multi-role accounts, e.g. Wadek I yang juga
 * Dosen PA).
 *
 * Returns the user, or a ready-to-send 401/403 Response.
 */
export async function requireRole(
  req: NextRequest,
  allowed: Role[]
): Promise<AuthedUser | Response> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return new Response('Tidak terautentikasi — sertakan Firebase ID token.', { status: 401 });
  }

  try {
    getAdminDb(); // ensures the admin app is initialized
  } catch (e: any) {
    console.error('Inisialisasi Firebase Admin gagal (cek FIREBASE_SERVICE_ACCOUNT_KEY):', e?.message ?? e);
    return new Response('Konfigurasi server bermasalah — hubungi admin.', { status: 500 });
  }
  let decoded;
  try {
    decoded = await getAuth(getApps()[0]).verifyIdToken(token);
  } catch (e: any) {
    // Log detail asli ke server (mis. Vercel Runtime Logs) untuk diagnosis —
    // pesan ke client tetap generik agar tidak membocorkan detail ke penyerang.
    console.error('verifyIdToken gagal:', e?.errorInfo ?? e?.message ?? e);
    return new Response('Token tidak valid atau kedaluwarsa.', { status: 401 });
  }

  const userSnap = await getAdminDb().doc(`users/${decoded.uid}`).get();
  if (!userSnap.exists) {
    return new Response('Akun tidak terdaftar di sistem.', { status: 403 });
  }
  const u = userSnap.data() as any;
  if (u.aktif === false) {
    return new Response('Akun dinonaktifkan.', { status: 403 });
  }
  const roles: Role[] = Array.isArray(u.roles) ? u.roles : [];
  if (!allowed.some((r) => roles.includes(r))) {
    return new Response('Peran Anda tidak diizinkan mengakses sumber daya ini.', { status: 403 });
  }
  return { uid: decoded.uid, roles, nama: u.nama ?? '', email: u.email ?? '' };
}
