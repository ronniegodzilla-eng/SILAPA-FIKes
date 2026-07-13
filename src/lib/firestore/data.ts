import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDbOrThrow } from '../firebase';
import { computeSemesterKe, computeStatusPengisian, computeWadekAggregates, type WadekAggregates } from '../compute';
import type {
  DosenRosterEntry,
  MahasiswaRecord,
  Periode,
  PeriodeHistoryEntry,
  StatusKirim,
  PeriodeStatus,
} from '../types';

/** Master-only fields that live on `mahasiswa/{npm}`. */
const MASTER_FIELDS = new Set([
  'nama',
  'prodi',
  'angkatan',
  'kelas',
  'dosenPaUid',
  'pkkmb',
  'toefl',
  'esq',
  'semkesCount',
  'ipHistory',
  'pkkmbBukti',
  'toeflBukti',
  'esqBukti',
]);

function laporanId(periodeId: string, npm: string) {
  return `${periodeId}_${npm}`;
}

/** Split a composed MahasiswaRecord into its master + laporan Firestore docs. */
function splitRecord(rec: MahasiswaRecord) {
  const master = {
    npm: rec.npm,
    nama: rec.nama,
    prodi: rec.prodi,
    angkatan: rec.angkatan,
    kelas: rec.kelas,
    dosenPaUid: rec.dosenPaUid ?? null,
    pkkmb: rec.pkkmb,
    toefl: rec.toefl,
    esq: rec.esq,
    semkesCount: rec.semkesCount,
    ipHistory: rec.ipHistory,
    pkkmbBukti: rec.pkkmbBukti ?? null,
    toeflBukti: rec.toeflBukti ?? null,
    esqBukti: rec.esqBukti ?? null,
  };
  const laporan = {
    npm: rec.npm,
    prodi: rec.prodi,
    dosenPaUid: rec.dosenPaUid ?? null,
    semesterKe: rec.semesterKe,
    semesterKeManual: rec.semesterKeManual ?? false,
    kelas: rec.kelas,
    status: rec.status,
    akademik: rec.akademik,
    nonAkademik: rec.nonAkademik,
    skripsi: rec.skripsi,
    permasalahan: rec.permasalahan,
    rekomendasi: rec.rekomendasi,
    statusPengisian: rec.statusPengisian,
  };
  return { master, laporan };
}

/** Compose master + laporan docs back into the UI's MahasiswaRecord. */
function mergeRecord(master: any, laporan: any): MahasiswaRecord {
  return {
    npm: master.npm,
    nama: master.nama,
    prodi: master.prodi,
    angkatan: master.angkatan,
    kelas: master.kelas,
    dosenPaUid: master.dosenPaUid ?? undefined,
    pkkmb: master.pkkmb,
    toefl: master.toefl,
    esq: master.esq,
    semkesCount: master.semkesCount,
    ipHistory: master.ipHistory ?? [],
    pkkmbBukti: master.pkkmbBukti ?? undefined,
    toeflBukti: master.toeflBukti ?? undefined,
    esqBukti: master.esqBukti ?? undefined,
    semesterKe: laporan?.semesterKe ?? 0,
    semesterKeManual: laporan?.semesterKeManual ?? false,
    // Without a laporan (admin master view), fall back to the master statusGlobal.
    status: laporan?.status ?? master.statusGlobal ?? 'aktif',
    akademik: laporan?.akademik
      ? { ...laporan.akademik, konsultasi: laporan.akademik.konsultasi ?? [] }
      : { sksKrs: null, ipKhs: null, konsultasi: [], mkNilaiDE: [] },
    nonAkademik:
      laporan?.nonAkademik ?? {
        ukm: false, hima: false, bem: false,
        beasiswa: { ada: false, jenis: null, keterangan: '' },
        prestasi: { ada: false, jenis: null, tingkat: null },
      },
    skripsi: laporan?.skripsi ?? { tahap: 'belum', kendala: '' },
    permasalahan: laporan?.permasalahan ?? '',
    rekomendasi: laporan?.rekomendasi ?? '',
    statusPengisian: laporan?.statusPengisian ?? 'kosong',
  };
}

