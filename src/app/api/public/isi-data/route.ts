import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { validateToken } from '@/lib/token-isi-data';
import { computeStatusPengisian } from '@/lib/compute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Isi Data Mandiri Mahasiswa (§ rancangan token-per-dosen) — TANPA login.
 * Satu token mewakili seluruh bimbingan satu dosen; mahasiswa memilih
 * namanya sendiri lalu mengisi datanya. npm/nama/prodi/angkatan/kelas/
 * dosenPaUid TIDAK PERNAH bisa diubah lewat rute ini (lihat ALLOWED di
 * bawah — field itu sengaja tidak ada dalam daftar).
 *
 * GET  ?token=X            → daftar {npm,nama} bimbingan dosen ini (roster
 *                             LIVE saat ini, bukan snapshot saat token dibuat)
 * GET  ?token=X&npm=Y       → identitas (read-only) + nilai field yang boleh
 *                             diisi saat ini, untuk mengisi form
 * POST {token, npm, patch}  → simpan perubahan (whitelist ketat di server)
 */

const MASTER_WRITABLE = new Set(['pkkmb', 'pkkmbBukti', 'toefl', 'toeflBukti', 'esq', 'esqBukti', 'semkesCount']);

// Bentuk patch yang diterima — apa pun di luar ini DITOLAK (bukan cuma
// diabaikan) supaya kesalahan/percobaan tak terduga terlihat jelas di log,
// bukan diam-diam gagal.
const ALLOWED_SHAPE: Record<string, true | Record<string, true>> = {
  status: true,
  pkkmb: true, pkkmbBukti: true,
  toefl: true, toeflBukti: true,
  esq: true, esqBukti: true,
  semkesCount: true,
  akademik: {
    sksKrs: true, krsBukti: true,
    ipKhs: true, khsBukti: true,
    konsultasi: true,
    mkNilaiDE: true,
  } as any,
  nonAkademik: {
    ukm: true, ukmJenis: true, organisasiBukti: true,
    hima: true, bem: true,
    beasiswa: true, // objek {ada,jenis,keterangan,bukti} — divalidasi lebih lanjut di bawah
    prestasi: true, // objek {ada,jenis,tingkat,bukti}
  } as any,
  skripsi: { tahap: true, kendala: true } as any,
  permasalahan: true,
  rekomendasi: true,
};
const BEASISWA_KEYS = new Set(['ada', 'jenis', 'keterangan', 'bukti']);
const PRESTASI_KEYS = new Set(['ada', 'jenis', 'tingkat', 'bukti']);

