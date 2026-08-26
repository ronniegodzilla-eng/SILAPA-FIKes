import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';
import { buatTiket } from '@/lib/upload-tiket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LABEL_RE = /^[A-Za-z0-9 _-]{1,40}$/;

/**
 * Terbitkan tiket unggah bukti untuk dosen PA / admin.
 *
 * Pemeriksaan wewenangnya PERSIS sama dengan /api/upload-bukti yang lama —
 * hanya berkasnya yang tidak lagi lewat sini, melainkan dikirim browser
 * langsung ke Apps Script memakai tiket ini. Lihat lib/upload-tiket.ts.
 *
 * POST { npm, label } → { uploadUrl, tiket }
 */
export async function POST(req: NextRequest) {
  const caller = await requireRole(req, ['dosen_pa', 'admin']);
  if (caller instanceof Response) return caller;

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

  if (!caller.roles.includes('admin')) {
    const snap = await getAdminDb().doc(`mahasiswa/${npm}`).get();
    const dosenPaUid = snap.exists ? (snap.data() as any).dosenPaUid : null;
    if (dosenPaUid !== caller.uid) {
      return new Response('Anda hanya dapat mengunggah bukti untuk mahasiswa bimbingan Anda sendiri.', { status: 403 });
    }
  }

  const t = buatTiket(npm, label);
  if (!t.ok) return new Response(t.message, { status: t.status });
  return Response.json({ uploadUrl: t.uploadUrl, tiket: t.tiket });
}