// ─── Periode ────────────────────────────────────────────────────────────

export async function fetchActivePeriode(): Promise<Periode | null> {
  const db = getDbOrThrow();
  const snap = await getDocs(collection(db, 'periode'));
  const list = (snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Periode[])
    // Newest first — periode ids sort chronologically (YYYY-YYYY-semester).
    .sort((a, b) => b.id.localeCompare(a.id));
  // Prefer the NEWEST non-locked periode; otherwise the newest overall.
  const active = list.find((p) => p.status !== 'dikunci');
  return active ?? list[0] ?? null;
}

export async function fetchPeriodeHistory(): Promise<PeriodeHistoryEntry[]> {
  const db = getDbOrThrow();
  const snap = await getDocs(collection(db, 'periode'));
  return snap.docs
    .map((d) => {
      const p = d.data() as any;
      return {
        id: d.id,
        label: `${p.tahunAkademik} · ${p.semester === 'genap' ? 'Genap' : 'Ganjil'}`,
        status: p.status as PeriodeStatus,
      };
    })
    .filter((p) => p.status === 'dikunci')
    .sort((a, b) => b.id.localeCompare(a.id));
}

export async function updatePeriodeStatus(periodeId: string, status: PeriodeStatus) {
  const db = getDbOrThrow();
  // Jejak audit AMI (PRD §4.3): catat waktu buka & tutup pengisian.
  const stamps: Record<string, unknown> = {};
  if (status === 'dibuka') stamps.tanggalBuka = serverTimestamp();
  if (status === 'verifikasi') stamps.tanggalTutup = serverTimestamp();
  await updateDoc(doc(db, 'periode', periodeId), { status, ...stamps });
}

// ─── Mahasiswa + Laporan ────────────────────────────────────────────────

/** Load composed records for a periode, optionally filtered to one dosen. */
export async function fetchMahasiswaRecords(
  periodeId: string,
  opts?: { dosenPaUid?: string }
): Promise<MahasiswaRecord[]> {
  const db = getDbOrThrow();

  const laporanQ = opts?.dosenPaUid
    ? query(
        collection(db, 'laporan'),
        where('periodeId', '==', periodeId),
        where('dosenPaUid', '==', opts.dosenPaUid)
      )
    : query(collection(db, 'laporan'), where('periodeId', '==', periodeId));
  const laporanSnap = await getDocs(laporanQ);
  const laporanByNpm = new Map<string, any>();
  laporanSnap.docs.forEach((d) => laporanByNpm.set((d.data() as any).npm, d.data()));

  const masterSnap = await getDocs(collection(db, 'mahasiswa'));
  const records: MahasiswaRecord[] = [];
  masterSnap.docs.forEach((d) => {
    const master = d.data();
    const laporan = laporanByNpm.get(master.npm);
    if (!laporan) return; // no laporan for this periode → not in scope
    if (opts?.dosenPaUid && laporan.dosenPaUid !== opts.dosenPaUid) return;
    records.push(mergeRecord(master, laporan));
  });
  // Preserve NPM order for stable tables.
  records.sort((a, b) => a.npm.localeCompare(b.npm));
  return records;
}

/** All master mahasiswa (admin master table, may include those without laporan). */
export async function fetchAllMahasiswaMaster(): Promise<MahasiswaRecord[]> {
  const db = getDbOrThrow();
  const masterSnap = await getDocs(collection(db, 'mahasiswa'));
  return masterSnap.docs
    .map((d) => mergeRecord(d.data(), null))
    .sort((a, b) => a.npm.localeCompare(b.npm));
}

