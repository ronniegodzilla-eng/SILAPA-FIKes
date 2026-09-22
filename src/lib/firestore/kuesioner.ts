import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDbOrThrow } from '../firebase';
import type {
  AktivasiKuesioner,
  JawabanKuesioner,
  Kuesioner,
  PertanyaanKuesioner,
} from '../types';

/**
 * Akses Firestore untuk kuesioner evaluasi.
 *
 * Yang TIDAK ada di sini: penulisan jawaban. Pengisinya mahasiswa tanpa login,
 * jadi seluruh penulisan jawaban terjadi di server lewat /api/public/kuesioner
 * (Admin SDK) — client SDK memang ditolak aturan Firestore.
 */

// ─── Bank instrumen ──────────────────────────────────────────────────────────

export async function fetchKuesionerBank(): Promise<Kuesioner[]> {
  const db = getDbOrThrow();
  const snap = await getDocs(collection(db, 'kuesioner'));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Kuesioner, 'id'>) }))
    .sort((a, b) => a.judul.localeCompare(b.judul, 'id'));
}

export async function simpanKuesioner(k: Kuesioner): Promise<void> {
  const db = getDbOrThrow();
  const { id, ...isi } = k;
  await setDoc(
    doc(db, 'kuesioner', id),
    { ...isi, updatedAt: serverTimestamp(), ...(k.createdAt ? {} : { createdAt: serverTimestamp() }) },
    { merge: true }
  );
}

export async function hapusKuesioner(id: string): Promise<void> {
  const db = getDbOrThrow();
  await deleteDoc(doc(db, 'kuesioner', id));
}

// ─── Pengaktifan ─────────────────────────────────────────────────────────────

export async function fetchAktivasi(periodeId: string): Promise<AktivasiKuesioner[]> {
  const db = getDbOrThrow();
  const snap = await getDocs(
    query(collection(db, 'kuesionerAktivasi'), where('periodeId', '==', periodeId))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<AktivasiKuesioner, 'id'>) }))
    .sort((a, b) => a.judul.localeCompare(b.judul, 'id'));
}

/**
 * Aktifkan satu instrumen pada satu periode.
 *
 * Pertanyaannya DISALIN dari bank, bukan dirujuk — lihat catatan pada tipe
 * AktivasiKuesioner. Instrumen di bank boleh disunting setelah ini tanpa
 * merusak jawaban yang sudah terkumpul.
 */
export async function aktifkanKuesioner(
  k: Kuesioner,
  periodeId: string,
  opsi: { wajib: boolean; tutupAt: string | null; dibuatOleh: string }
): Promise<AktivasiKuesioner> {
  const db = getDbOrThrow();
  const id = `${periodeId}_${k.id}`;
  const aktivasi: AktivasiKuesioner = {
    id,
    kuesionerId: k.id,
    periodeId,
    judul: k.judul,
    deskripsi: k.deskripsi,
    topik: k.topik,
    kerahasiaan: k.kerahasiaan,
    pertanyaan: k.pertanyaan as PertanyaanKuesioner[],
    wajib: opsi.wajib,
    status: 'terbuka',
    tutupAt: opsi.tutupAt,
    dibuatOleh: opsi.dibuatOleh,
  };
  const { id: _abaikan, ...isi } = aktivasi;
  await setDoc(doc(db, 'kuesionerAktivasi', id), { ...isi, createdAt: serverTimestamp() });
  return aktivasi;
}

export async function ubahStatusAktivasi(
  id: string,
  status: AktivasiKuesioner['status']
): Promise<void> {
  const db = getDbOrThrow();
  await setDoc(doc(db, 'kuesionerAktivasi', id), { status }, { merge: true });
}

export async function hapusAktivasi(id: string): Promise<void> {
  const db = getDbOrThrow();
  await deleteDoc(doc(db, 'kuesionerAktivasi', id));
}

// ─── Jawaban (baca saja — tim evaluasi & Wakil Dekan I) ──────────────────────

export async function fetchJawaban(aktivasiId: string): Promise<JawabanKuesioner[]> {
  const db = getDbOrThrow();
  const snap = await getDocs(
    query(collection(db, 'kuesionerJawaban'), where('aktivasiId', '==', aktivasiId))
  );
  return snap.docs.map((d) => d.data() as JawabanKuesioner);
}

export async function fetchKuesionerById(id: string): Promise<Kuesioner | null> {
  const db = getDbOrThrow();
  const snap = await getDoc(doc(db, 'kuesioner', id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Kuesioner, 'id'>) }) : null;
}
