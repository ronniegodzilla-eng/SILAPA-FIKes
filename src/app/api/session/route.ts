import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const COOKIE_NAME = 'silapa_session';

/**
 * Menyimpan/menghapus ID token Firebase sebagai cookie httpOnly, agar
 * middleware.ts (Edge runtime) bisa memverifikasi role tanpa akses ke
 * Firebase client SDK (PRD §3: penegakan role via middleware Next.js).
 *
 * Ini adalah lapisan UX (redirect lebih awal, hindari flash halaman salah
 * role) — batas keamanan sesungguhnya tetap Firestore Security Rules.
 */
export async function POST(req: NextRequest) {
  const { idToken } = await req.json().catch(() => ({ idToken: null }));
  if (!idToken || typeof idToken !== 'string') {
    return new Response('idToken wajib diisi.', { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 55, // token Firebase kedaluwarsa ~1 jam; disegarkan klien tiap refresh
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