/** Build a minimal nested object holding only `path` = value-from-record. */
function pluckPath(rec: MahasiswaRecord, path: string): Record<string, unknown> {
  const parts = path.split('.');
  let src: any = rec;
  for (const p of parts) src = src?.[p];
  const out: Record<string, unknown> = {};
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = src === undefined ? null : src;
  return out;
}

/**
 * Persist a single field change to the correct doc. `path` uses dot notation
 * e.g. 'akademik.sksKrs', 'pkkmb', 'status'. Writes ONLY the changed path
 * (merge) so concurrent edits/imports are never clobbered, plus the
 * recomputed statusPengisian for laporan-side changes.
 */
export async function persistMahasiswaField(
  periodeId: string,
  nextRecord: MahasiswaRecord,
  path: string,
  opts?: { skipStatusPengisian?: boolean }
) {
  const db = getDbOrThrow();
  const top = path.split('.')[0];
  const patch = pluckPath(nextRecord, path);
  if (MASTER_FIELDS.has(top)) {
    await setDoc(
      doc(db, 'mahasiswa', nextRecord.npm),
      { ...patch, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } else {
    const extra = opts?.skipStatusPengisian
      ? {}
      : { statusPengisian: nextRecord.statusPengisian };
    await setDoc(
      doc(db, 'laporan', laporanId(periodeId, nextRecord.npm)),
      { ...patch, ...extra, periodeId, npm: nextRecord.npm },
      { merge: true }
    );
  }
}

export async function createMahasiswaMaster(rec: MahasiswaRecord, periodeId: string) {
  const db = getDbOrThrow();
  const { master, laporan } = splitRecord(rec);
  const batch = writeBatch(db);
  batch.set(doc(db, 'mahasiswa', rec.npm), master);
  batch.set(doc(db, 'laporan', laporanId(periodeId, rec.npm)), { ...laporan, periodeId });
  await batch.commit();
}

export async function saveMahasiswaMasterEdit(
  npm: string,
  fields: { nama: string; prodi: string; kelas: string; angkatan: number }
) {
  const db = getDbOrThrow();
  await updateDoc(doc(db, 'mahasiswa', npm), { ...fields, updatedAt: serverTimestamp() });
}

export async function setMahasiswaStatusGlobal(npm: string, statusGlobal: string) {
  const db = getDbOrThrow();
  await updateDoc(doc(db, 'mahasiswa', npm), { statusGlobal });
}

// ─── Users (admin) ──────────────────────────────────────────────────────

/** All registered accounts (admin/wadek may read the users collection). */
export async function fetchAllUsers(): Promise<import('../types').AppUser[]> {
  const db = getDbOrThrow();
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => ({ uid: d.id, ...(d.data() as any) }))
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
}

// ─── Submissions / dosen roster ─────────────────────────────────────────

export async function fetchDosenRoster(
  periodeId: string,
  opts?: { dosenUid?: string }
): Promise<DosenRosterEntry[]> {
  const db = getDbOrThrow();
  // Dosen may only read their own submission (Security Rules), so the query
  // must carry the dosenUid filter to be provable; admin/wadek read all.
  const q = opts?.dosenUid
    ? query(
        collection(db, 'submissions'),
        where('periodeId', '==', periodeId),
        where('dosenUid', '==', opts.dosenUid)
      )
    : query(collection(db, 'submissions'), where('periodeId', '==', periodeId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as any)
    .map((s) => ({
      dosenUid: s.dosenUid ?? '',
      nama: s.nama,
      prodi: s.prodi,
      jumlah: s.jumlah,
      statusKirim: s.status as StatusKirim,
      catatanWadek: s.catatanWadek ?? '',
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

export async function updateSubmissionStatus(
  periodeId: string,
  target: { nama?: string; dosenUid?: string },
  status: StatusKirim,
  catatan?: string
) {
  const db = getDbOrThrow();
  // Dosen must target by their own dosenUid (rules provability); wadek by nama.
  const filterField = target.dosenUid ? 'dosenUid' : 'nama';
  const filterValue = target.dosenUid ?? target.nama ?? '';
  const snap = await getDocs(
    query(
      collection(db, 'submissions'),
      where('periodeId', '==', periodeId),
      where(filterField, '==', filterValue)
    )
  );
  // Jejak audit (PRD §4.5): waktu kirim & waktu verifikasi.
  const patch: Record<string, unknown> = { status };
  if (catatan !== undefined) patch.catatanWadek = catatan;
  if (status === 'dikirim') patch.dikirimAt = serverTimestamp();
  if (status === 'diverifikasi') patch.diverifikasiAt = serverTimestamp();
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, patch)));
}

/**
 * Stempel submittedAt pada seluruh laporan milik dosen saat laporan dikirim
 * (PRD §4.4). Dipanggil bersama updateSubmissionStatus('dikirim').
 */
export async function markLaporanSubmitted(periodeId: string, dosenUid: string) {
  const db = getDbOrThrow();
  const snap = await getDocs(
    query(
      collection(db, 'laporan'),
      where('periodeId', '==', periodeId),
      where('dosenPaUid', '==', dosenUid)
    )
  );
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { submittedAt: serverTimestamp() }));
  await batch.commit();
}

export async function updateSubmissionJumlah(
  periodeId: string,
  dosenNama: string,
  delta: number
) {
  const db = getDbOrThrow();
  const snap = await getDocs(
    query(
      collection(db, 'submissions'),
      where('periodeId', '==', periodeId),
      where('nama', '==', dosenNama)
    )
  );
  await Promise.all(
    snap.docs.map((d) =>
      updateDoc(d.ref, { jumlah: ((d.data() as any).jumlah ?? 0) + delta })
    )
  );
}

// ─── A2: Import massal ──────────────────────────────────────────────────

export interface ImportNilaiRow {
  npm: string;
  sksKrs: number;
  ipKhs: number;
}

/**
 * Commit validated KRS/KHS rows (PRD §5.3 A2). Each row updates only
 * akademik.sksKrs / akademik.ipKhs on the laporan doc and recomputes
 * statusPengisian from the full stored record. NPM is a string throughout.
 * Returns NPMs that had no laporan record in this periode.
 */
export async function commitImportNilai(
  periodeId: string,
  rows: ImportNilaiRow[]
): Promise<{ committed: number; missing: string[] }> {
  const db = getDbOrThrow();
  const missing: string[] = [];
  let committed = 0;
  for (const row of rows) {
    const ref = doc(db, 'laporan', laporanId(periodeId, row.npm));
    let snap;
    try {
      snap = await getDoc(ref);
    } catch {
      // Dosen may not read records that aren't theirs — a permission error
      // on an unknown NPM means the same thing as "no record": skip it.
      missing.push(row.npm);
      continue;
    }
    if (!snap.exists()) {
      missing.push(row.npm);
      continue;
    }
    const cur = snap.data() as any;
    const akademik = { ...cur.akademik, sksKrs: row.sksKrs, ipKhs: row.ipKhs };
    const next = { ...cur, akademik };
    const patch: Record<string, unknown> = {
      'akademik.sksKrs': row.sksKrs,
      'akademik.ipKhs': row.ipKhs,
      statusPengisian: computeStatusPengisian(next),
    };
    await updateDoc(ref, patch);
    committed++;
  }
  return { committed, missing };
}

/** One row of the full-form import (D2) — undefined field = leave unchanged. */
export interface ImportLengkapRow {
  npm: string;
  // laporan
  status?: string;
  sksKrs?: number | null;
  ipKhs?: number | null;
  /** Menambahkan (append) satu entri konsultasi — tidak menimpa yang sudah ada. */
  tambahKonsultasi?: import('../types').KonsultasiEntry;
  mkNilaiDE?: string[];
  ukm?: boolean;
  hima?: boolean;
  bem?: boolean;
  beasiswa?: { ada: boolean; jenis: string | null };
  prestasi?: { ada: boolean; jenis: string | null; tingkat: string | null };
  skripsiTahap?: string;
  skripsiKendala?: string;
  permasalahan?: string;
  rekomendasi?: string;
  // master (sekali-seumur-kuliah)
  pkkmb?: boolean;
  toefl?: boolean;
  esq?: boolean;
  semkesCount?: number;
}

/**
 * Commit full-form rows (D2 "isi massal lengkap"). Per row: patch only the
 * provided fields on the laporan doc (dot paths), recompute statusPengisian
 * from the merged result, and patch once-per-degree master fields.
 */
export async function commitImportLengkap(
  periodeId: string,
  rows: ImportLengkapRow[]
): Promise<{ committed: number; missing: string[] }> {
  const db = getDbOrThrow();
  const missing: string[] = [];
  let committed = 0;

  for (const row of rows) {
    const ref = doc(db, 'laporan', laporanId(periodeId, row.npm));
    let snap;
    try {
      snap = await getDoc(ref);
    } catch {
      missing.push(row.npm);
      continue;
    }
    if (!snap.exists()) {
      missing.push(row.npm);
      continue;
    }
    const cur = snap.data() as any;

    const patch: Record<string, unknown> = {};
    const set = (path: string, v: unknown) => {
      if (v !== undefined) patch[path] = v;
    };
    set('status', row.status);
    set('akademik.sksKrs', row.sksKrs);
    set('akademik.ipKhs', row.ipKhs);
    set('akademik.mkNilaiDE', row.mkNilaiDE);
    // Konsultasi selalu ditambahkan (append), tidak pernah menimpa entri lama.
    if (row.tambahKonsultasi !== undefined) {
      const existing: import('../types').KonsultasiEntry[] = cur.akademik?.konsultasi ?? [];
      set('akademik.konsultasi', [...existing, row.tambahKonsultasi]);
    }
    set('nonAkademik.ukm', row.ukm);
    set('nonAkademik.hima', row.hima);
    set('nonAkademik.bem', row.bem);
    if (row.beasiswa !== undefined) {
      set('nonAkademik.beasiswa.ada', row.beasiswa.ada);
      set('nonAkademik.beasiswa.jenis', row.beasiswa.jenis);
    }
    if (row.prestasi !== undefined) {
      set('nonAkademik.prestasi.ada', row.prestasi.ada);
      set('nonAkademik.prestasi.jenis', row.prestasi.jenis);
      set('nonAkademik.prestasi.tingkat', row.prestasi.tingkat);
    }
    set('skripsi.tahap', row.skripsiTahap);
    set('skripsi.kendala', row.skripsiKendala);
    set('permasalahan', row.permasalahan);
    set('rekomendasi', row.rekomendasi);

    // Merge patch into current doc to recompute kelengkapan.
    const next = JSON.parse(JSON.stringify(cur));
    Object.entries(patch).forEach(([path, v]) => {
      const parts = path.split('.');
      let o: any = next;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] ?? (o[parts[i]] = {});
      o[parts[parts.length - 1]] = v;
    });
    patch['statusPengisian'] = computeStatusPengisian(next);
    await updateDoc(ref, patch);

    // Master fields (rules allow dosen: pkkmb/toefl/esq/semkesCount).
    const masterPatch: Record<string, unknown> = {};
    if (row.pkkmb !== undefined) masterPatch.pkkmb = row.pkkmb;
    if (row.toefl !== undefined) masterPatch.toefl = row.toefl;
    if (row.esq !== undefined) masterPatch.esq = row.esq;
    if (row.semkesCount !== undefined) masterPatch.semkesCount = row.semkesCount;
    if (Object.keys(masterPatch).length) {
      await setDoc(doc(db, 'mahasiswa', row.npm), masterPatch, { merge: true });
    }
    committed++;
  }
  return { committed, missing };
}

