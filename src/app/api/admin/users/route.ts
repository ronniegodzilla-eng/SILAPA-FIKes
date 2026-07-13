import { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ROLES = ['dosen_pa', 'admin', 'wadek1'];

function normalizeRoles(input: unknown): string[] | null {
  const roles = Array.isArray(input) ? input : typeof input === 'string' ? [input] : null;
  if (!roles || roles.length === 0) return null;
  const unique = Array.from(new Set(roles));
  if (!unique.every((r) => VALID_ROLES.includes(r))) return null;
  return unique;
}

/**
 * Manajemen akun (PRD §3: "akun dibuat oleh admin"). Hanya admin.
 *
 * POST  { uid?, nama, email, password, roles, prodiHomebase? }
 *   Membuat user Firebase Auth + dokumen users/{uid}. Bila `uid` diberikan
 *   (dosenUid dari roster submissions), akun dibuat dengan uid itu sehingga
 *   seluruh referensi plotting/submissions yang ada langsung tersambung.
 *   `roles` adalah array — satu akun bisa punya lebih dari satu peran.
 *
 * PATCH { uid, aktif?, password?, roles? }
 *   Menonaktifkan/mengaktifkan akun (Auth disabled + users.aktif), mereset
 *   kata sandi, dan/atau mengubah daftar peran akun.
 */
export async function POST(req: NextRequest) {
  const caller = await requireRole(req, ['admin']);
  if (caller instanceof Response) return caller;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body JSON tidak valid.', { status: 400 });
  }
  const { uid, nama, email, password, prodiHomebase } = body ?? {};
  const roles = normalizeRoles(body?.roles);
  if (!nama || !email || !password || !roles) {
    return new Response('nama, email, password, dan roles (minimal satu peran valid) wajib diisi.', { status: 400 });
  }
  if (String(password).length < 6) {
    return new Response('Kata sandi minimal 6 karakter.', { status: 400 });
  }

  const auth = getAuth(getApps()[0]);
  const db = getAdminDb();
  try {
    const created = await auth.createUser({
      ...(uid ? { uid } : {}),
      email,
      password,
      displayName: nama,
    });
    // Custom claim `roles` (bukan Firestore) agar middleware.ts (Edge, tanpa
    // firebase-admin) bisa membaca peran langsung dari ID token (PRD §3).
    await auth.setCustomUserClaims(created.uid, { roles });
    await db.doc(`users/${created.uid}`).set({
      uid: created.uid,
      nama,
      email,
      roles,
      prodiHomebase: prodiHomebase ?? null,
      aktif: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ ok: true, uid: created.uid });
  } catch (e: any) {
    const code = e?.errorInfo?.code ?? e?.code ?? '';
    if (code === 'auth/email-already-exists') return new Response('Email sudah dipakai akun lain.', { status: 409 });
    if (code === 'auth/uid-already-exists') return new Response('Akun untuk dosen ini sudah ada.', { status: 409 });
    if (code === 'auth/invalid-email') return new Response('Format email tidak valid.', { status: 400 });
    return new Response(`Gagal membuat akun: ${e?.message ?? e}`, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await requireRole(req, ['admin']);
  if (caller instanceof Response) return caller;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body JSON tidak valid.', { status: 400 });
  }
  const { uid, aktif, password } = body ?? {};
  if (!uid) return new Response('uid wajib diisi.', { status: 400 });
  if (uid === caller.uid && aktif === false) {
    return new Response('Tidak dapat menonaktifkan akun sendiri.', { status: 400 });
  }

  let roles: string[] | null = null;
  if (body?.roles !== undefined) {
    roles = normalizeRoles(body.roles);
    if (!roles) return new Response('roles harus berupa daftar peran valid, minimal satu.', { status: 400 });
    if (uid === caller.uid && !roles.includes('admin')) {
      return new Response('Tidak dapat menghapus peran admin dari akun sendiri.', { status: 400 });
    }
  }

  const auth = getAuth(getApps()[0]);
  const db = getAdminDb();
  try {
    if (typeof aktif === 'boolean') {
      await auth.updateUser(uid, { disabled: !aktif });
      await db.doc(`users/${uid}`).update({ aktif });
    }
    if (password) {
      if (String(password).length < 6) return new Response('Kata sandi minimal 6 karakter.', { status: 400 });
      await auth.updateUser(uid, { password });
    }
    if (roles) {
      await auth.setCustomUserClaims(uid, { roles });
      await db.doc(`users/${uid}`).update({ roles });
    }
    return Response.json({ ok: true });
  } catch (e: any) {
    return new Response(`Gagal memperbarui akun: ${e?.message ?? e}`, { status: 500 });
  }
}
