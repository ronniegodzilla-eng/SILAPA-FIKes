import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { Role } from '@/lib/types';

/**
 * Server-side (Edge) role enforcement (PRD §3). This is a UX layer only —
 * the actual security boundary is Firestore Security Rules, which apply
 * regardless of what happens here. Middleware just redirects a signed-in
 * user away from a route their role can't use, before the page even renders.
 *
 * The Firebase ID token lives in an httpOnly cookie (set by /api/session,
 * refreshed by the client on every auth state change) and is verified here
 * against Google's public JWKS — no Firebase Admin SDK needed on the Edge
 * runtime.
 */

const COOKIE_NAME = 'silapa_session';
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

function homeFor(role: Role): string {
  if (role === 'admin') return '/admin/mahasiswa';
  if (role === 'wadek1') return '/wadek';
  return '/dosen';
}

function requiredRole(pathname: string): Role | null {
  if (pathname.startsWith('/dosen')) return 'dosen_pa';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/wadek')) return 'wadek1';
  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needed = requiredRole(pathname);
  if (!needed || !PROJECT_ID) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    const roles = payload.roles as Role[] | undefined;
    if (!roles || roles.length === 0) {
      // Token belum membawa custom claim roles (mis. dibuat sebelum fitur ini
      // ada) — biarkan lewat, halaman client-side guard tetap menjaga.
      return NextResponse.next();
    }
    // Akun multi-role: izinkan bila SALAH SATU peran cocok dengan rute ini.
    if (!roles.includes(needed)) {
      return NextResponse.redirect(new URL(homeFor(roles[0]), req.url));
    }
    return NextResponse.next();
  } catch {
    // Token tidak valid/kedaluwarsa — arahkan ke login, jangan blokir diam-diam.
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
}

export const config = {
  matcher: ['/dosen/:path*', '/admin/:path*', '/wadek/:path*'],
};