// ─── A3: Plotting ───────────────────────────────────────────────────────

/**
 * Move students to another dosen PA. Master assignment always changes;
 * the active-periode laporan snapshot moves only when `alsoCurrentLaporan`
 * (PRD §7.3 — by default a move applies starting next periode).
 */
export async function movePlottingMahasiswa(
  periodeId: string,
  npms: string[],
  targetDosenUid: string,
  alsoCurrentLaporan: boolean
) {
  const db = getDbOrThrow();
  const batch = writeBatch(db);
  for (const npm of npms) {
    batch.update(doc(db, 'mahasiswa', npm), { dosenPaUid: targetDosenUid });
    if (alsoCurrentLaporan) {
      batch.set(
        doc(db, 'laporan', laporanId(periodeId, npm)),
        { dosenPaUid: targetDosenUid },
        { merge: true }
      );
    }
  }
  await batch.commit();
}

// ─── A4: Periode ────────────────────────────────────────────────────────

export async function createPeriode(p: {
  id: string;
  tahunAkademik: string;
  semester: 'ganjil' | 'genap';
}) {
  const db = getDbOrThrow();
  await setDoc(doc(db, 'periode', p.id), {
    tahunAkademik: p.tahunAkademik,
    semester: p.semester,
    status: 'draft',
  });
}

