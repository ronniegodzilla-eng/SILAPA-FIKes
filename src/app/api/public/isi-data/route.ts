import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { validateToken } from '@/lib/token-isi-data';
import { computeStatusPengisian } from '@/lib/compute';
import { KELAS_PILIHAN, SEMKES_MAX } from '@/lib/types';

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

const MASTER_WRITABLE = new Set(['pkkmb', 'pkkmbBukti', 'toefl', 'toeflBukti', 'esq', 'esqBukti', 'semkes', 'kelas']);

// Bentuk patch yang diterima — apa pun di luar ini DITOLAK (bukan cuma
// diabaikan) supaya kesalahan/percobaan tak terduga terlihat jelas di log,
// bukan diam-diam gagal.
const ALLOWED_SHAPE: Record<string, true | Record<string, true>> = {
  status: true,
  kelas: true,
  pkkmb: true, pkkmbBukti: true,
  toefl: true, toeflBukti: true,
  esq: true, esqBukti: true,
  semkes: true,
  akademik: {
    sksKrs: true, krsBukti: true,
    ipKhs: true, khsBukti: true,
    ipk: true,
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
const SEMKES_KEYS = new Set(['id', 'judul', 'bukti']);
const BEASISWA_KEYS = new Set(['ada', 'jenis', 'keterangan', 'bukti']);
const PRESTASI_KEYS = new Set(['ada', 'jenis', 'tingkat', 'bukti']);

/**
 * Nama field yang PERNAH dipakai lalu diganti. Halaman publik dibuka
 * mahasiswa di HP dan bisa tertinggal di bundel lama (mereka membuka link,
 * mengisi lama-lama, lalu menekan Simpan setelah aplikasi ter-deploy ulang).
 * Field-field ini dibuang diam-diam, bukan ditolak — kalau ditolak, isian
 * mereka hilang dengan pesan yang tidak mereka mengerti. Field yang memang
 * TERKUNCI (npm/nama/prodi/angkatan/kelas/dosenPaUid) tetap ditolak keras.
 */
const RETIRED_KEYS = new Set(['semkesCount']);

/**
 * Field identitas yang memang SENGAJA tidak boleh disentuh dari jalur publik.
 * Dibedakan dari field "tidak dikenal" biasa supaya percobaan mengubahnya
 * mendapat pesan tegas — bukan disamarkan jadi "halaman versi lama".
 */
// `kelas` sengaja TIDAK di sini: distribusi SIAKAD tidak memuat kelas, jadi
// hampir semua record masih '-' dan mahasiswanya sendiri yang paling tahu.
// Identitas yang menentukan SIAPA dan MILIK SIAPA record ini tetap terkunci.
const LOCKED_KEYS = new Set(['npm', 'nama', 'prodi', 'angkatan', 'dosenPaUid']);

function stripRetiredKeys(patch: any) {
  for (const key of RETIRED_KEYS) delete patch[key];
}

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

/**
 * Pengunduran diri menutup jalur isi-data mandiri. Selama menunggu keputusan
 * Wakil Dekan I data tidak boleh berubah — kalau ditolak, statusnya dipulihkan
 * ke kondisi saat diajukan, jadi suntingan di sela-sela itu justru menyesatkan.
 * Setelah disetujui, mahasiswanya sudah bukan bimbingan aktif sama sekali.
 * Mengembalikan pesan penolakan, atau '' bila boleh lanjut.
 */
function pesanUndurDiri(master: any, laporan: any): string {
  if (master?.mengundurkanDiri === true) {
    return 'Data Anda sudah ditutup karena pengunduran diri telah disahkan Wakil Dekan I. Hubungi dosen PA Anda bila ini keliru.';
  }
  if (laporan?.pengunduran?.status === 'diajukan') {
    return 'Pengajuan pengunduran diri Anda sedang menunggu validasi Wakil Dekan I — data tidak dapat diubah dulu. Hubungi dosen PA Anda bila ini keliru.';
  }
  return '';
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
      // Yang pengunduran dirinya sudah disahkan Wakil Dekan I tidak lagi
      // muncul di daftar pilihan: ia bukan mahasiswa aktif dosen ini lagi.
      .filter((m) => m.mengundurkanDiri !== true)
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
  const tolakUndurDiri = pesanUndurDiri(master, laporan);
  if (tolakUndurDiri) return new Response(tolakUndurDiri, { status: 423 });

  return Response.json({
    identitas: { npm: String(master.npm), nama: master.nama, prodi: master.prodi, angkatan: master.angkatan, kelas: master.kelas },
    semesterKe: laporan.semesterKe ?? 0,
    dikunciMandiri: !!laporan.dikunciMandiri,
    status: laporan.status ?? 'aktif',
    pkkmb: !!master.pkkmb, pkkmbBukti: master.pkkmbBukti ?? '',
    toefl: !!master.toefl, toeflBukti: master.toeflBukti ?? '',
    esq: !!master.esq, esqBukti: master.esqBukti ?? '',
    semkes: Array.isArray(master.semkes) ? master.semkes : [],
    akademik: {
      sksKrs: laporan.akademik?.sksKrs ?? null,
      krsBukti: laporan.akademik?.krsBukti ?? '',
      ipKhs: laporan.akademik?.ipKhs ?? null,
      ipk: laporan.akademik?.ipk ?? null,
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

  stripRetiredKeys(patch);
  const bad = findUnknownKeys(patch);
  if (bad.length) {
    const terkunci = bad.filter((k) => LOCKED_KEYS.has(k));
    if (terkunci.length) {
      return new Response(
        `Field tidak diizinkan diubah lewat isi-data mandiri: ${terkunci.join(', ')}.`,
        { status: 400 }
      );
    }
    return new Response(
      `Halaman ini sepertinya versi lama (field tidak dikenal: ${bad.join(', ')}). ` +
        'Muat ulang halaman lalu isi kembali.',
      { status: 400 }
    );
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

  // ── Record yang sudah diisi mahasiswa DIKUNCI ──
  // Satu link dibagikan ke seluruh bimbingan (grup WA), jadi tanpa ini siapa
  // pun yang memegang link bisa menimpa data temannya. Kunci dipasang otomatis
  // di akhir fungsi ini begitu simpan pertama berhasil; hanya dosen PA yang
  // dapat membukanya kembali lewat form-nya.
  const tolakUndurDiri = pesanUndurDiri(master, laporan);
  if (tolakUndurDiri) return new Response(tolakUndurDiri, { status: 423 });

  if (laporan.dikunciMandiri) {
    return new Response(
      'Data Anda sudah tersimpan dan dikunci. Bila masih perlu diperbaiki, hubungi dosen PA Anda untuk membuka kuncinya.',
      { status: 423 }
    );
  }

  // ── Semkes: judul wajib, bukti wajib, maksimal SEMKES_MAX ──
  if ('semkes' in patch) {
    const list = patch.semkes;
    if (!Array.isArray(list)) return new Response('Format semkes tidak valid.', { status: 400 });
    if (list.length > SEMKES_MAX) {
      return new Response(`Semkes maksimal ${SEMKES_MAX} entri.`, { status: 400 });
    }
    for (const e of list) {
      if (!e || typeof e !== 'object') return new Response('Format semkes tidak valid.', { status: 400 });
      const bad = Object.keys(e).filter((k) => !SEMKES_KEYS.has(k));
      if (bad.length) return new Response(`Field semkes tidak dikenal: ${bad.join(', ')}.`, { status: 400 });
      if (!String(e.judul ?? '').trim()) {
        return new Response('Judul seminar wajib diisi untuk setiap semkes.', { status: 400 });
      }
      if (!String(e.bukti ?? '').trim()) {
        return new Response(`Bukti sertifikat wajib diunggah untuk semkes "${String(e.judul).slice(0, 60)}".`, { status: 400 });
      }
    }
  }

  // ── Kelas harus salah satu pilihan resmi (atau '-' = belum tercatat) ──
  // Nilai ini dipakai untuk menyaring dan memindah bimbingan massal, jadi
  // teks bebas dari klien tidak boleh masuk begitu saja.
  if ('kelas' in patch) {
    const k = patch.kelas;
    if (k !== '-' && !KELAS_PILIHAN.includes(k)) {
      return new Response(`Kelas harus salah satu dari ${KELAS_PILIHAN.join(', ')}.`, { status: 400 });
    }
  }

  // ── IP/IPK harus dalam rentang wajar ──
  if ('ipk' in (patch.akademik ?? {})) {
    const v = patch.akademik.ipk;
    if (v !== null && (typeof v !== 'number' || v < 0 || v > 4)) {
      return new Response('IPK tidak valid (0.00–4.00).', { status: 400 });
    }
  }

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
    {
      ...laporanPatch,
      statusPengisian,
      // Kunci otomatis: sekali mahasiswa menyimpan, record ini tertutup dari
      // jalur publik sampai dosen PA membukanya lagi.
      dikunciMandiri: true,
      lastSelfServiceEditAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return Response.json({ ok: true });
}
