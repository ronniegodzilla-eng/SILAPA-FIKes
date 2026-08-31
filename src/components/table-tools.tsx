'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { colors } from '@/lib/theme';
import { Icon } from './ui';

/**
 * Peralatan tabel bersama: urut per kolom + paginasi + pencarian.
 *
 * SELURUHNYA di sisi klien — semua tabel di aplikasi ini memang sudah memegang
 * datanya di memori (data-context memuat sekali per sesi, bukan query
 * per-halaman ke Firestore), jadi paginasi server justru akan menambah bacaan
 * Firestore tanpa manfaat. Konsekuensinya: urut & cari berlaku pada SELURUH
 * data, bukan cuma baris yang sedang tampil di halaman aktif.
 */

/**
 * Tampilan tabel yang diingat saat pengguna berpindah halaman.
 *
 * Dosen PA mengurutkan daftar, melebarkannya jadi 100 baris, membuka form
 * seorang mahasiswa, lalu kembali — tanpa ini seluruh tampilan kembali ke
 * setelan awal dan harus disusun ulang setiap kali masuk-keluar form.
 *
 * Disimpan di sessionStorage, bukan localStorage: bertahan selama tab masih
 * terbuka (termasuk bila halaman dimuat ulang) lalu hilang sendiri saat tab
 * ditutup, sehingga sesi kerja berikutnya mulai dari tampilan bersih alih-alih
 * mewarisi filter berminggu-minggu lalu yang sudah dilupakan pemakainya.
 *
 * Aman dibaca di initializer useState: halaman aplikasi baru dirender setelah
 * autentikasi rampung di sisi klien (lihat (app)/layout.tsx), jadi tidak ada
 * render server yang bisa berbeda dari hasil pembacaan ini.
 */
const RUANG = 'silapa.tabel.';

function bacaSimpanan<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(RUANG + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback; // sessionStorage diblokir / isinya rusak — pakai setelan awal.
  }
}

function tulisSimpanan(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(RUANG + key, JSON.stringify(value));
  } catch {
    // Kuota penuh atau mode privat. Ini cuma kenyamanan tampilan — biarkan.
  }
}

/**
 * useState yang mengingat nilainya. `persistKey` kosong = perilaku useState
 * biasa, supaya tabel yang tidak perlu diingat tidak berubah sama sekali.
 */
export function usePersistedState<T>(persistKey: string | undefined, initial: T) {
  const [value, setValue] = useState<T>(() => (persistKey ? bacaSimpanan(persistKey, initial) : initial));
  useEffect(() => {
    if (persistKey) tulisSimpanan(persistKey, value);
  }, [persistKey, value]);
  return [value, setValue] as const;
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type SortDir = 'asc' | 'desc';

/** Nilai yang bisa diurutkan; null/undefined selalu dibuang ke bawah. */
export type SortValue = string | number | boolean | null | undefined;

function compareValues(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  // Sel kosong selalu di bawah, apa pun arah urutannya — supaya "urut IP"
  // tidak menaruh puluhan baris kosong di atas dan menyembunyikan datanya.
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });
}

export interface TableSort<K extends string> {
  sortKey: K | null;
  sortDir: SortDir;
  toggleSort: (key: K) => void;
  /** Terapkan urutan ke daftar baris (tidak memutasi input). */
  sortRows: <T>(rows: T[], get: (row: T, key: K) => SortValue) => T[];
  /** Tanda-tangan urutan saat ini — teruskan ke usePagination sebagai resetKey. */
  sortSig: string;
}

/**
 * State urut per kolom. Klik pertama = menaik, klik lagi = menurun, klik
 * ketiga = kembali ke urutan asli (mis. urutan NPM dari data layer).
 *
 * Isi `persistKey` agar urutan pilihan pengguna diingat saat ia meninggalkan
 * halaman dan kembali lagi (lihat usePersistedState).
 */
export function useTableSort<K extends string>(
  initialKey: K | null = null,
  persistKey?: string
): TableSort<K> {
  // Kunci dan arah disimpan sebagai satu nilai: keduanya selalu berubah
  // bersamaan, dan menyimpannya terpisah membuka celah tersimpan separuh.
  const [{ key: sortKey, dir: sortDir }, setSort] = usePersistedState<{ key: K | null; dir: SortDir }>(
    persistKey ? `${persistKey}.urut` : undefined,
    { key: initialKey, dir: 'asc' }
  );

  function toggleSort(key: K) {
    if (key !== sortKey) {
      setSort({ key, dir: 'asc' });
      return;
    }
    if (sortDir === 'asc') {
      setSort({ key, dir: 'desc' });
      return;
    }
    setSort({ key: null, dir: 'asc' });
  }

  function sortRows<T>(rows: T[], get: (row: T, key: K) => SortValue): T[] {
    if (!sortKey) return rows;
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(get(a, sortKey), get(b, sortKey)) * factor);
  }

  return { sortKey, sortDir, toggleSort, sortRows, sortSig: `${sortKey ?? ''}|${sortDir}` };
}

export interface Pagination<T> {
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  pageRows: T[];
  total: number;
  totalPages: number;
  /** Nomor baris pertama & terakhir yang tampil (1-based, untuk teks "X–Y dari Z"). */
  from: number;
  to: number;
}

/**
 * Potong daftar jadi satu halaman. Halaman otomatis balik ke 1 setiap kali
 * jumlah baris berubah (pencarian/filter diubah), ukuran halaman diganti, atau
 * `resetKey` berubah — tanpa itu pengguna bisa terdampar di halaman 7 yang
 * kosong setelah memfilter, atau tetap di halaman 61 setelah menekan "urut
 * nama A–Z" padahal yang ingin dilihat justru baris teratas.
 *
 * Isi `persistKey` agar nomor halaman dan jumlah baris per halaman diingat
 * ketika pengguna meninggalkan halaman lalu kembali (lihat usePersistedState).
 */