/**
 * "Buka periode" (PRD §4.6/§5.3 A4): generate one laporan doc per mahasiswa
 * from the current plotting, with semesterKe computed from angkatan+periode.
 * Also seeds this periode's submissions from the previous roster (status
 * reset to draft) and finally flips the periode to "dibuka".
 * Existing laporan docs are never overwritten (idempotent).
 */
export async function bukaPeriodeGenerate(periode: {
  id: string;
  tahunAkademik: string;
  semester: 'ganjil' | 'genap';
}): Promise<{ generated: number; skipped: number }> {
  const db = getDbOrThrow();
  const tahunAwal = Number(periode.tahunAkademik.split('/')[0]);

  const masterSnap = await getDocs(collection(db, 'mahasiswa'));
  const existingSnap = await getDocs(
    query(collection(db, 'laporan'), where('periodeId', '==', periode.id))
  );
  const existing = new Set(existingSnap.docs.map((d) => (d.data() as any).npm as string));

  let generated = 0;
  let skipped = 0;
  const batch = writeBatch(db);
  const perDosen = new Map<string, number>();

  masterSnap.docs.forEach((d) => {
    const m = d.data() as any;
    const sg = m.statusGlobal ?? 'aktif';
    if (sg === 'lulus' || sg === 'keluar') return; // no report needed
    perDosen.set(m.dosenPaUid ?? '', (perDosen.get(m.dosenPaUid ?? '') ?? 0) + 1);
    if (existing.has(m.npm)) {
      skipped++;
      return;
    }
    batch.set(doc(db, 'laporan', laporanId(periode.id, m.npm)), {
      periodeId: periode.id,
      npm: m.npm,
      dosenPaUid: m.dosenPaUid ?? null,
      prodi: m.prodi,
      semesterKe: computeSemesterKe(m.angkatan, tahunAwal, periode.semester),
      semesterKeManual: false,
      kelas: m.kelas,
      status: sg === 'cuti' || sg === 'non_aktif' ? sg : 'aktif',
      akademik: { sksKrs: null, ipKhs: null, konsultasi: [], mkNilaiDE: [] },
      nonAkademik: {
        ukm: false, hima: false, bem: false,
        beasiswa: { ada: false, jenis: null, keterangan: '' },
        prestasi: { ada: false, jenis: null, tingkat: null },
      },
      skripsi: { tahap: 'belum', kendala: '' },
      permasalahan: '', rekomendasi: '',
      statusPengisian: 'kosong',
      submittedAt: null,
    });
    generated++;
  });

  // Submissions: copy the latest existing roster, reset status, refresh jumlah
  // for dosen whose bimbingan are tracked in master.
  const subsSnap = await getDocs(collection(db, 'submissions'));
  const latestByDosen = new Map<string, any>();
  subsSnap.docs.forEach((d) => {
    const s = d.data() as any;
    const prev = latestByDosen.get(s.dosenUid);
    if (!prev || String(s.periodeId).localeCompare(String(prev.periodeId)) > 0) {
      latestByDosen.set(s.dosenUid, s);
    }
  });
  latestByDosen.forEach((s, dosenUid) => {
    batch.set(doc(db, 'submissions', `${periode.id}_${dosenUid}`), {
      periodeId: periode.id,
      dosenUid,
      nama: s.nama,
      prodi: s.prodi,
      jumlah: perDosen.get(dosenUid) ?? s.jumlah,
      status: 'draft',
      catatanWadek: '',
    });
  });

  batch.update(doc(db, 'periode', periode.id), {
    status: 'dibuka',
    tanggalBuka: serverTimestamp(),
  });
  await batch.commit();
  return { generated, skipped };
}

