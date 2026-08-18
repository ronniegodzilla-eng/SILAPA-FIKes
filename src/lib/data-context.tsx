'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth-context';
import { computeStatusPengisian } from './compute';
import * as data from './firestore/data';
import type {
  DosenRosterEntry,
  MahasiswaRecord,
  Periode,
  PeriodeHistoryEntry,
  PeriodeStatus,
  StatusKirim,
} from './types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface DataContextValue {
  loading: boolean;
  error: string | null;
  periode: Periode | null;
  periodeHistory: PeriodeHistoryEntry[];
  records: Record<string, MahasiswaRecord>;
  recordList: MahasiswaRecord[];
  dosenRoster: DosenRosterEntry[];
  /** Semua dosen PA yang boleh dijadikan tujuan plotting — roster periode ini
   * DITAMBAH akun ber-peran dosen_pa yang belum punya submission (dosen baru).
   * Hanya diisi untuk admin; peran lain tidak boleh membaca koleksi users. */
  dosenPaOptions: data.DosenPaOption[];
  saveStatus: SaveStatus;

  updateField: (npm: string, path: string, value: unknown) => void;
  addMahasiswa: (rec: MahasiswaRecord) => Promise<void>;
  checkNpmExists: (npm: string) => Promise<boolean>;
  editMahasiswaMaster: (
    npm: string,
    fields: { nama: string; prodi: string; kelas: string; angkatan: number }
  ) => Promise<void>;
  toggleNonaktif: (npm: string) => Promise<void>;
  /** Ajukan pengunduran diri (dosen PA / admin) — menunggu validasi Wakil Dekan I. */
  ajukanPengunduran: (npm: string, alasan: string) => Promise<void>;
  /** Tarik kembali pengajuan yang belum divalidasi. */
  batalkanPengunduran: (npm: string) => Promise<void>;

  setPeriodeStatus: (status: PeriodeStatus) => Promise<void>;
  submitDosenLaporan: (dosenNama: string) => Promise<void>;
  verifTerima: (dosenNama: string) => Promise<void>;
  verifKembalikan: (dosenNama: string, catatan: string) => Promise<void>;
  movePlotting: (
    npms: string[],
    targetDosenUid: string,
    alsoCurrentLaporan: boolean
  ) => Promise<void>;
  bukaPeriode: () => Promise<{ generated: number; skipped: number }>;
  buatPeriode: (tahunAkademik: string, semester: 'ganjil' | 'genap') => Promise<void>;
  importNilai: (rows: data.ImportNilaiRow[]) => Promise<{ committed: number; missing: string[] }>;
  importLengkap: (rows: data.ImportLengkapRow[]) => Promise<{ committed: number; missing: string[] }>;
  refreshRekapCache: () => Promise<import('./compute').WadekAggregates | null>;
  reload: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