export function usePagination<T>(
  rows: T[],
  defaultSize: number = DEFAULT_PAGE_SIZE,
  resetKey?: string,
  persistKey?: string
): Pagination<T> {
  const [page, setPage] = usePersistedState(persistKey ? `${persistKey}.halaman` : undefined, 1);
  const [pageSize, setPageSizeRaw] = usePersistedState(
    persistKey ? `${persistKey}.perHalaman` : undefined,
    defaultSize
  );
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const sebelumnya = useRef<{ total: number; pageSize: number; resetKey?: string } | null>(null);
  useEffect(() => {
    const prev = sebelumnya.current;
    sebelumnya.current = { total, pageSize, resetKey };
    // Render pertama, dan saat data selesai dimuat (0 → sekian baris), bukan
    // perbuatan pengguna. Keduanya harus dilewati, jika tidak halaman yang
    // diingat dari kunjungan sebelumnya langsung dilempar balik ke 1 justru
    // pada saat hendak dipulihkan.
    if (prev === null || (prev.total === 0 && total > 0)) return;
    if (prev.total !== total || prev.pageSize !== pageSize || prev.resetKey !== resetKey) setPage(1);
  }, [total, pageSize, resetKey, setPage]);

  // Jaring pengaman bila jumlah baris menyusut tanpa memicu efek di atas.
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize]);

  function setPageSize(n: number) {
    setPageSizeRaw(n);
  }

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    pageRows,
    total,
    totalPages,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  };
}

/**
 * Header kolom yang bisa diklik untuk mengurutkan. Dipakai menggantikan <th>
 * biasa; `style` tetap diteruskan supaya tiap tabel bisa memakai gaya TH-nya
 * sendiri yang sudah ada.
 */
export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  style,
  align = 'left',
}: {
  label: string;
  /** Kunci kolom; kalau tidak diisi kolom ini tidak bisa diurutkan. */
  sortKey?: K;
  sort: TableSort<K>;
  style?: CSSProperties;
  align?: 'left' | 'right' | 'center';
}) {
  const active = !!sortKey && sort.sortKey === sortKey;
  const justify = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  if (!sortKey) return <th style={style}>{label}</th>;
  return (
    <th
      style={{ ...style, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => sort.toggleSort(sortKey)}
      title={active ? (sort.sortDir === 'asc' ? 'Urut menaik — klik untuk menurun' : 'Urut menurun — klik untuk kembali ke urutan asal') : `Urutkan menurut ${label}`}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: justify, width: '100%' }}>
        {label}
        <Icon
          path={active && sort.sortDir === 'desc' ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'}
          size={12}
          width={2.4}
          stroke={active ? colors.green : colors.faint}
          style={{ opacity: active ? 1 : 0.45 }}
        />
      </span>
    </th>
  );
}

/** Kotak pencarian standar untuk tabel yang belum punya. */
export function TableSearch({
  value,
  onChange,
  placeholder = 'Cari...',
  width = 260,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        flex: 1, minWidth: 180, maxWidth: width, padding: '9px 12px', borderRadius: 9,
        border: `1px solid ${colors.border}`, fontSize: 13, outline: 'none', background: colors.surface,
      }}
    />
  );
}

/**
 * Baris kontrol di bawah tabel: keterangan jumlah, pemilih baris/halaman,
 * dan navigasi halaman. Nomor halaman diringkas dengan elipsis agar 1.522
 * baris tidak menghasilkan 61 tombol.
 */
export function PaginationBar<T>({
  p,
  itemLabel = 'data',
  note,
}: {
  p: Pagination<T>;
  itemLabel?: string;
  note?: ReactNode;
}) {
  const pages = pageNumbers(p.page, p.totalPages);
  const btn = (extra?: CSSProperties): CSSProperties => ({
    minWidth: 32, padding: '6px 9px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
    border: `1px solid ${colors.border}`, background: colors.surface, color: colors.ink,
    cursor: 'pointer', ...extra,
  });
  const disabled: CSSProperties = { color: colors.faint, cursor: 'not-allowed', background: colors.subtle };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: colors.faint }}>
          {p.total === 0
            ? `Tidak ada ${itemLabel}.`
            : `Menampilkan ${p.from}–${p.to} dari ${p.total} ${itemLabel}.`}
          {note ? <> {note}</> : null}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.muted }}>
          Baris per halaman
          <select
            value={p.pageSize}
            onChange={(e) => p.setPageSize(Number(e.target.value))}
            style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 12.5, background: colors.surface, color: colors.ink }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={() => p.setPage(p.page - 1)}
            disabled={p.page <= 1}
            style={btn(p.page <= 1 ? disabled : undefined)}
            aria-label="Halaman sebelumnya"
          >
            ‹
          </button>
          {pages.map((n, i) =>
            n === null ? (
              <span key={`gap${i}`} style={{ fontSize: 12.5, color: colors.faint, padding: '0 2px' }}>…</span>
            ) : (
              <button
                key={n}
                onClick={() => p.setPage(n)}
                style={btn(
                  n === p.page
                    ? { background: colors.green, color: colors.white, border: `1px solid ${colors.green}` }
                    : undefined
                )}
              >
                {n}
              </button>
            )
          )}
          <button
            onClick={() => p.setPage(p.page + 1)}
            disabled={p.page >= p.totalPages}
            style={btn(p.page >= p.totalPages ? disabled : undefined)}
            aria-label="Halaman berikutnya"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

/** [1, …, 4, 5, 6, …, 61] — selalu tampilkan halaman pertama, terakhir, dan tetangga halaman aktif. */
function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push(null);
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push(null);
  out.push(total);
  return out;
}
