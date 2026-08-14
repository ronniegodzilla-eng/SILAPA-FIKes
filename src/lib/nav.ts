import { NAV_ICONS } from './theme';
import type { Role } from './types';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** extra routes that should also mark this item active */
  alsoActive?: string[];
}

export const NAV_CONFIG: Record<Role, NavItem[]> = {
  dosen_pa: [
    { href: '/dosen', label: 'Dashboard', icon: NAV_ICONS.dashboard },
    {
      href: '/dosen/bimbingan',
      label: 'Daftar Bimbingan',
      icon: NAV_ICONS.list,
      alsoActive: ['/dosen/bimbingan/', '/dosen/mahasiswa/'],
    },
  ],
  admin: [
    { href: '/admin/mahasiswa', label: 'Master Mahasiswa', icon: NAV_ICONS.database },
    { href: '/admin/import', label: 'Import Data', icon: NAV_ICONS.upload },
    { href: '/admin/plotting', label: 'Plotting Dosen PA', icon: NAV_ICONS.shuffle },
    { href: '/admin/periode', label: 'Kelola Periode', icon: NAV_ICONS.calendar },
    { href: '/admin/pengguna', label: 'Kelola Pengguna', icon: NAV_ICONS.users },
  ],
  wadek1: [
    { href: '/wadek', label: 'Dashboard Fakultas', icon: NAV_ICONS.gauge },
    { href: '/wadek/verifikasi', label: 'Verifikasi', icon: NAV_ICONS.check },
    { href: '/wadek/ekspor', label: 'Ekspor & Arsip', icon: NAV_ICONS.download },
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  dosen_pa: 'Menu Dosen PA',
  admin: 'Menu Admin Fakultas',
  wadek1: 'Menu Wakil Dekan I',
};

/** pathname → [title, subtitle] */
export const PAGE_TITLES: Record<string, [string, string]> = {
  '/dosen': ['Dashboard', 'Ringkasan bimbingan akademik Anda periode ini'],
  '/dosen/bimbingan': ['Daftar Bimbingan', 'Seluruh mahasiswa bimbingan pada periode aktif'],
  '/admin/mahasiswa': ['Master Mahasiswa', 'Kelola data induk mahasiswa fakultas'],
  '/admin/import': ['Import Data', 'Import massal mahasiswa baru dan nilai KRS/KHS'],
  '/admin/plotting': ['Plotting Dosen PA', 'Distribusi dan pemindahan bimbingan mahasiswa'],
  '/admin/periode': ['Kelola Periode', 'Buka dan tutup periode pelaporan'],
  '/admin/pengguna': ['Kelola Pengguna', 'Buat dan kelola akun dosen PA, admin, dan Wakil Dekan'],
  '/wadek': ['Dashboard Fakultas', 'Visibilitas real-time progres pelaporan 22 dosen PA'],
  '/wadek/verifikasi': ['Verifikasi Laporan', 'Terima atau kembalikan kiriman laporan dosen PA'],
  '/wadek/ekspor': ['Ekspor & Arsip', 'Unduh PDF per dosen, rekap Excel, dan arsip periode terkunci'],
  // Terbuka untuk semua peran — diakses lewat blok pengguna di bawah sidebar,
  // bukan lewat NAV_CONFIG yang dipisah per peran.
  '/profil': ['Profil Saya', 'Ubah data diri, foto, dan kata sandi akun Anda'],
};

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  if (item.alsoActive?.some((p) => pathname.startsWith(p))) return true;
  return false;
}
