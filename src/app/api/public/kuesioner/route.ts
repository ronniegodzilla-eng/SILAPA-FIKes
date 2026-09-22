import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pengisian kuesioner oleh mahasiswa — TANPA LOGIN.
 *
 * Seluruh pemeriksaan terjadi di sini dengan Admin SDK; client SDK memang
 * ditolak aturan Firestore untuk koleksi jawaban dan token.
 *
 * GET  ?token=…                      → identitas tautan + daftar kuesioner terbuka
 * GET  ?token=…&npm=…&nama=…&prodi=… → verifikasi mahasiswa + status pengisiannya
 * POST { token, npm, nama, prodi, aktivasiId, jawaban }
 *
 * Verifikasi memakai NPM + Nama + Prodi sesuai keputusan pimpinan. Perlu
 * dicatat apa adanya: ketiganya diketahui teman sekelas, jadi ini menahan
 * salah orang dan salah ketik — bukan pemalsuan yang disengaja.
 */

type Ctx = {
  token: string;
  periodeId: string;
  lingkup: 'fakultas' | 'dosen';
  dosenUid: string | null;
};

async function bacaToken(token: string): Promise<{ ok: true; ctx: Ctx } | { ok: false; status: number; message: string }> {
  const db = getAdminDb();
  const snap = await db.doc(`tokenKuesioner/${token}`).get();
  if (!snap.exists) {
    return {
      ok: false,
      status: 404,
      message: 'Link ini tidak dikenali. Kemungkinan tersalin tidak utuh — minta link terbaru kepada dosen PA atau tim evaluasi.',
    };
  }
  const d = snap.data() as any;
  if (d.active === false) {
    return {
      ok: false,
      status: 410,
      message: 'Link ini sudah diganti dengan yang baru. Minta link terbaru kepada dosen PA atau tim evaluasi Anda.',
    };
  }
  const periodeSnap = await db.doc(`periode/${d.periodeId}`).get();
  if (!periodeSnap.exists || (periodeSnap.data() as any).status === 'dikunci') {
    return { ok: false, status: 410, message: 'Periode pengisian sudah ditutup.' };
  }
  return { ok: true, ctx: { token, periodeId: d.periodeId, lingkup: d.lingkup, dosenUid: d.dosenUid ?? null } };
}

/** Aktivasi yang sedang terbuka pada periode ini. */
async function aktivasiTerbuka(periodeId: string) {
  const db = getAdminDb();
  const snap = await db
    .collection('kuesionerAktivasi')
    .where('periodeId', '==', periodeId)
    .where('status', '==', 'terbuka')
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a, b) => String(a.judul).localeCompare(String(b.judul), 'id'));
}


/** Minimal karakter sebelum mencari, dan maksimal hasil yang dikembalikan. */
const CARI_MIN = 3;
const CARI_MAKS = 8;

/**
 * Daftar mahasiswa yang boleh mengisi pada periode ini, disimpan di memori.
 *
 * Pencarian ketik-langsung memanggil endpoint ini berkali-kali per mahasiswa.
 * Tanpa singgahan, tiap ketukan berarti membaca ~2.000 dokumen mahasiswa —
 * lambat di ponsel dan mahal di Firestore. Dengan singgahan, pembacaan itu
 * terjadi sekali per beberapa menit per instance.
 *
 * Isinya bukan rahasia yang berumur panjang: nama dan NPM mahasiswa aktif.
 * Umur singgahan dibuat pendek supaya mahasiswa yang baru ditambahkan tidak
 * kelamaan tidak ditemukan.
 */
let singgahan: { periodeId: string; sampai: number; daftar: KandidatCari[] } | null = null;
const SINGGAHAN_MS = 5 * 60 * 1000;

interface KandidatCari {
  npm: string;
  nama: string;
  prodi: string;
  semesterKe: number;
  dosenPaUid: string | null;
  dosenNama: string;
}

async function kandidatPeriode(periodeId: string): Promise<KandidatCari[]> {
  if (singgahan && singgahan.periodeId === periodeId && singgahan.sampai > Date.now()) {
    return singgahan.daftar;
  }
  const db = getAdminDb();
  const [mhsSnap, lapSnap, subsSnap] = await Promise.all([
    db.collection('mahasiswa').get(),
    db.collection('laporan').where('periodeId', '==', periodeId).get(),
    db.collection('submissions').where('periodeId', '==', periodeId).get(),
  ]);
  const master = new Map(mhsSnap.docs.map((d) => [(d.data() as any).npm, d.data() as any]));
  const namaDosen = new Map<string, string>(
    subsSnap.docs.map((d) => [(d.data() as any).dosenUid, (d.data() as any).nama ?? ''])
  );
  // Hanya yang punya laporan periode ini — merekalah yang diminta mengisi.
  const daftar: KandidatCari[] = lapSnap.docs
    .map((d) => d.data() as any)
    .map((l) => {
      const m = master.get(l.npm) ?? {};
      return {
        npm: String(l.npm),
        nama: String(m.nama ?? ''),
        prodi: String(m.prodi ?? l.prodi ?? ''),
        semesterKe: Number(l.semesterKe ?? 0),
        dosenPaUid: l.dosenPaUid ?? null,
        dosenNama: namaDosen.get(l.dosenPaUid) ?? '',
      };
    })
    .filter((k) => k.nama);
  singgahan = { periodeId, sampai: Date.now() + SINGGAHAN_MS, daftar };
  return daftar;
}