function setDeep<T extends object>(obj: T, path: string, value: unknown): T {
  const clone = JSON.parse(JSON.stringify(obj));
  const parts = path.split('.');
  let cur: any = clone;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
  return clone;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { appUser, activeRole, configured } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periode, setPeriode] = useState<Periode | null>(null);
  const [periodeHistory, setPeriodeHistory] = useState<PeriodeHistoryEntry[]>([]);
  const [records, setRecords] = useState<Record<string, MahasiswaRecord>>({});
  const [dosenRoster, setDosenRoster] = useState<DosenRosterEntry[]>([]);
  const [dosenPaOptions, setDosenPaOptions] = useState<data.DosenPaOption[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  // Autosave (PRD §5.1, §8): debounce per field, retry dengan backoff, dan
  // status 'error' yang terlihat bila tetap gagal — data tidak boleh hilang
  // diam-diam saat dosen mengisi 60–76 mahasiswa.
  const pendingSaves = useRef(
    new Map<string, { rec: MahasiswaRecord; path: string; timer: ReturnType<typeof setTimeout> }>()
  );
  const periodeRef = useRef<Periode | null>(null);

  const load = useCallback(async () => {
    if (!configured || !appUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await data.fetchActivePeriode();
      setPeriode(p);
      // Akun multi-role: data yang dimuat mengikuti peran yang SEDANG AKTIF
      // ditampilkan (activeRole), bukan sekadar salah satu peran akun.
      const rosterOpts =
        activeRole === 'dosen_pa' ? { dosenUid: appUser.uid } : undefined;
      const [hist, roster] = await Promise.all([
        data.fetchPeriodeHistory(),
        p ? data.fetchDosenRoster(p.id, rosterOpts) : Promise.resolve([]),
      ]);
      setPeriodeHistory(hist);
      setDosenRoster(roster);
      // Daftar tujuan plotting menggabungkan roster dengan koleksi `users`,
      // yang hanya boleh dibaca admin/wadek — dan hanya admin yang memplot.
      setDosenPaOptions(p && activeRole === 'admin' ? await data.fetchDosenPaOptions(p.id) : []);

      let recs: MahasiswaRecord[] = [];
      if (p) {
        if (activeRole === 'dosen_pa') {
          recs = await data.fetchMahasiswaRecords(p.id, { dosenPaUid: appUser.uid });
        } else if (activeRole === 'admin') {
          recs = await data.fetchAllMahasiswaMaster();
        }
        // wadek1: TIDAK di-fetch di sini. Rekap fakultas (±1.500 record) datang
        // dari rekapCache (lihat refreshRekapCache/PRD §8); detail per-dosen di
        // halaman verifikasi memakai query terpisah yang dibatasi (scoped).
      }
      const map: Record<string, MahasiswaRecord> = {};
      recs.forEach((r) => (map[r.npm] = r));
      setRecords(map);
    } catch (e: any) {
      setError(e?.message ?? 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [appUser, activeRole, configured]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    periodeRef.current = periode;
  }, [periode]);

  const flushSave = useCallback(async (key: string) => {
    const entry = pendingSaves.current.get(key);
    const p = periodeRef.current;
    if (!entry || !p) return;
    pendingSaves.current.delete(key);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await data.persistMahasiswaField(p.id, entry.rec, entry.path);
        if (pendingSaves.current.size === 0) setSaveStatus('saved');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    setSaveStatus('error');
  }, []);

  const updateField = useCallback(
    (npm: string, path: string, value: unknown) => {
      setRecords((prev) => {
        const existing = prev[npm];
        if (!existing) return prev;
        let next = setDeep(existing, path, value);
        next = { ...next, statusPengisian: computeStatusPengisian(next) };
        // Debounce 1.2s per field — hanya nilai terakhir yang ditulis.
        const key = `${npm}|${path}`;
        const old = pendingSaves.current.get(key);
        if (old) clearTimeout(old.timer);
        const timer = setTimeout(() => flushSave(key), 1200);
        pendingSaves.current.set(key, { rec: next, path, timer });
        return { ...prev, [npm]: next };
      });
      setSaveStatus('saving');
    },
    [flushSave]
  );

  const addMahasiswa = useCallback(
    async (rec: MahasiswaRecord) => {
      if (periode) await data.createMahasiswaMaster(rec, periode.id);
      setRecords((prev) => ({ ...prev, [rec.npm]: rec }));
    },
    [periode]
  );

  const checkNpmExists = useCallback((npm: string) => data.npmExists(npm), []);

  const editMahasiswaMaster = useCallback(
    async (
      npm: string,
      fields: { nama: string; prodi: string; kelas: string; angkatan: number }
    ) => {
      await data.saveMahasiswaMasterEdit(npm, fields);
      setRecords((prev) =>
        prev[npm]
          ? {
              ...prev,
              [npm]: {
                ...prev[npm],
                nama: fields.nama,
                prodi: fields.prodi as MahasiswaRecord['prodi'],
                kelas: fields.kelas as MahasiswaRecord['kelas'],
                angkatan: fields.angkatan,
              },
            }
          : prev
      );
    },
    []
  );

  const toggleNonaktif = useCallback(async (npm: string) => {
    setRecords((prev) => {
      const rec = prev[npm];
      if (!rec) return prev;
      const nextStatus = rec.status === 'non_aktif' ? 'aktif' : 'non_aktif';
      data.setMahasiswaStatusGlobal(npm, nextStatus).catch(() => {});
      if (periode) {
        const next = { ...rec, status: nextStatus as MahasiswaRecord['status'] };
        // Admin's composed record lacks the laporan narrative fields, so a
        // statusPengisian recompute here would be wrong — write status only.
        data
          .persistMahasiswaField(periode.id, next, 'status', { skipStatusPengisian: true })
          .catch(() => {});
      }
      return { ...prev, [npm]: { ...rec, status: nextStatus as MahasiswaRecord['status'] } };
    });
  }, [periode]);

  // Pengunduran diri hanya DIAJUKAN dari sini; keputusannya ditulis Wakil
  // Dekan I lewat /api/pengunduran/validasi. Status lama disimpan di berkas
  // pengajuan supaya bisa dipulihkan persis bila ditolak.
  const ajukanPengunduran = useCallback(
    async (npm: string, alasan: string) => {
      if (!periode || !appUser) return;
      const rec = records[npm];
      if (!rec) return;
      const statusSebelum = rec.status;
      await data.ajukanPengunduranDiri(periode.id, npm, statusSebelum, alasan, {
        uid: appUser.uid,
        nama: appUser.nama,
      });
      setRecords((prev) => {
        const cur = prev[npm];
        if (!cur) return prev;
        return {
          ...prev,
          [npm]: {
            ...cur,
            status: 'mengundurkan_diri',
            pengunduran: {
              status: 'diajukan',
              statusSebelum,
              alasan,
              diajukanOlehUid: appUser.uid,
              diajukanOlehNama: appUser.nama,
              diajukanPada: new Date().toISOString(),
            },
          },
        };
      });
    },
    [periode, appUser, records]
  );

  const batalkanPengunduran = useCallback(
    async (npm: string) => {
      if (!periode) return;
      const rec = records[npm];
      if (!rec?.pengunduran) return;
      const kembali = rec.pengunduran.statusSebelum ?? 'aktif';
      await data.batalkanPengunduranDiri(periode.id, npm, kembali);
      setRecords((prev) => {
        const cur = prev[npm];
        if (!cur) return prev;
        return { ...prev, [npm]: { ...cur, status: kembali, pengunduran: null } };
      });
    },
    [periode, records]
  );

  const setPeriodeStatus = useCallback(
    async (status: PeriodeStatus) => {
      if (!periode) return;
      await data.updatePeriodeStatus(periode.id, status);
      setPeriode({ ...periode, status });
    },
    [periode]
  );

  const submitDosenLaporan = useCallback(
    async (dosenNama: string) => {
      if (!periode || !appUser) return;
      // Dosen targets their own submission by uid (Security Rules provability).
      await data.updateSubmissionStatus(periode.id, { dosenUid: appUser.uid }, 'dikirim');
      // Stempel submittedAt di tiap laporan (PRD §4.4) — non-fatal bila gagal.
      await data.markLaporanSubmitted(periode.id, appUser.uid).catch(() => {});
      setDosenRoster((prev) =>
        prev.map((d) => (d.nama === dosenNama ? { ...d, statusKirim: 'dikirim' } : d))
      );
    },
    [periode, appUser]
  );

  const verifTerima = useCallback(
    async (dosenNama: string) => {
      if (!periode) return;
      await data.updateSubmissionStatus(periode.id, { nama: dosenNama }, 'diverifikasi');
      setDosenRoster((prev) =>
        prev.map((d) => (d.nama === dosenNama ? { ...d, statusKirim: 'diverifikasi' } : d))
      );
      // Rekap fakultas (W1) tidak lagi akurat — recompute cache di latar belakang.
      data.recomputeAndCacheRekap(periode.id).catch(() => {});
    },
    [periode]
  );

  const verifKembalikan = useCallback(
    async (dosenNama: string, catatan: string) => {
      if (!periode) return;
      await data.updateSubmissionStatus(periode.id, { nama: dosenNama }, 'dikembalikan', catatan);
      setDosenRoster((prev) =>
        prev.map((d) => (d.nama === dosenNama ? { ...d, statusKirim: 'dikembalikan' } : d))
      );
      data.recomputeAndCacheRekap(periode.id).catch(() => {});
    },
    [periode]
  );

  const movePlotting = useCallback(
    async (npms: string[], targetDosenUid: string, alsoCurrentLaporan: boolean) => {
      if (!periode) return;
      // Count moves per source dosen so the distribution table stays correct.
      const deltaByUid = new Map<string, number>();
      npms.forEach((npm) => {
        const fromUid = records[npm]?.dosenPaUid ?? '';
        deltaByUid.set(fromUid, (deltaByUid.get(fromUid) ?? 0) - 1);
      });
      deltaByUid.set(targetDosenUid, (deltaByUid.get(targetDosenUid) ?? 0) + npms.length);

      await data.movePlottingMahasiswa(periode.id, npms, targetDosenUid, alsoCurrentLaporan);
      // Dipetakan lewat dosenPaOptions, bukan dosenRoster: dosen tujuan bisa
      // saja belum punya dokumen submissions (baru didaftarkan admin), dan
      // upsert-lah yang membuatkannya — kalau tidak, mahasiswa yang dipindah
      // tak pernah tampil di dashboard dosen itu.
      await Promise.all(
        dosenPaOptions
          .filter((d) => (deltaByUid.get(d.dosenUid) ?? 0) !== 0)
          .map((d) => data.upsertSubmissionJumlah(periode.id, d, deltaByUid.get(d.dosenUid)!))
      );
      setDosenRoster((prev) =>
        prev.map((d) =>
          deltaByUid.has(d.dosenUid)
            ? { ...d, jumlah: d.jumlah + (deltaByUid.get(d.dosenUid) ?? 0) }
            : d
        )
      );
      setDosenPaOptions((prev) =>
        prev.map((d) =>
          deltaByUid.has(d.dosenUid)
            ? {
                ...d,
                jumlah: d.jumlah + (deltaByUid.get(d.dosenUid) ?? 0),
                adaRoster: d.adaRoster || d.dosenUid === targetDosenUid,
              }
            : d
        )
      );
      setRecords((prev) => {
        const next = { ...prev };
        npms.forEach((npm) => {
          if (next[npm]) next[npm] = { ...next[npm], dosenPaUid: targetDosenUid };
        });
        return next;
      });
    },
    [periode, records, dosenPaOptions]
  );

  const bukaPeriode = useCallback(async () => {
    if (!periode) return { generated: 0, skipped: 0 };
    const res = await data.bukaPeriodeGenerate({
      id: periode.id,
      tahunAkademik: periode.tahunAkademik,
      semester: periode.semester,
    });
    setPeriode({ ...periode, status: 'dibuka' });
    data.recomputeAndCacheRekap(periode.id).catch(() => {});
    return res;
  }, [periode]);

  const buatPeriode = useCallback(
    async (tahunAkademik: string, semester: 'ganjil' | 'genap') => {
      const id = `${tahunAkademik.replace('/', '-')}-${semester}`;
      await data.createPeriode({ id, tahunAkademik, semester });
      setPeriode({ id, tahunAkademik, semester, status: 'draft' });
    },
    []
  );

  const importNilai = useCallback(
    async (rows: data.ImportNilaiRow[]) => {
      if (!periode) return { committed: 0, missing: rows.map((r) => r.npm) };
      const res = await data.commitImportNilai(periode.id, rows);
      if (res.committed > 0) data.recomputeAndCacheRekap(periode.id).catch(() => {});
      return res;
    },
    [periode]
  );

  const importLengkap = useCallback(
    async (rows: data.ImportLengkapRow[]) => {
      if (!periode) return { committed: 0, missing: rows.map((r) => r.npm) };
      return data.commitImportLengkap(periode.id, rows);
    },
    [periode]
  );

  const refreshRekapCache = useCallback(async () => {
    if (!periode) return null;
    return data.recomputeAndCacheRekap(periode.id);
  }, [periode]);

  const recordList = Object.values(records);

  return (
    <DataContext.Provider
      value={{
        loading,
        error,
        periode,
        periodeHistory,
        records,
        recordList,
        dosenRoster,
        dosenPaOptions,
        saveStatus,
        updateField,
        addMahasiswa,
        checkNpmExists,
        editMahasiswaMaster,
        toggleNonaktif,
        ajukanPengunduran,
        batalkanPengunduran,
        setPeriodeStatus,
        submitDosenLaporan,
        verifTerima,
        verifKembalikan,
        movePlotting,
        bukaPeriode,
        buatPeriode,
        importNilai,
        importLengkap,
        refreshRekapCache,
        reload: load,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
