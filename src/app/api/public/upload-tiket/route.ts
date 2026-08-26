import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { validateToken } from '@/lib/token-isi-data';
import { buatTiket } from '@/lib/upload-tiket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LABEL_RE = /^[A-Za-z0-9 _-]{1,40}$/;

/**
 * Terbitkan tiket unggah bukti untuk mahasiswa (halaman isi data mandiri,
 * tanpa login). Wewenangnya diperiksa persis seperti /api/public/upload-bukti:
 * token harus sah dan npm-nya benar-benar bimbingan dosen pemilik token.
 *
 * POST { token, npm, label } → { uploadUrl, tiket }
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body JSON tidak valid.', { status: 400 });
  }
  const npm = String(body?.npm ?? '').trim();
  const label = String(body?.label ?? '').trim();
  if (!npm || !LABEL_RE.test(label)) {
    return new Response('npm dan label wajib diisi (label maksimal 40 karakter).', { status: 400 });
  }

  const v = await validateToken(body?.token);
  if (!v.ok) return new Response(v.message, { status: v.status });

  const snap = await getAdminDb().doc(`mahasiswa/${npm}`).get();
  const dosenPaUid = snap.exists ? (snap.data() as any).dosenPaUid : null;
  if (dosenPaUid !== v.ctx.dosenUid) {
    return new Response('Mahasiswa ini bukan bimbingan dosen pemilik link.', { status: 403 });
  }

  const t = buatTiket(npm, label);
  if (!t.ok) return new Response(t.message, { status: t.status });
  return Response.json({ uploadUrl: t.uploadUrl, tiket: t.tiket });
}