/** Cocokkan identitas. Nama dibandingkan longgar — spasi ganda dan besar-kecil huruf diabaikan. */
const rapikan = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const token = sp.get('token') ?? '';
  const v = await bacaToken(token);
  if (!v.ok) return new Response(v.message, { status: v.status });
  const { ctx } = v;

  const db = getAdminDb();
  const periodeSnap = await db.doc(`periode/${ctx.periodeId}`).get();
  const p = periodeSnap.data() as any;
  const periodeLabel = `${p.tahunAkademik} — Semester ${p.semester === 'genap' ? 'Genap' : 'Ganjil'}`;

  const daftar = await aktivasiTerbuka(ctx.periodeId);

  // Pencarian ketik-langsung: mahasiswa boleh mengetik NPM ATAU nama — banyak
  // yang hafal namanya tapi tidak hafal NPM 12 digitnya.
  const cari = sp.get('cari');
  if (cari !== null) {
    const q = cari.trim().toLowerCase();
    if (q.length < CARI_MIN) {
      return Response.json({ hasil: [], minimal: CARI_MIN });
    }
    let kandidat = await kandidatPeriode(ctx.periodeId);
    if (ctx.lingkup === 'dosen') kandidat = kandidat.filter((k) => k.dosenPaUid === ctx.dosenUid);
    const cocok = kandidat
      .filter((k) => k.npm.includes(q) || k.nama.toLowerCase().includes(q))
      // Yang namanya diawali ketikan didahulukan — biasanya itu yang dicari.
      .sort((a, b) => {
        const ap = a.nama.toLowerCase().startsWith(q) || a.npm.startsWith(q) ? 0 : 1;
        const bp = b.nama.toLowerCase().startsWith(q) || b.npm.startsWith(q) ? 0 : 1;
        return ap - bp || a.nama.localeCompare(b.nama, 'id');
      });
    return Response.json({
      hasil: cocok.slice(0, CARI_MAKS).map((k) => ({
        npm: k.npm, nama: k.nama, prodi: k.prodi, semesterKe: k.semesterKe, dosenNama: k.dosenNama,
      })),
      lebih: Math.max(0, cocok.length - CARI_MAKS),
      minimal: CARI_MIN,
    });
  }

  const npm = sp.get('npm');
  if (!npm) {
    // Tahap 1: mahasiswa belum mengisi identitas.
    return Response.json({
      periodeLabel,
      lingkup: ctx.lingkup,
      adaKuesioner: daftar.length > 0,
      jumlahKuesioner: daftar.length,
    });
  }

  // Tahap 2: verifikasi identitas.
  const mhsSnap = await db.doc(`mahasiswa/${npm.trim()}`).get();
  if (!mhsSnap.exists) {
    return new Response('NPM tidak ditemukan. Periksa kembali penulisannya.', { status: 404 });
  }
  const m = mhsSnap.data() as any;
  if (rapikan(m.nama) !== rapikan(sp.get('nama'))) {
    return new Response('Nama tidak cocok dengan NPM tersebut. Tulis nama lengkap sesuai data kampus.', { status: 403 });
  }
  if (String(m.prodi ?? '') !== String(sp.get('prodi') ?? '')) {
    return new Response('Prodi tidak cocok dengan NPM tersebut.', { status: 403 });
  }

  const laporanSnap = await db.doc(`laporan/${ctx.periodeId}_${npm.trim()}`).get();
  if (!laporanSnap.exists) {
    return new Response(
      'Anda tidak terdaftar pada periode pelaporan ini, sehingga belum perlu mengisi kuesioner. Hubungi dosen PA bila ini keliru.',
      { status: 404 }
    );
  }
  const lap = laporanSnap.data() as any;

  // Tautan dosen hanya berlaku untuk bimbingannya sendiri.
  if (ctx.lingkup === 'dosen' && lap.dosenPaUid !== ctx.dosenUid) {
    return new Response(
      'Link ini dibagikan oleh dosen PA lain. Minta link kepada dosen PA Anda sendiri, atau pakai link umum dari tim evaluasi.',
      { status: 403 }
    );
  }

  const sudah: string[] = Array.isArray(lap.kuesionerTerisi) ? lap.kuesionerTerisi : [];
  return Response.json({
    periodeLabel,
    mahasiswa: { npm: m.npm, nama: m.nama, prodi: m.prodi, semesterKe: lap.semesterKe ?? 0 },
    kuesioner: daftar.map((a) => ({
      id: a.id,
      judul: a.judul,
      deskripsi: a.deskripsi ?? '',
      wajib: !!a.wajib,
      pertanyaan: a.pertanyaan ?? [],
      sudahDiisi: sudah.includes(a.id),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return new Response('Body JSON tidak valid.', { status: 400 });
  const { token, npm, nama, prodi, aktivasiId, jawaban } = body as Record<string, any>;

  const v = await bacaToken(String(token ?? ''));
  if (!v.ok) return new Response(v.message, { status: v.status });
  const { ctx } = v;

  const db = getAdminDb();
  const npmBersih = String(npm ?? '').trim();
  const mhsSnap = await db.doc(`mahasiswa/${npmBersih}`).get();
  if (!mhsSnap.exists) return new Response('NPM tidak ditemukan.', { status: 404 });
  const m = mhsSnap.data() as any;
  if (rapikan(m.nama) !== rapikan(nama) || String(m.prodi ?? '') !== String(prodi ?? '')) {
    return new Response('Identitas tidak cocok. Ulangi dari halaman awal.', { status: 403 });
  }

  const aktivasiSnap = await db.doc(`kuesionerAktivasi/${String(aktivasiId ?? '')}`).get();
  if (!aktivasiSnap.exists) return new Response('Kuesioner tidak ditemukan.', { status: 404 });
  const a = aktivasiSnap.data() as any;
  if (a.periodeId !== ctx.periodeId) return new Response('Kuesioner ini bukan milik periode pada link Anda.', { status: 400 });
  if (a.status !== 'terbuka') return new Response('Kuesioner ini sudah ditutup.', { status: 410 });

  const laporanRef = db.doc(`laporan/${ctx.periodeId}_${npmBersih}`);
  const laporanSnap = await laporanRef.get();
  if (!laporanSnap.exists) return new Response('Anda tidak terdaftar pada periode ini.', { status: 404 });
  const lap = laporanSnap.data() as any;
  if (ctx.lingkup === 'dosen' && lap.dosenPaUid !== ctx.dosenUid) {
    return new Response('Link ini dibagikan oleh dosen PA lain.', { status: 403 });
  }

  const jawabanRef = db.doc(`kuesionerJawaban/${a.id ?? aktivasiId}_${npmBersih}`);
  if ((await jawabanRef.get()).exists) {
    return new Response('Kuesioner ini sudah Anda isi sebelumnya. Jawaban tidak dapat diubah.', { status: 409 });
  }

  // Pertanyaan wajib harus terjawab — diperiksa di server, bukan hanya di layar.
  const isi = (jawaban ?? {}) as Record<string, unknown>;
  const pertanyaan = Array.isArray(a.pertanyaan) ? a.pertanyaan : [];
  const kosong = pertanyaan.filter(
    (p: any) => p.wajib && (isi[p.id] === undefined || isi[p.id] === null || String(isi[p.id]).trim() === '')
  );
  if (kosong.length) {
    return new Response(`Masih ada ${kosong.length} pertanyaan wajib yang belum dijawab.`, { status: 400 });
  }
  const dikenal = new Set(pertanyaan.map((p: any) => p.id));
  const asing = Object.keys(isi).filter((k) => !dikenal.has(k));
  if (asing.length) return new Response('Ada jawaban untuk pertanyaan yang tidak dikenal.', { status: 400 });

  const dosenUid = lap.dosenPaUid ?? null;
  let dosenNama = '';
  if (dosenUid) {
    const u = await db.doc(`users/${dosenUid}`).get();
    dosenNama = u.exists ? String((u.data() as any).nama ?? '') : '';
  }

  // Jawaban DAN penanda kepatuhan ditulis bersama. Penandanya menumpang di
  // dokumen laporan karena di situlah dosen PA sudah punya izin baca — ia
  // perlu tahu siapa yang belum mengisi, tanpa bisa menyentuh jawabannya.
  const batch = db.batch();
  batch.set(jawabanRef, {
    aktivasiId: a.id ?? aktivasiId,
    periodeId: ctx.periodeId,
    npm: npmBersih,
    nama: m.nama ?? '',
    prodi: m.prodi ?? '',
    semesterKe: lap.semesterKe ?? 0,
    dosenPaUid: dosenUid,
    dosenNama,
    jawaban: isi,
    sumberTautan: ctx.lingkup === 'fakultas' ? 'evaluasi' : 'dosen',
    submittedAt: FieldValue.serverTimestamp(),
  });
  batch.set(
    laporanRef,
    { kuesionerTerisi: FieldValue.arrayUnion(a.id ?? aktivasiId) },
    { merge: true }
  );
  await batch.commit();

  return Response.json({ ok: true });
}