// ─── D4: Riwayat lintas periode ─────────────────────────────────────────

/** All laporan rows for one mahasiswa across periodes (dosen-scoped query). */
export async function fetchRiwayatLaporan(
  npm: string,
  dosenUid?: string
): Promise<import('../types').RiwayatLaporanRow[]> {
  const db = getDbOrThrow();
  const q = dosenUid
    ? query(
        collection(db, 'laporan'),
        where('npm', '==', npm),
        where('dosenPaUid', '==', dosenUid)
      )
    : query(collection(db, 'laporan'), where('npm', '==', npm));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as any)
    .map((l) => ({
      periodeId: l.periodeId,
      semesterKe: l.semesterKe,
      status: l.status,
      jumlahKonsultasi: l.akademik?.konsultasi?.length ?? 0,
      ipKhs: l.akademik?.ipKhs ?? null,
      skripsiTahap: l.skripsi?.tahap ?? 'belum',
    }))
    .sort((a, b) => a.periodeId.localeCompare(b.periodeId));
}

// ─── W1: rekapCache (PRD §8) ─────────────────────────────────────────────
// Paket Firebase gratis (Spark) tidak mendukung Cloud Functions dengan
// trigger Firestore, jadi cache dihitung & ditulis oleh aplikasi sendiri
// (bukan Cloud Function terjadwal) setiap kali ada aksi yang mengubah data
// laporan (import, buka periode, verifikasi). Dashboard W1 membaca dokumen
// kecil ini alih-alih menghitung ulang ±1.500 record setiap kali dibuka.

export interface RekapCache {
  periodeId: string;
  aggregates: WadekAggregates;
  computedAt: unknown;
}

export async function fetchRekapCache(periodeId: string): Promise<RekapCache | null> {
  const db = getDbOrThrow();
  const snap = await getDoc(doc(db, 'rekapCache', periodeId));
  return snap.exists() ? (snap.data() as RekapCache) : null;
}

/**
 * Hitung ulang agregat fakultas dari seluruh record laporan periode ini dan
 * simpan ke rekapCache/{periodeId}. Hanya admin/wadek1 (lihat firestore.rules).
 */
export async function recomputeAndCacheRekap(periodeId: string): Promise<WadekAggregates> {
  const db = getDbOrThrow();
  const [records, roster] = await Promise.all([
    fetchMahasiswaRecords(periodeId),
    fetchDosenRoster(periodeId),
  ]);
  const namaByUid = new Map(roster.map((d) => [d.dosenUid, d.nama]));
  const aggregates = computeWadekAggregates(records, namaByUid);
  await setDoc(doc(db, 'rekapCache', periodeId), {
    periodeId,
    aggregates,
    computedAt: serverTimestamp(),
  });
  return aggregates;
}