function findUnknownKeys(patch: any): string[] {
  const bad: string[] = [];
  for (const key of Object.keys(patch ?? {})) {
    const shape = ALLOWED_SHAPE[key];
    if (shape === undefined) {
      bad.push(key);
      continue;
    }
    if (shape === true) continue; // leaf field, any value OK (further checks below)
    const sub = patch[key];
    if (sub === null || typeof sub !== 'object') continue;
    for (const subKey of Object.keys(sub)) {
      if (key === 'akademik' && !(shape as any)[subKey]) bad.push(`akademik.${subKey}`);
      if (key === 'nonAkademik') {
        if (subKey === 'beasiswa') {
          Object.keys(sub.beasiswa ?? {}).forEach((k) => { if (!BEASISWA_KEYS.has(k)) bad.push(`nonAkademik.beasiswa.${k}`); });
        } else if (subKey === 'prestasi') {
          Object.keys(sub.prestasi ?? {}).forEach((k) => { if (!PRESTASI_KEYS.has(k)) bad.push(`nonAkademik.prestasi.${k}`); });
        } else if (!(shape as any)[subKey]) {
          bad.push(`nonAkademik.${subKey}`);
        }
      }
      if (key === 'skripsi' && !(shape as any)[subKey]) bad.push(`skripsi.${subKey}`);
    }
  }
  return bad;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const npm = req.nextUrl.searchParams.get('npm');

  const v = await validateToken(token);
  if (!v.ok) return new Response(v.message, { status: v.status });
  const { ctx } = v;
  const db = getAdminDb();

  if (!npm) {
    // Roster LIVE (mengikuti plotting terkini), bukan snapshot lama.
    const snap = await db.collection('mahasiswa').where('dosenPaUid', '==', ctx.dosenUid).get();
    const mahasiswa = snap.docs
      .map((d) => d.data() as any)
      .map((m) => ({ npm: String(m.npm), nama: m.nama as string }))
      .sort((a, b) => a.nama.localeCompare(b.nama));
    return Response.json({ dosenNama: ctx.dosenNama, periodeLabel: ctx.periodeLabel, mahasiswa });
  }

  const masterSnap = await db.doc(`mahasiswa/${npm}`).get();
  if (!masterSnap.exists) return new Response('Mahasiswa tidak ditemukan.', { status: 404 });
  const master = masterSnap.data() as any;
  if (master.dosenPaUid !== ctx.dosenUid) {
    return new Response('Mahasiswa ini bukan bimbingan dosen pemilik link.', { status: 403 });
  }
  const laporanSnap = await db.doc(`laporan/${ctx.periodeId}_${npm}`).get();
  const laporan = laporanSnap.exists ? (laporanSnap.data() as any) : null;
  if (!laporan) return new Response('Laporan periode ini belum tersedia untuk mahasiswa ini.', { status: 404 });

  return Response.json({
    identitas: { npm: String(master.npm), nama: master.nama, prodi: master.prodi, angkatan: master.angkatan, kelas: master.kelas },
    semesterKe: laporan.semesterKe ?? 0,
    status: laporan.status ?? 'aktif',
    pkkmb: !!master.pkkmb, pkkmbBukti: master.pkkmbBukti ?? '',
    toefl: !!master.toefl, toeflBukti: master.toeflBukti ?? '',
    esq: !!master.esq, esqBukti: master.esqBukti ?? '',
    semkesCount: master.semkesCount ?? 0,
    akademik: {
      sksKrs: laporan.akademik?.sksKrs ?? null,
      krsBukti: laporan.akademik?.krsBukti ?? '',
      ipKhs: laporan.akademik?.ipKhs ?? null,
      khsBukti: laporan.akademik?.khsBukti ?? '',
      konsultasi: laporan.akademik?.konsultasi ?? [],
      mkNilaiDE: laporan.akademik?.mkNilaiDE ?? [],
    },
    nonAkademik: laporan.nonAkademik ?? {
      ukm: false, ukmJenis: null, hima: false, bem: false,
      beasiswa: { ada: false, jenis: null, keterangan: '' },
      prestasi: { ada: false, jenis: null, tingkat: null },
    },
    skripsi: laporan.skripsi ?? { tahap: 'belum', kendala: '' },
    permasalahan: laporan.permasalahan ?? '',
    rekomendasi: laporan.rekomendasi ?? '',
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Body JSON tidak valid.', { status: 400 });
  }
  const { token, npm, patch } = body ?? {};
  if (!npm || typeof patch !== 'object' || patch === null) {
    return new Response('npm dan patch wajib diisi.', { status: 400 });
  }

  const v = await validateToken(token);
  if (!v.ok) return new Response(v.message, { status: v.status });
  const { ctx } = v;

  const bad = findUnknownKeys(patch);
  if (bad.length) {
    return new Response(`Field tidak diizinkan diubah lewat isi-data mandiri: ${bad.join(', ')}.`, { status: 400 });
  }

  const db = getAdminDb();
  const masterRef = db.doc(`mahasiswa/${npm}`);
  const masterSnap = await masterRef.get();
  if (!masterSnap.exists) return new Response('Mahasiswa tidak ditemukan.', { status: 404 });
  const master = masterSnap.data() as any;
  if (master.dosenPaUid !== ctx.dosenUid) {
    return new Response('Mahasiswa ini bukan bimbingan dosen pemilik link.', { status: 403 });
  }
  const laporanRef = db.doc(`laporan/${ctx.periodeId}_${npm}`);
  const laporanSnap = await laporanRef.get();
  if (!laporanSnap.exists) return new Response('Laporan periode ini belum tersedia untuk mahasiswa ini.', { status: 404 });
  const laporan = laporanSnap.data() as any;

  // ── SKS/IP: bukti KRS/KHS WAJIB setiap kali angkanya benar-benar berubah ──
  const curSks = laporan.akademik?.sksKrs ?? null;
  const curIp = laporan.akademik?.ipKhs ?? null;
  const akPatch = patch.akademik ?? {};
  if ('sksKrs' in akPatch && akPatch.sksKrs !== curSks) {
    const bukti = akPatch.krsBukti ?? laporan.akademik?.krsBukti;
    if (!bukti) return new Response('Upload bukti KRS wajib dilampirkan karena SKS berubah.', { status: 400 });
    if (akPatch.sksKrs !== null && (!Number.isInteger(akPatch.sksKrs) || akPatch.sksKrs < 0 || akPatch.sksKrs > 200)) {
      return new Response('SKS tidak valid (0–200).', { status: 400 });
    }
  }
  if ('ipKhs' in akPatch && akPatch.ipKhs !== curIp) {
    const bukti = akPatch.khsBukti ?? laporan.akademik?.khsBukti;
    if (!bukti) return new Response('Upload bukti KHS wajib dilampirkan karena IP berubah.', { status: 400 });
    if (akPatch.ipKhs !== null && (typeof akPatch.ipKhs !== 'number' || akPatch.ipKhs < 0 || akPatch.ipKhs > 4)) {
      return new Response('IP tidak valid (0.00–4.00).', { status: 400 });
    }
  }

  // ── PKKMB/TOEFL/ESQ: bukti WAJIB setiap kali tercentang (true) — nilai
  // efektif = yang dikirim di patch kalau ada, kalau tidak pakai yang sudah
  // tersimpan (jadi resubmit tanpa menyentuh checkbox tidak minta upload ulang).
  const checks: [string, string, string][] = [
    ['pkkmb', 'pkkmbBukti', 'PKKMB'],
    ['toefl', 'toeflBukti', 'TOEFL'],
    ['esq', 'esqBukti', 'ESQ'],
  ];
  for (const [field, buktiField, label] of checks) {
    const effectiveChecked = field in patch ? patch[field] : master[field];
    const effectiveBukti = buktiField in patch ? patch[buktiField] : master[buktiField];
    if (effectiveChecked && !effectiveBukti) {
      return new Response(`Upload bukti ${label} wajib dilampirkan karena ${label} dicentang.`, { status: 400 });
    }
  }

  // ── Pisahkan ke dokumen master vs laporan (sama seperti split di client) ──
  const masterPatch: Record<string, unknown> = {};
  const laporanPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (MASTER_WRITABLE.has(key)) masterPatch[key] = value;
    else laporanPatch[key] = value;
  }

  // Hitung ulang statusPengisian dari hasil GABUNGAN data lama + patch.
  const mergedForStatus = JSON.parse(JSON.stringify(laporan));
  Object.entries(laporanPatch).forEach(([k, val]) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      mergedForStatus[k] = { ...(mergedForStatus[k] ?? {}), ...(val as object) };
    } else {
      mergedForStatus[k] = val;
    }
  });
  const statusPengisian = computeStatusPengisian({
    status: mergedForStatus.status ?? 'aktif',
    permasalahan: mergedForStatus.permasalahan ?? '',
    rekomendasi: mergedForStatus.rekomendasi ?? '',
    akademik: {
      sksKrs: mergedForStatus.akademik?.sksKrs ?? null,
      ipKhs: mergedForStatus.akademik?.ipKhs ?? null,
      konsultasi: mergedForStatus.akademik?.konsultasi ?? [],
      mkNilaiDE: mergedForStatus.akademik?.mkNilaiDE ?? [],
    },
  } as any);

  if (Object.keys(masterPatch).length) {
    await masterRef.set({ ...masterPatch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await laporanRef.set(
    { ...laporanPatch, statusPengisian, lastSelfServiceEditAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return Response.json({ ok: true });
}
